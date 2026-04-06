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
