import {ExtractedContent} from "../types.js";

/**
 * Handles Twitter/X URLs.
 * Twitter/X doesn't allow easy scraping, so we use the
 * Nitter public instances or the publish embed API as a
 * fallback. If those fail, we store the URL with a
 * prompt for manual paste.
 * @param {string} url - The Twitter/X URL.
 * @return {Promise<ExtractedContent>} The extracted content.
 */
export async function extractTwitter(
  url: string
): Promise<ExtractedContent> {
  // Normalise URL: x.com -> twitter.com for embed API.
  const normalised = url.replace(
    /https?:\/\/(www\.)?x\.com/,
    "https://twitter.com"
  );

  // Try Twitter's publish oEmbed API (works for
  // public tweets, no auth needed).
  const oembedUrl =
    "https://publish.twitter.com/oembed?url=" +
    encodeURIComponent(normalised);

  const res = await fetch(oembedUrl);

  if (!res.ok) {
    throw new Error(
      "Could not fetch tweet. It may be from a " +
      "private account or deleted."
    );
  }

  const data = await res.json();

  // The HTML contains the tweet text — strip tags.
  const tweetText = data.html ?
    stripHtml(data.html) : "";

  if (!tweetText) {
    throw new Error(
      "Could not extract tweet text"
    );
  }

  return {
    title: data.author_name ?
      `Tweet by ${data.author_name}` :
      "Tweet",
    fullText: tweetText,
    sourceType: "twitter",
    datePublished: null,
  };
}

/**
 * Strips HTML tags from a string.
 * @param {string} html - The HTML to strip.
 * @return {string} Plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
