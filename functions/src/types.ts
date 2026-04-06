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

/** What a processor returns before AI enrichment. */
export interface ExtractedContent {
  title: string;
  fullText: string;
  sourceType: SourceType;
  datePublished: Date | null;
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
