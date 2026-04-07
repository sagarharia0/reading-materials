import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";
import {
  analyseLearningProfile,
  HighlightForAnalysis,
} from "./ai/learningProfile.js";

const MIN_HIGHLIGHTS = 5;

/**
 * Reads all highlights and generates a learning profile.
 * Skips if fewer than MIN_HIGHLIGHTS exist.
 */
export async function handleGenerateLearningProfile(
): Promise<void> {
  const db = admin.firestore();

  const snap = await db.collection("highlights")
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  if (snap.size < MIN_HIGHLIGHTS) {
    logger.info(
      `Only ${snap.size} highlights — need at least ` +
      `${MIN_HIGHLIGHTS} to generate a profile.`
    );
    return;
  }

  const highlights: HighlightForAnalysis[] = [];
  snap.forEach(function(doc) {
    const d = doc.data();
    highlights.push({
      highlightedText: d.highlightedText || "",
      surroundingContext: d.surroundingContext || "",
      contentTitle: d.contentTitle || "Untitled",
      sourceType: d.sourceType || "article",
      section: d.section || "unknown",
    });
  });

  logger.info(
    `Analysing ${highlights.length} highlights`
  );

  const profile = await analyseLearningProfile(highlights);

  // Write to learningProfile/current (overwrite)
  await db.collection("learningProfile")
    .doc("current")
    .set({
      generatedAt: Timestamp.now(),
      highlightCount: highlights.length,
      interests: profile.interests || [],
      knowledgeGaps: profile.knowledgeGaps || [],
      patterns: profile.patterns || [],
      rawSummary: profile.rawSummary || "",
    });

  logger.info("Learning profile updated.");
}
