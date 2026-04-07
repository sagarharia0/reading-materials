import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {Request} from "firebase-functions/v2/https";
import {Response} from "express";
import {Timestamp} from "firebase-admin/firestore";
import {resolveSourceType} from "./resolver.js";
import {extractArticle} from "./processors/article.js";
import {extractYoutube} from "./processors/youtube.js";
import {extractGithub} from "./processors/github.js";
import {extractPdf} from "./processors/pdf.js";
import {extractTwitter} from "./processors/twitter.js";
import {extractSubstack} from "./processors/substack.js";
import {extractPodcast} from "./processors/podcast.js";
import {summariseContent} from "./ai/summarise.js";
import {
  ContentDocument, ExtractedContent,
  ExtractionMeta, SourceType,
} from "./types.js";

/**
 * Routes to the correct processor for a given source type.
 * @param {SourceType} sourceType - The detected source type.
 * @param {string} url - The URL to process.
 * @return {Promise<ExtractedContent>} Extracted content.
 */
async function extractContent(
  sourceType: SourceType,
  url: string
): Promise<ExtractedContent> {
  switch (sourceType) {
  case "youtube":
    return extractYoutube(url);
  case "substack":
    return extractSubstack(url);
  case "github":
    return extractGithub(url);
  case "pdf":
    return extractPdf(url);
  case "twitter":
    return extractTwitter(url);
  case "podcast":
    return extractPodcast(url);
  default:
    return extractArticle(url);
  }
}

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

  const db = admin.firestore();
  const now = Timestamp.now();

  // Write a queued document so the URL is never lost.
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

  const docRef =
    await db.collection("content").add(queuedDoc);
  logger.info(
    `Queued document ${docRef.id} for ${url}`
  );

  try {
    const extracted = await extractContent(sourceType, url);

    // If extraction returned no text (e.g. YouTube with
    // no captions), still save the item but skip AI
    // enrichment — the user can watch and take notes.
    const hasContent = extracted.fullText.length > 0;

    let enrichment = {summary: "", tags: [] as string[], deeperScore: 0};
    if (hasContent) {
      enrichment = await summariseContent(
        extracted.title,
        extracted.fullText,
        url
      );
    }

    const extractionMeta: ExtractionMeta | undefined =
      extracted.extractionMeta;

    const update: Partial<ContentDocument> = {
      title: extracted.title,
      fullText: extracted.fullText,
      datePublished: extracted.datePublished ?
        Timestamp.fromDate(extracted.datePublished) :
        null,
      summary: hasContent ?
        enrichment.summary :
        "No transcript available — watch the video " +
        "and add your own notes.",
      tags: enrichment.tags,
      deeperScore: enrichment.deeperScore,
      status: "processed",
      extractionMeta,
    };

    await docRef.update(update);
    logger.info(
      `Processed document ${docRef.id}` +
      (extractionMeta ?
        ` (confidence: ${extractionMeta.confidence})` : "")
    );

    res.status(200).json({
      id: docRef.id,
      status: "processed",
      title: extracted.title,
      summary: update.summary,
      tags: enrichment.tags,
      deeperScore: enrichment.deeperScore,
      extractionConfidence: extractionMeta?.confidence,
    });
  } catch (err) {
    const message = err instanceof Error ?
      err.message : String(err);
    logger.error(
      `Failed to process ${url}: ${message}`
    );

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
