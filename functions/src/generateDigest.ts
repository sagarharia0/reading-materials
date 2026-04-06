import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";
import {
  generateDigestContent,
  DigestAiResult,
} from "./ai/digest.js";
import {DigestDocument, DigestItem} from "./types.js";

const MAX_NEW_ITEMS = 20;
const MAX_ARCHIVE_ITEMS = 3;
const ARCHIVE_MIN_SCORE = 4;

/**
 * Main handler for daily digest generation.
 * Can be called by the scheduler or manually via HTTP.
 */
export async function handleGenerateDigest(): Promise<void> {
  const db = admin.firestore();

  // 1. Find new processed items not yet in a digest.
  const newSnap = await db.collection("content")
    .where("status", "==", "processed")
    .orderBy("deeperScore", "desc")
    .limit(MAX_NEW_ITEMS)
    .get();

  const newItems: DigestItem[] = [];
  const newIds: string[] = [];

  newSnap.forEach((doc) => {
    const d = doc.data();
    newItems.push({
      id: doc.id,
      title: d.title || "Untitled",
      summary: d.summary || "",
      tags: d.tags || [],
      sourceType: d.sourceType || "article",
      sourceUrl: d.sourceUrl || "",
      deeperScore: d.deeperScore || 0,
    });
    newIds.push(doc.id);
  });

  // 2. Find older high-scoring items user hasn't
  //    engaged with (no notes, no deep dive).
  const archiveSnap = await db.collection("content")
    .where("status", "==", "digest_included")
    .where("deeperScore", ">=", ARCHIVE_MIN_SCORE)
    .orderBy("deeperScore", "desc")
    .limit(MAX_ARCHIVE_ITEMS * 3)
    .get();

  const archiveItems: DigestItem[] = [];
  const archiveIds: string[] = [];

  archiveSnap.forEach((doc) => {
    if (archiveItems.length >= MAX_ARCHIVE_ITEMS) return;
    const d = doc.data();
    // Only surface items user hasn't engaged with.
    if (d.notes || d.deepDive) return;
    archiveItems.push({
      id: doc.id,
      title: d.title || "Untitled",
      summary: d.summary || "",
      tags: d.tags || [],
      sourceType: d.sourceType || "article",
      sourceUrl: d.sourceUrl || "",
      deeperScore: d.deeperScore || 0,
    });
    archiveIds.push(doc.id);
  });

  if (newItems.length === 0 && archiveItems.length === 0) {
    logger.info("No items for digest, skipping.");
    return;
  }

  // 3. Generate digest via Claude.
  logger.info(
    `Generating digest: ${newItems.length} new, ` +
    `${archiveItems.length} archive`
  );

  const aiResult = await generateDigestContent(
    newItems,
    archiveItems
  );

  // 4. Build item lookup for links in the digest.
  const allItems = [...newItems, ...archiveItems];
  const itemMap = new Map<string, DigestItem>();
  for (const item of allItems) {
    itemMap.set(item.id, item);
  }

  // 5. Render to HTML and plain text.
  const htmlContent = renderDigestHtml(aiResult, itemMap);
  const textContent = renderDigestText(aiResult, itemMap);

  // 6. Store the digest.
  const digestDoc: DigestDocument = {
    date: Timestamp.now(),
    htmlContent,
    textContent,
    itemIds: newIds,
    archivedItemIds: archiveIds,
    nudgeItemId: aiResult.nudge?.id || null,
  };

  const digestRef =
    await db.collection("digests").add(digestDoc);
  logger.info(`Created digest ${digestRef.id}`);

  // 7. Mark new items as digest_included.
  const batch = db.batch();
  for (const id of newIds) {
    batch.update(
      db.collection("content").doc(id),
      {status: "digest_included"}
    );
  }
  await batch.commit();
  logger.info(
    `Marked ${newIds.length} items as digest_included`
  );

  // 8. Send email (if Brevo key is configured).
  try {
    await sendDigestEmail(htmlContent, textContent);
  } catch (err) {
    const msg = err instanceof Error ?
      err.message : String(err);
    logger.warn(`Email send failed: ${msg}`);
  }
}

/**
 * Renders a linked headline with source link.
 * @param {string} headline - The headline text.
 * @param {string} id - The item ID.
 * @param {Map<string, DigestItem>} itemMap - Item lookup.
 * @return {string} HTML for the headline.
 */
function renderHeadline(
  headline: string,
  id: string,
  itemMap: Map<string, DigestItem>
): string {
  const item = itemMap.get(id);
  const sourceUrl = item?.sourceUrl;
  let html = "<div class=\"digest-headline\">";
  html += "<a class=\"digest-link\" data-action=\"open\"" +
    ` data-id="${escHtml(id)}"` +
    ` href="#item-${escHtml(id)}">` +
    `${escHtml(headline)}</a>`;
  if (sourceUrl) {
    html += " <a class=\"digest-source-link\"" +
      ` href="${escHtml(sourceUrl)}"` +
      " target=\"_blank\">source</a>";
  }
  html += "</div>";
  return html;
}

/**
 * Renders the digest AI result as HTML.
 * @param {DigestAiResult} digest - The AI result.
 * @param {Map<string, DigestItem>} itemMap - Item lookup.
 * @return {string} HTML string.
 */
