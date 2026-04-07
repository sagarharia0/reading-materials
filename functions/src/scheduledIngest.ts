/* eslint-disable @typescript-eslint/no-var-requires */
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";
import {resolveSourceType} from "./resolver.js";
import {extractArticle} from "./processors/article.js";
import {extractYoutube} from "./processors/youtube.js";
import {extractPodcast} from "./processors/podcast.js";
import {extractSubstack} from "./processors/substack.js";
import {summariseContent} from "./ai/summarise.js";
import {ContentDocument, ExtractedContent, SourceType} from "./types.js";

// rss-parser is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RssParser = require("rss-parser");

interface FeedDoc {
  url: string;
  name: string;
  lastChecked: Timestamp | null;
}

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  enclosure?: { url?: string };
}

/**
 * Checks all monitored RSS feeds for new items.
 * For each new item, extracts content, summarises,
 * and stores in Firestore.
 */
export async function handleScheduledIngest(
): Promise<void> {
  const db = admin.firestore();
  const parser = new RssParser();

  const feedsSnap = await db.collection("feeds")
    .get();

  if (feedsSnap.empty) {
    logger.info("No RSS feeds configured.");
    return;
  }

  let totalNew = 0;

  for (const feedDoc of feedsSnap.docs) {
    const feed: FeedDoc = feedDoc.data() as FeedDoc;
    const lastChecked = feed.lastChecked ?
      feed.lastChecked.toDate() : new Date(0);

    try {
      logger.info(`Checking feed: ${feed.name}`);
      const rss = await parser.parseURL(feed.url);

      const newItems: RssItem[] = (rss.items || [])
        .filter(function(item: RssItem) {
          if (!item.link && !item.enclosure?.url) {
            return false;
          }
          if (!item.pubDate) return true;
          return new Date(item.pubDate) > lastChecked;
        })
        .slice(0, 10); // Max 10 new items per feed per check.

      for (const item of newItems) {
        const itemUrl = item.link ||
          item.enclosure?.url || "";
        if (!itemUrl) continue;

        // Skip if we already have this URL.
        const existing = await db.collection("content")
          .where("sourceUrl", "==", itemUrl)
          .limit(1)
          .get();
        if (!existing.empty) continue;

        try {
          await processRssItem(db, itemUrl, item);
          totalNew++;
        } catch (err) {
          const msg = err instanceof Error ?
            err.message : String(err);
          logger.warn(
            `Failed to process ${itemUrl}: ${msg}`
          );
        }
      }

      // Update lastChecked.
      await feedDoc.ref.update({
        lastChecked: Timestamp.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ?
        err.message : String(err);
      logger.error(
        `Error checking feed ${feed.name}: ${msg}`
      );
    }
  }

  logger.info(
    `Scheduled ingest complete: ${totalNew} new items`
  );
}

/**
 * Processes a single RSS item through the pipeline.
 * @param {admin.firestore.Firestore} db - Firestore ref.
 * @param {string} url - The item URL.
 * @param {RssItem} item - The RSS item data.
 */
async function processRssItem(
  db: admin.firestore.Firestore,
  url: string,
  item: RssItem
): Promise<void> {
  const sourceType = resolveSourceType(url);
  const now = Timestamp.now();

  // Queue the document first.
  const queuedDoc: ContentDocument = {
    title: item.title || "",
    sourceUrl: url,
    sourceType,
    dateAdded: now,
    datePublished: item.pubDate ?
      Timestamp.fromDate(new Date(item.pubDate)) : null,
    summary: "",
    tags: [],
    fullText: "",
    status: "queued",
    deeperScore: 0,
    notes: "",
    deepDive: null,
  };

  const docRef =
    await db.collection("content").add(queuedDoc);

  // Extract content.
  const extracted = await extractByType(sourceType, url);

  const hasContent = extracted.fullText.length > 0;

  let enrichment = {
    summary: "", tags: [] as string[], deeperScore: 0,
  };
  if (hasContent) {
    enrichment = await summariseContent(
      extracted.title,
      extracted.fullText,
      url
    );
  }

  await docRef.update({
    title: extracted.title || item.title || "Untitled",
    fullText: extracted.fullText,
    summary: hasContent ? enrichment.summary :
      "Could not extract content.",
    tags: enrichment.tags,
    deeperScore: enrichment.deeperScore,
    status: "processed",
    extractionMeta: extracted.extractionMeta || null,
  });

  logger.info(`Ingested: ${extracted.title || url}`);
}

/**
 * Routes to the correct extractor.
 * @param {SourceType} sourceType - The source type.
 * @param {string} url - The URL to extract.
 * @return {Promise<ExtractedContent>} Extracted content.
 */
async function extractByType(
  sourceType: SourceType,
  url: string
): Promise<ExtractedContent> {
  switch (sourceType) {
  case "youtube":
    return extractYoutube(url);
  case "substack":
    return extractSubstack(url);
  case "podcast":
    return extractPodcast(url);
  default:
    return extractArticle(url);
  }
}
