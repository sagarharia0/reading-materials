import {SourceType} from "./types.js";

/**
 * Detects the content source type from a URL pattern.
 * Returns "article" as the default for unrecognised URLs.
 * @param {string} url - The URL to classify.
 * @return {SourceType} The detected source type.
 */
export function resolveSourceType(url: string): SourceType {
  const lower = url.toLowerCase();

  if (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be")
  ) {
    return "youtube";
  }

  if (
    lower.includes(".substack.com") ||
    lower.includes("substack.com/")
  ) {
    return "substack";
  }

  if (
    lower.includes("podcasts.apple.com") ||
    lower.includes("open.spotify.com/episode") ||
    lower.includes("overcast.fm")
  ) {
    return "podcast";
  }

  if (
    lower.includes("twitter.com") ||
    lower.includes("x.com")
  ) {
    return "twitter";
  }

  if (lower.includes("github.com")) {
    return "github";
  }

  if (lower.endsWith(".pdf")) {
    return "pdf";
  }

  return "article";
}