function renderDigestHtml(
  digest: DigestAiResult,
  itemMap: Map<string, DigestItem>
): string {
  let html = "";

  html += "<div class=\"digest-intro\">" +
    `${escHtml(digest.intro)}</div>`;
  html += "<hr class=\"divider-heavy\">";

  for (const section of digest.sections) {
    html += "<div class=\"digest-section\">";
    html += "<h3 class=\"digest-theme\">" +
      `${escHtml(section.theme)}</h3>`;
    for (const item of section.items) {
      html += "<div class=\"digest-item\">";
      html += renderHeadline(
        item.headline, item.id, itemMap
      );
      html += "<div class=\"digest-quote\">" +
        `${escHtml(item.whyItMatters)}</div>`;
      html += "</div>";
    }
    html += "</div>";
  }

  if (digest.archive && digest.archive.length > 0) {
    html += "<hr class=\"divider\">";
    html += "<div class=\"digest-section\">";
    html += "<h3 class=\"digest-theme\">" +
      "from the archive</h3>";
    for (const item of digest.archive) {
      html += "<div class=\"digest-item\">";
      html += renderHeadline(
        item.headline, item.id, itemMap
      );
      html += "<div class=\"digest-quote\">" +
        `${escHtml(item.hook)}</div>`;
      html += "</div>";
    }
    html += "</div>";
  }

  if (digest.nudge) {
    html += "<hr class=\"divider\">";
    html += "<div class=\"digest-section\">";
    html += "<h3 class=\"digest-theme\">" +
      "go deeper</h3>";
    html += renderHeadline(
      "Read this one properly",
      digest.nudge.id,
      itemMap
    );
    html += "<div class=\"digest-quote\">" +
      `${escHtml(digest.nudge.hook)}</div>`;
    html += "</div>";
  }

  return html;
}

/**
 * Renders the digest AI result as plain text.
 * @param {DigestAiResult} digest - The AI result.
 * @param {Map<string, DigestItem>} itemMap - Item lookup.
 * @return {string} Plain text string.
 */
function renderDigestText(
  digest: DigestAiResult,
  itemMap: Map<string, DigestItem>
): string {
  let text = "";

  text += digest.intro + "\n\n---\n\n";

  for (const section of digest.sections) {
    text += `## ${section.theme}\n\n`;
    for (const item of section.items) {
      const src = itemMap.get(item.id);
      text += `* ${item.headline}\n`;
      text += `  ${item.whyItMatters}\n`;
      if (src?.sourceUrl) {
        text += `  ${src.sourceUrl}\n`;
      }
      text += "\n";
    }
  }

  if (digest.archive && digest.archive.length > 0) {
    text += "---\n\n## From the archive\n\n";
    for (const item of digest.archive) {
      const src = itemMap.get(item.id);
      text += `* ${item.headline}\n`;
      text += `  ${item.hook}\n`;
      if (src?.sourceUrl) {
        text += `  ${src.sourceUrl}\n`;
      }
      text += "\n";
    }
  }

  if (digest.nudge) {
    text += "---\n\n## Go deeper\n\n";
    text += digest.nudge.hook + "\n";
    const src = itemMap.get(digest.nudge.id);
    if (src?.sourceUrl) {
      text += src.sourceUrl + "\n";
    }
  }

  return text;
}

/**
 * Sends the digest via Brevo transactional email.
 * @param {string} html - HTML digest content.
 * @param {string} text - Plain text digest content.
 */
async function sendDigestEmail(
  html: string,
  text: string
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    logger.info("No BREVO_API_KEY set, skipping email.");
    return;
  }

  const recipientEmail =
    process.env.DIGEST_EMAIL || "sagar.haria@gmail.com";

  const today = new Date().toISOString().split("T")[0];

  const res = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "reading-materials",
          email: recipientEmail,
        },
        to: [{email: recipientEmail}],
        subject: `Daily digest — ${today}`,
        htmlContent: wrapEmailHtml(html),
        textContent: text,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }

  logger.info("Digest email sent.");
}

/**
 * Wraps digest HTML in a simple email template.
 * @param {string} body - The digest HTML body.
 * @return {string} Full HTML email.
 */
function wrapEmailHtml(body: string): string {
  return [
    "<!DOCTYPE html>",
    "<html><head>",
    "<meta charset=\"utf-8\">",
    "<style>",
    "body { font-family: monospace; color: #e8e0d4;",
    "  background: #1a1a1a; padding: 20px;",
    "  max-width: 600px; margin: 0 auto; }",
    "h3 { color: #da7756; margin-top: 24px; }",
    "hr { border: none; border-top: 1px solid #3a3a3a;",
    "  margin: 20px 0; }",
    "strong { color: #e8e0d4; }",
    "em { color: #a89984; }",
    "p { line-height: 1.6; margin-bottom: 12px; }",
    "</style>",
    "</head><body>",
    body,
    "</body></html>",
  ].join("\n");
}

/**
 * Escapes HTML special characters.
 * @param {string} str - The string to escape.
 * @return {string} Escaped string.
 */
function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
