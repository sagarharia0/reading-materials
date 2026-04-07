/**
 * Centralised model configuration for all AI stages.
 *
 * Each stage can use a different model. Defaults are set
 * here and can be overridden via environment variables:
 *   MODEL_SUMMARISE, MODEL_DIGEST, MODEL_DEEP_DIVE,
 *   MODEL_LEARNING_PROFILE
 *
 * This avoids hardcoding model IDs across multiple files
 * and makes it easy to experiment with different models
 * per stage without rewriting code.
 */

/** Available stages that use Claude. */
export type AiStage =
  | "summarise"
  | "digest"
  | "deepDive"
  | "learningProfile";

/**
 * Default model for each stage.
 * Rationale:
 * - summarise: Sonnet — runs on every URL, needs speed + cost balance
 * - digest: Sonnet — daily, writing quality is solid
 * - deepDive: Sonnet — on-demand, good enough for single-item analysis
 * - learningProfile: Opus — runs rarely, needs nuanced pattern
 *   recognition across many highlights, quality matters most here
 */
const DEFAULTS: Record<AiStage, string> = {
  summarise: "claude-sonnet-4-20250514",
  digest: "claude-sonnet-4-20250514",
  deepDive: "claude-sonnet-4-20250514",
  learningProfile: "claude-opus-4-20250514",
};

/** Env var name for each stage. */
const ENV_KEYS: Record<AiStage, string> = {
  summarise: "MODEL_SUMMARISE",
  digest: "MODEL_DIGEST",
  deepDive: "MODEL_DEEP_DIVE",
  learningProfile: "MODEL_LEARNING_PROFILE",
};

/**
 * Returns the model ID for a given AI stage.
 * Checks environment variable first, falls back to default.
 * @param {AiStage} stage - The AI workflow stage.
 * @return {string} The Claude model ID.
 */
export function getModel(stage: AiStage): string {
  return process.env[ENV_KEYS[stage]] || DEFAULTS[stage];
}
