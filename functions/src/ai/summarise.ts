import Anthropic from "@anthropic-ai/sdk";
import {AiEnrichment} from "../types.js";

const MAX_INPUT_LENGTH = 80_000;

/* eslint-disable max-len */
const SYSTEM_PROMPT = [
  "You are a content summariser for a Head of Product",
  "who is building AI literacy. They care about:",
  "- AI developments, agent frameworks, applied AI",
  "- Product management and building with AI tools",
  "- Practical insights they can apply to their work",
  "",
  "Given an article title and text, return a JSON object",
  "with exactly these fields:",
  "- \"summary\": 2-3 sentence summary of the key insights",
  "- \"tags\": array of 3-7 lowercase tags",
  "- \"deeperScore\": integer 1-5 rating how relevant this",
  "  is to AI/product management (5=must read, 1=tangential)",
  "",
  "Return ONLY valid JSON, no markdown fencing, no extra text.",
].join("\n");
/* eslint-enable max-len */

let client: Anthropic | null = null;

/**
 * Returns a cached Anthropic client instance.
 * @return {Anthropic} The Anthropic SDK client.
 */
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Sends extracted content to Claude for summarisation.
 * @param {string} title - The article title.
 * @param {string} text - The extracted article text.
 * @param {string} sourceUrl - The original URL.
 * @return {Promise<AiEnrichment>} Summary, tags, and score.
 */
export async function summariseContent(
  title: string,
  text: string,
  sourceUrl: string
): Promise<AiEnrichment> {
  const truncatedText = text.length > MAX_INPUT_LENGTH ?
    text.substring(0, MAX_INPUT_LENGTH) :
    text;

  const anthropic = getClient();

  const userContent =
    `Title: ${title}\nSource: ${sourceUrl}\n\n${truncatedText}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{role: "user", content: userContent}],
  });

  const responseText = message.content[0].type === "text" ?
    message.content[0].text :
    "";

  const parsed = JSON.parse(responseText);

  return {
    summary: String(parsed.summary || ""),
    tags: Array.isArray(parsed.tags) ?
      parsed.tags.map((t: unknown) => String(t)) :
      [],
    deeperScore: Math.min(
      5, Math.max(1, Number(parsed.deeperScore) || 3)
    ),
  };
}
