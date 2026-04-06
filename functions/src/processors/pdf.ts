/* eslint-disable @typescript-eslint/no-var-requires */
import {ExtractedContent} from "../types.js";

// pdf-parse v1 is a CommonJS module without type defs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

const MAX_TEXT_LENGTH = 100_000;

interface PdfResult {
  numpages: number;
  text: string;
  info: {
    Title?: string;
    CreationDate?: string;
  };
}

/**
 * Extracts text content from a PDF URL.
 * Downloads the PDF and parses it with pdf-parse.
 * @param {string} url - The URL to a PDF file.
 * @return {Promise<ExtractedContent>} The extracted content.
 */
export async function extractPdf(
  url: string
): Promise<ExtractedContent> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to download PDF: HTTP ${res.status}`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const data: PdfResult = await pdfParse(buffer);

  if (!data.text || data.text.trim().length === 0) {
    throw new Error(
      "Could not extract text from PDF " +
      "(may be scanned/image-only)"
    );
  }

  let fullText = data.text
    .replace(/\s+/g, " ")
    .trim();

  if (fullText.length > MAX_TEXT_LENGTH) {
    fullText = fullText.substring(0, MAX_TEXT_LENGTH);
  }

  const title = data.info?.Title ||
    extractTitleFromUrl(url);

  return {
    title: data.numpages ?
      `${title} (${data.numpages} pages)` : title,
    fullText,
    sourceType: "pdf",
    datePublished: data.info?.CreationDate ?
      parsePdfDate(data.info.CreationDate) : null,
  };
}

/**
 * Extracts a filename-based title from the URL.
 * @param {string} url - The PDF URL.
 * @return {string} A title derived from the filename.
 */
function extractTitleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename =
      pathname.split("/").pop() || "document";
    return decodeURIComponent(
      filename
        .replace(/\.pdf$/i, "")
        .replace(/[-_]/g, " ")
    );
  } catch {
    return "PDF Document";
  }
}

/**
 * Parses a PDF date string (D:YYYYMMDDHHmmSS).
 * @param {string} dateStr - The PDF date string.
 * @return {Date | null} Parsed date or null.
 */
function parsePdfDate(dateStr: string): Date | null {
  try {
    const cleaned = dateStr
      .replace(/^D:/, "")
      .replace(/'/g, "");
    const year = cleaned.substring(0, 4);
    const month = cleaned.substring(4, 6) || "01";
    const day = cleaned.substring(6, 8) || "01";
    return new Date(`${year}-${month}-${day}`);
  } catch {
    return null;
  }
}
