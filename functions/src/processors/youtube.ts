import {
  ExtractedContent,
  ExtractionMeta,
  ExtractionConfidence,
} from "../types.js";

const WORDS_PER_MINUTE = 150;

const MAX_TEXT_LENGTH = 100_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";
const ANDROID_UA =
  "com.google.android.youtube/20.10.38 " +
  "(Linux; U; Android 14)";

/**
 * Extracts transcript from a YouTube video URL.
 * @param {string} url - The YouTube URL.
 * @return {Promise<ExtractedContent>} The extracted content.
 */
export async function extractYoutube(
  url: string
): Promise<ExtractedContent> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error(
      "Could not extract video ID from URL"
    );
  }

  const title = await fetchTitle(videoId);

  // Try InnerTube API first, fall back to web page.
  // Also capture video duration from the InnerTube response.
  let transcript: string | null = null;
  let durationSeconds: number | null = null;

  const innerTubeResult =
    await fetchViaInnerTubeWithMeta(videoId);
  transcript = innerTubeResult.transcript;
  durationSeconds = innerTubeResult.durationSeconds;

  if (!transcript) {
    transcript = await fetchViaWebPage(videoId);
  }

  // Build extraction metadata.
  const meta = buildExtractionMeta(
    transcript, durationSeconds
  );

  // For "none" confidence, still return successfully
  // but with empty text — the item is kept for manual
  // note-taking and watching in-app.
  if (!transcript) {
    return {
      title,
      fullText: "",
      sourceType: "youtube",
      datePublished: null,
      extractionMeta: meta,
    };
  }

  if (transcript.length > MAX_TEXT_LENGTH) {
    transcript = transcript.substring(0, MAX_TEXT_LENGTH);
  }

  return {
    title,
    fullText: transcript,
    sourceType: "youtube",
    datePublished: null,
    extractionMeta: meta,
  };
}

/**
 * Computes extraction confidence by comparing actual
 * word count against expected words from video duration.
 * @param {string | null} transcript - The transcript text.
 * @param {number | null} duration - Video length in seconds.
 * @return {ExtractionMeta} Extraction quality metadata.
 */
function buildExtractionMeta(
  transcript: string | null,
  duration: number | null
): ExtractionMeta {
  const wordCount = transcript ?
    transcript.split(/\s+/).filter((w) => w.length > 0).length :
    0;

  const expectedWordCount = duration ?
    Math.round((duration / 60) * WORDS_PER_MINUTE) :
    undefined;

  if (!transcript || wordCount === 0) {
    return {
      wordCount: 0,
      confidence: "none" as ExtractionConfidence,
      confidenceReason:
        "No transcript available — auto-captions " +
        "may be disabled for this video",
      durationSeconds: duration || undefined,
      expectedWordCount,
    };
  }

  if (expectedWordCount) {
    const ratio = wordCount / expectedWordCount;
    if (ratio >= 0.7) {
      return {
        wordCount,
        confidence: "high",
        confidenceReason:
          "Transcript has " + wordCount +
          " words, expected ~" +
          expectedWordCount + " from " +
          Math.round((duration || 0) / 60) +
          "min video",
        durationSeconds: duration || undefined,
        expectedWordCount,
      };
    }
    if (ratio >= 0.3) {
      return {
        wordCount,
        confidence: "partial",
        confidenceReason:
          "Transcript has " + wordCount +
          " words but expected ~" +
          expectedWordCount +
          " — may be incomplete or " +
          "partially auto-generated",
        durationSeconds: duration || undefined,
        expectedWordCount,
      };
    }
    return {
      wordCount,
      confidence: "partial",
      confidenceReason:
        "Transcript has only " + wordCount +
        " words vs expected ~" +
        expectedWordCount +
        " — likely incomplete, " +
        "consider watching the video",
      durationSeconds: duration || undefined,
      expectedWordCount,
    };
  }

  // No duration info — judge on word count alone.
  if (wordCount < 50) {
    return {
      wordCount,
      confidence: "partial",
      confidenceReason:
        "Very short transcript (" +
        wordCount + " words) — may be " +
        "incomplete",
    };
  }

  return {
    wordCount,
    confidence: "high",
    confidenceReason:
      "Transcript extracted (" +
      wordCount + " words)",
  };
}

