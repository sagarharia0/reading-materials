import {
  ExtractedContent,
  ExtractionMeta,
} from "../types.js";

const MAX_TEXT_LENGTH = 100_000;

/**
 * Extracts transcript from a podcast episode URL.
 * Resolves the audio file URL, sends it to Deepgram
 * for transcription, and returns the text.
 * @param {string} url - The podcast episode URL.
 * @return {Promise<ExtractedContent>} The extracted content.
 */
export async function extractPodcast(
  url: string
): Promise<ExtractedContent> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPGRAM_API_KEY is not configured"
    );
  }

  // Try to find the audio URL from the page.
  const audioUrl = await findAudioUrl(url);
  if (!audioUrl) {
    throw new Error(
      "Could not find an audio file URL. " +
      "Try submitting the direct audio/RSS URL."
    );
  }

  // Get a title from the page if possible.
  const title = await fetchTitle(url);

  // Send to Deepgram for transcription.
  const transcript = await transcribeWithDeepgram(
    audioUrl, apiKey
  );

  if (!transcript || transcript.trim().length === 0) {
    throw new Error(
      "Deepgram returned an empty transcript"
    );
  }

  let fullText = transcript;
  if (fullText.length > MAX_TEXT_LENGTH) {
    fullText = fullText.substring(0, MAX_TEXT_LENGTH);
  }

  const wordCount = fullText.split(/\s+/)
    .filter((w) => w.length > 0).length;

  const meta: ExtractionMeta = {
    wordCount,
    confidence: wordCount > 100 ? "high" : "partial",
    confidenceReason:
      `Transcribed ${wordCount} words via Deepgram`,
  };

  return {
    title: title || "Podcast Episode",
    fullText,
    sourceType: "podcast",
    datePublished: null,
    extractionMeta: meta,
  };
}

/**
 * Attempts to find an audio URL from a podcast page.
 * Checks for direct audio URLs, then looks for
 * audio tags in the HTML.
 * @param {string} url - The podcast URL.
 * @return {Promise<string | null>} Audio URL or null.
 */
async function findAudioUrl(
  url: string
): Promise<string | null> {
  const lower = url.toLowerCase();

  // Direct audio file URL.
  if (lower.match(/\.(mp3|m4a|wav|ogg|aac)(\?|$)/)) {
    return url;
  }

  // Try fetching the page and looking for audio.
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Look for audio source in HTML.
    const audioMatch = html.match(
      /(?:src|href)=["'](https?:\/\/[^"']+\.(?:mp3|m4a|wav|ogg|aac)[^"']*)/i
    );
    if (audioMatch) return audioMatch[1];

    // Look for RSS enclosure-style URL.
    const encMatch = html.match(
      /enclosure[^>]+url=["'](https?:\/\/[^"']+)/i
    );
    if (encMatch) return encMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetches a title from the podcast page.
 * @param {string} url - The podcast URL.
 * @return {Promise<string | null>} Title or null.
 */
async function fetchTitle(
  url: string
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<title>([^<]+)<\/title>/i);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Sends an audio URL to Deepgram for transcription.
 * @param {string} audioUrl - URL of the audio file.
 * @param {string} apiKey - Deepgram API key.
 * @return {Promise<string>} The transcript text.
 */
async function transcribeWithDeepgram(
  audioUrl: string,
  apiKey: string
): Promise<string> {
  const dgUrl =
    "https://api.deepgram.com/v1/listen?" +
    "model=nova-3&smart_format=true&paragraphs=true";

  const res = await fetch(dgUrl, {
    method: "POST",
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({url: audioUrl}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Deepgram API error ${res.status}: ${body}`
    );
  }

  const data = await res.json();

  // Extract transcript from Deepgram response.
  const paragraphs =
    data?.results?.channels?.[0]
      ?.alternatives?.[0]?.paragraphs?.transcript;

  if (paragraphs) return paragraphs;

  // Fallback to plain transcript.
  const transcript =
    data?.results?.channels?.[0]
      ?.alternatives?.[0]?.transcript;

  return transcript || "";
}
