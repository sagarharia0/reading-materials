import Anthropic from "@anthropic-ai/sdk";
import {getModel} from "./models.js";

/* eslint-disable max-len */
const SYSTEM_PROMPT = [
  "You analyse a user's reading highlights to understand",
  "their learning patterns. You will receive a list of",
  "text passages the user highlighted while reading.",
  "Each highlight includes the exact text, surrounding",
  "context, the article title, and the source type.",
  "",
  "CRITICAL RULES:",
  "- ONLY identify interests and patterns that are",
  "  DIRECTLY evidenced by the highlighted text.",
  "- Do NOT hallucinate or infer interests beyond what",
  "  the highlights support.",
  "- If you only have a few highlights, say the profile",
  "  is preliminary and needs more data.",
  "- For each interest, cite the evidence count and give",
  "  one specific example highlight.",
  "- Be plain and direct. No hype.",
  "",
  "Return a JSON object with these fields:",
  "{",
  "  \"interests\": [",
  "    {",
  "      \"topic\": \"short topic name\",",
  "      \"strength\": \"strong | moderate | emerging\",",
  "      \"evidenceCount\": number,",
  "      \"exampleHighlight\": \"one representative quote\"",
  "    }",
  "  ],",
  "  \"knowledgeGaps\": [",
  "    {",
  "      \"topic\": \"what seems underexplored\",",
  "      \"signal\": \"why you think this is a gap\"",
  "    }",
  "  ],",
  "  \"patterns\": [",
  "    \"e.g. Tends to highlight practical how-to over theory\"",
  "  ],",
  "  \"rawSummary\": \"2-3 paragraph natural language summary",
  "    of this user's learning profile based on evidence\"",
  "}",
  "",
  "Return ONLY valid JSON, no markdown fencing.",
].join("\n");
/* eslint-enable max-len */

/** Shape of a highlight for analysis. */
export interface HighlightForAnalysis {
  highlightedText: string;
  surroundingContext: string;
  contentTitle: string;
  sourceType: string;
  section: string;
}

/** Shape of the AI-generated learning profile. */
export interface LearningProfileResult {
  interests: Array<{
    topic: string;
    strength: "strong" | "moderate" | "emerging";
    evidenceCount: number;
    exampleHighlight: string;
  }>;
  knowledgeGaps: Array<{
    topic: string;
    signal: string;
  }>;
  patterns: string[];
  rawSummary: string;
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
 * Analyses highlights to generate a learning profile.
 * @param {HighlightForAnalysis[]} highlights - All user highlights.
 * @return {Promise<LearningProfileResult>} The profile.
 */
export async function analyseLearningProfile(
  highlights: HighlightForAnalysis[]
): Promise<LearningProfileResult> {
  const anthropic = getClient();

  const items = highlights.map(function(h, i) {
    return [
      `[${i + 1}] Article: ${h.contentTitle}`,
      `    Source: ${h.sourceType} / ${h.section}`,
      `    Highlighted: "${h.highlightedText}"`,
      `    Context: "${h.surroundingContext}"`,
    ].join("\n");
  });

  const userContent =
    `${highlights.length} highlights to analyse:\n\n` +
    items.join("\n\n");

  const message = await anthropic.messages.create({
    model: getModel("learningProfile"),
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{role: "user", content: userContent}],
  });

  const responseText =
    message.content[0].type === "text" ?
      message.content[0].text : "";

  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return JSON.parse(cleaned);
}
