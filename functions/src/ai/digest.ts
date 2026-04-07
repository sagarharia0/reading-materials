import Anthropic from "@anthropic-ai/sdk";
import {DigestItem} from "../types.js";

/* eslint-disable max-len */
const SYSTEM_PROMPT = [
  "You generate a daily reading digest for a Head of",
  "Product building AI literacy. Their interests:",
  "- AI model capabilities across providers (OpenAI,",
  "  Anthropic, Google, xAI, DeepSeek, Meta, Mistral)",
  "- Agent frameworks and applied AI",
  "- Product management and building with AI tools",
  "- Practical insights on when to use which tools",
  "",
  "TONE: Write like a sharp colleague giving a quick",
  "briefing. Plain, direct, human language. No hype,",
  "no marketing speak, no excitable adjectives like",
  "\"fascinating\", \"groundbreaking\", \"exciting\", or",
  "\"game-changing\". No forced enthusiasm. Just say",
  "what happened and why it matters. If something is",
  "genuinely significant, the facts speak for themselves.",
  "",
  "You will receive two lists of content items:",
  "1. NEW: items added since the last digest",
  "2. FROM THE ARCHIVE: older high-scoring items the",
  "   user hasn't engaged with yet",
  "",
  "Generate a digest that is a ~5 minute read.",
  "",
  "Structure (return as JSON):",
  "{",
  "  \"intro\": \"2-3 plain sentences on what's in this",
  "    batch and what connects them, if anything\",",
  "  \"sections\": [",
  "    {",
  "      \"theme\": \"short theme name\",",
  "      \"items\": [",
  "        {",
  "          \"id\": \"the item's id\",",
  "          \"headline\": \"clear one-line headline\",",
  "          \"whyItMatters\": \"1 sentence on why this",
  "            is relevant — be specific, not generic\"",
  "        }",
  "      ]",
  "    }",
  "  ],",
  "  \"archive\": [",
  "    {",
  "      \"id\": \"the item's id\",",
  "      \"headline\": \"clear headline\",",
  "      \"hook\": \"1 sentence on what's in it\"",
  "    }",
  "  ],",
  "  \"nudge\": {",
  "    \"id\": \"id of the one item to go deeper on\",",
  "    \"hook\": \"2 sentences on what you'd learn from",
  "      reading this properly — be concrete\"",
  "  }",
  "}",
  "",
  "Rules:",
  "- Group new items into 2-4 thematic sections",
  "- Only use information from the provided summaries",
  "- Do not add external knowledge or hallucinate details",
  "- Pick the nudge from the highest-scoring new item",
  "- If there are no new items, say so in the intro and",
  "  only include the archive section",
  "- Return ONLY valid JSON, no markdown fencing",
].join("\n");
/* eslint-enable max-len */

/** Shape of the AI-generated digest. */
export interface DigestAiResult {
  intro: string;
  sections: Array<{
    theme: string;
    items: Array<{
      id: string;
      headline: string;
      whyItMatters: string;
    }>;
  }>;
  archive: Array<{
    id: string;
    headline: string;
    hook: string;
  }>;
  nudge: {
    id: string;
    hook: string;
  } | null;
}

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
 * Generates a daily digest from content items.
 * @param {DigestItem[]} newItems - New items since last digest.
 * @param {DigestItem[]} archiveItems - Older unread items.
 * @param {string} learningProfile - Optional learning profile.
 * @return {Promise<DigestAiResult>} The generated digest.
 */
export async function generateDigestContent(
  newItems: DigestItem[],
  archiveItems: DigestItem[],
  learningProfile?: string
): Promise<DigestAiResult> {
  const anthropic = getClient();

  const newSection = newItems.length > 0 ?
    formatItems("NEW ITEMS", newItems) :
    "NEW ITEMS:\nNone today.";

  const archiveSection = archiveItems.length > 0 ?
    formatItems("FROM THE ARCHIVE", archiveItems) :
    "";

  const profileSection = learningProfile ?
    "\n\nUSER'S LEARNING PROFILE " +
    "(from their highlights — use to inform framing, " +
    "but do not fabricate connections):\n" +
    learningProfile :
    "";

  const userContent =
    `${newSection}\n\n${archiveSection}${profileSection}`
      .trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{role: "user", content: userContent}],
  });

  const responseText =
    message.content[0].type === "text" ?
      message.content[0].text : "";

  // Strip markdown fencing if present.
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return JSON.parse(cleaned);
}

/**
 * Formats a list of items for the prompt.
 * @param {string} heading - Section heading.
 * @param {DigestItem[]} items - The items to format.
 * @return {string} Formatted text.
 */
function formatItems(
  heading: string,
  items: DigestItem[]
): string {
  const lines = items.map((item) =>
    [
      `- ID: ${item.id}`,
      `  Title: ${item.title}`,
      `  Source: ${item.sourceType} | ${item.sourceUrl}`,
      `  Score: ${item.deeperScore}/5`,
      `  Tags: ${item.tags.join(", ")}`,
      `  Summary: ${item.summary}`,
    ].join("\n")
  );
  return `${heading}:\n${lines.join("\n\n")}`;
}
