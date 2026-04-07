import {extract} from "@extractus/article-extractor";
import {
  ExtractedContent,
  ExtractionMeta,
  ExtractionConfidence,
} from "../types.js";

const MAX_TEXT_LENGTH = 100_000;
const BOILERPLATE_SIGNALS = [
  "cookie", "privacy policy", "subscribe",
  "sign up for", "accept all", "manage preferences",
  "terms of service", "©",
];
const MIN_WORD_COUNT = 30;

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

  const meta = validateExtraction(fullText);

  return {
    title: result.title || "Untitled",
    fullText,
    sourceType: "article",
    datePublished: result.published ?
      new Date(result.published) : null,
    extractionMeta: meta,
  };
}

/**
 * Validates extraction quality by checking word count,
 * and scanning first/last segments for boilerplate.
 * @param {string} text - The extracted plain text.
 * @return {ExtractionMeta} Quality metadata.
 */
function validateExtraction(text: string): ExtractionMeta {
  const words =
    text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const firstChars = text.substring(0, 150).trim();
  const lastChars = text.substring(
    Math.max(0, text.length - 150)
  ).trim();

  const reasons: string[] = [];
  let confidence: ExtractionConfidence = "high";

  // Check minimum length.
  if (wordCount < MIN_WORD_COUNT) {
    confidence = "partial";
    reasons.push(
      "Only " + wordCount + " words extracted " +
      "— may be paywalled or JS-rendered"
    );
  }

  // Check first segment for boilerplate.
  const firstLower = firstChars.toLowerCase();
  const firstBoilerplate = BOILERPLATE_SIGNALS.filter(
    (s) => firstLower.includes(s)
  );
  if (firstBoilerplate.length > 0) {
    confidence = "partial";
    reasons.push(
      "Start of text contains boilerplate " +
      "(\"" + firstBoilerplate[0] + "\") — " +
      "extraction may have captured " +
      "nav/header content"
    );
  }

  // Check last segment for boilerplate.
  const lastLower = lastChars.toLowerCase();
  const lastBoilerplate = BOILERPLATE_SIGNALS.filter(
    (s) => lastLower.includes(s)
  );
  if (lastBoilerplate.length > 0) {
    if (confidence === "high") confidence = "high";
    reasons.push(
      "End of text contains boilerplate " +
      "(\"" + lastBoilerplate[0] + "\") — " +
      "footer content may have been included"
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      "Extracted " + wordCount + " words, " +
      "start and end look clean"
    );
  }

  return {
    wordCount,
    confidence,
    confidenceReason: reasons.join(". "),
    firstChars,
    lastChars,
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
