import {Timestamp} from "firebase-admin/firestore";

export type SourceType =
  | "youtube"
  | "substack"
  | "podcast"
  | "article"
  | "twitter"
  | "github"
  | "pdf"
  | "other";

/** Confidence level for content extraction quality. */
export type ExtractionConfidence = "high" | "partial" | "none";

/** Metadata about how extraction went. */
export interface ExtractionMeta {
  wordCount: number;
  confidence: ExtractionConfidence;
  confidenceReason: string;
  durationSeconds?: number;
  expectedWordCount?: number;
  firstChars?: string;
  lastChars?: string;
}

/** What a processor returns before AI enrichment. */
export interface ExtractedContent {
  title: string;
  fullText: string;
  sourceType: SourceType;
  datePublished: Date | null;
  extractionMeta?: ExtractionMeta;
}

/** What the AI summariser returns. */
export interface AiEnrichment {
  summary: string;
  tags: string[];
  deeperScore: number;
}

/** The full Firestore document shape. */
export interface ContentDocument {
  title: string;
  sourceUrl: string;
  sourceType: SourceType;
  dateAdded: Timestamp;
  datePublished: Timestamp | null;
  summary: string;
  tags: string[];
  fullText: string;
  status: "queued" | "processed" | "digest_included" |
    "deep_dive_done" | "failed";
  deeperScore: number;
  notes: string;
  deepDive: string | null;
  failureReason?: string;
  extractionMeta?: ExtractionMeta;
}

/** A daily digest document. */
export interface DigestDocument {
  date: Timestamp;
  htmlContent: string;
  textContent: string;
  itemIds: string[];
  archivedItemIds: string[];
  nudgeItemId: string | null;
}

/** Summary of a content item for digest generation. */
export interface DigestItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  sourceType: SourceType;
  sourceUrl: string;
  deeperScore: number;
}
