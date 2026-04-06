import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {Request} from "firebase-functions/v2/https";
import {Response} from "express";
import {Timestamp} from "firebase-admin/firestore";
import {resolveSourceType} from "./resolver.js";
import {extractArticle} from "./processors/article.js";
import {summariseContent} from "./ai/summarise.js";
import {ContentDocument} from "./types.js";

const SUPPORTED_TYPES = new Set([
  "article", "substack", "other",
]);

/**
 * Handles the processUrl HTTP request.
 * @param {Request} req - The incoming HTTP request.
 * @param {Response} res - The HTTP response.
 */
export async function handleProcessUrl(
  req: Request,
  res: Response
): Promise<void> {
  if (req.method !== "POST") {
    res.status(400).json({
      error: "Only POST requests are accepted",
    });
    return;
  }

  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    res.status(400).json({
      error: "Missing or invalid 'url' in request body",
    });
    return;
  }

  const sourceType = resolveSourceType(url);

  if (!SUPPORTED_TYPES.has(sourceType)) {
    res.status(400).json({
      error: `Source type "${sourceType}" is not yet supported`,
    });
    return;
  }

  const db = admin.firestore();
  const now = Timestamp.now();

  // Write a queued document immediately so the URL is never lost.
  const queuedDoc: ContentDocument = {
    title: "",
    sourceUrl: url,
    sourceType,
    dateAdded: now,
    datePublished: null,
    summary: "",
    tags: [],
    fullText: "",
    status: "queued",
    deeperScore: 0,
    notes: "",
    deepDive: null,
  };

  const docRef = await db.collection("content").add(queuedDoc);
  logger.info(`Queued document ${docRef.id} for ${url}`);

  try {
    const extracted = await extractArticle(url);

    const enrichment = await summariseContent(
      extracted.title,
      extracted.fullText,
      url
    );

    const update: Partial<ContentDocument> = {
      title: extracted.title,
      fullText: extracted.fullText,
      datePublished: extracted.datePublished ?
        Timestamp.fromDate(extracted.datePublished) :
        null,
      summary: enrichment.summary,
      tags: enrichment.tags,
      deeperScore: enrichment.deeperScore,
      status: "processed",
    };

    await docRef.update(update);
    logger.info(`Processed document ${docRef.id}`);

    res.status(200).json({
      id: docRef.id,
      status: "processed",
      title: extracted.title,
      summary: enrichment.summary,
      tags: enrichment.tags,
      deeperScore: enrichment.deeperScore,
    });
  } catch (err) {
    const message = err instanceof Error ?
      err.message : String(err);
    logger.error(`Failed to process ${url}: ${message}`);

    await docRef.update({
      status: "failed",
      failureReason: message,
    });

    res.status(200).json({
      id: docRef.id,
      status: "failed",
      error: message,
    });
  }
}
