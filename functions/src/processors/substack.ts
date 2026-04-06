import {extract} from "@extractus/article-extractor";
import {ExtractedContent} from "../types.js";

const MAX_TEXT_LENGTH = 100_000;

/**
 * Extracts content from a Substack post URL.
 * Free posts work via article-extractor. Paid posts
 * behind a paywall will fail with a descriptive error.
 * @param {string} url - The Substack post URL.
 * @return {Promise<ExtractedContent>} The extracted content.
 */
export async function extractSubstack(
  url: string
): Promise<ExtractedContent> {
  const result = await extract(url);

  if (!result || !result.content) {
    throw new Error(
      "Could not extract Substack content from " +
      url + ". This may be a paid post behind a paywall."
    );
  }

  let fullText = stripHtml(result.content);

  if (fullText.length > MAX_TEXT_LENGTH) {
    fullText = fullText.substring(0, MAX_TEXT_LENGTH);
  }

  // Check if we got very little text — likely paywall.
  if (fullText.length < 200) {
    throw new Error(
      "Extracted text is very short — this is likely " +
      "a paid Substack post. Try forwarding the email " +
      "or pasting the content manually."
    );
  }

  return {
    title: result.title || "Untitled Substack Post",
    fullText,
    sourceType: "substack",
    datePublished: result.published ?
      new Date(result.published) : null,
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