/**
 * Extracts video ID from various YouTube URL formats.
 * @param {string} url - The YouTube URL.
 * @return {string | null} The video ID or null.
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
    /youtube\.com\/shorts\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetches the video title via YouTube oEmbed.
 * @param {string} videoId - The YouTube video ID.
 * @return {Promise<string>} The video title.
 */
async function fetchTitle(
  videoId: string
): Promise<string> {
  const oembedUrl =
    "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    );
  try {
    const res = await fetch(oembedUrl);
    if (!res.ok) return "Untitled YouTube Video";
    const data = await res.json();
    return data.title || "Untitled YouTube Video";
  } catch {
    return "Untitled YouTube Video";
  }
}

/**
 * Fetches transcript and duration via InnerTube.
 * @param {string} videoId - The YouTube video ID.
 * @return {Promise<object>} transcript and duration.
 */
async function fetchViaInnerTubeWithMeta(
  videoId: string
): Promise<{
  transcript: string | null;
  durationSeconds: number | null;
}> {
  try {
    const playerUrl =
      "https://www.youtube.com/youtubei/v1/player" +
      "?prettyPrint=false";
    const res = await fetch(playerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_UA,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
          },
        },
        videoId,
      }),
    });
    if (!res.ok) return {transcript: null, durationSeconds: null};

    const data = await res.json();

    // Extract duration from videoDetails.
    const lengthStr =
      data?.videoDetails?.lengthSeconds;
    const durationSeconds = lengthStr ?
      parseInt(lengthStr, 10) : null;

    const tracks = data?.captions
      ?.playerCaptionsTracklistRenderer
      ?.captionTracks;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return {transcript: null, durationSeconds};
    }

    const transcript =
      await fetchTranscriptFromUrl(tracks[0].baseUrl);
    return {transcript, durationSeconds};
  } catch {
    return {transcript: null, durationSeconds: null};
  }
}

/**
 * Fetches transcript by parsing the YouTube web page.
 * @param {string} videoId - The YouTube video ID.
 * @return {Promise<string | null>} Transcript or null.
 */
async function fetchViaWebPage(
  videoId: string
): Promise<string | null> {
  try {
    const pageUrl =
      `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extract captionTracks from page data.
    const match = html.match(
      /"captionTracks":(\[.*?\])/
    );
    if (!match) return null;

    const tracks = JSON.parse(match[1]);
    if (!tracks || tracks.length === 0) return null;

    return fetchTranscriptFromUrl(tracks[0].baseUrl);
  } catch {
    return null;
  }
}

/**
 * Fetches and parses XML transcript from a caption URL.
 * @param {string} captionUrl - The caption track URL.
 * @return {Promise<string | null>} Transcript text.
 */
async function fetchTranscriptFromUrl(
  captionUrl: string
): Promise<string | null> {
  try {
    const url = captionUrl.replace(/\\u0026/g, "&");
    const res = await fetch(url, {
      headers: {"User-Agent": USER_AGENT},
    });
    if (!res.ok) return null;

    const xml = await res.text();
    return parseTranscriptXml(xml);
  } catch {
    return null;
  }
}

/**
 * Parses transcript XML into plain text.
 * @param {string} xml - The XML transcript content.
 * @return {string | null} Plain text transcript.
 */
function parseTranscriptXml(
  xml: string
): string | null {
  // Match both <text> and <p> formats.
  const textPattern =
    /<(?:text|p)[^>]*>([\s\S]*?)<\/(?:text|p)>/g;
  const segments: string[] = [];
  let match;

  while ((match = textPattern.exec(xml)) !== null) {
    const text = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g,
        (_, hex) =>
          String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g,
        (_, dec) =>
          String.fromCodePoint(parseInt(dec, 10)))
      .replace(/\s+/g, " ")
      .trim();

    if (text.length > 0) {
      segments.push(text);
    }
  }

  if (segments.length === 0) return null;
  return segments.join(" ");
}
