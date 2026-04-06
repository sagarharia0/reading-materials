import {extract} from "@extractus/article-extractor";
import {ExtractedContent} from "../types.js";

const MAX_TEXT_LENGTH = 100_000;

/**
 * Fetches a URL and extracts the article title and body text.
 * Works for generic web pages, blogs, and free Substacks.
 * @param {string} url - The URL to extract content from.
 * @return {Promise<ExtractedContent>} The extracted content.
 */
export async function extractArticle(
  url: string
): Promise<ExtractedContent> {
  const result = await extract(url);

  if (!result || !result.content) {
    throw new Error(
      `Could not extract article content from ${url}`
    );
  }

  let fullText = stripHtml(result.content);

  if (fullText.length > MAX_TEXT_LENGTH) {
    fullText = fullText.substring(0, MAX_TEXT_LENGTH);
  }

  return {
    title: result.title || "Untitled",
    fullText,
    sourceType: "article",
    datePublished: result.published ?
      new Date(result.published) : null,
  };
}

/**
 * Strips HTML tags from a string.
 * @param {string} html - The HTML string to strip.
 * @return {string} Plain text with tags removed.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
