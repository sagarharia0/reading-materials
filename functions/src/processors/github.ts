import {ExtractedContent} from "../types.js";

const MAX_TEXT_LENGTH = 100_000;

/**
 * Extracts README content from a GitHub repository URL.
 * Uses the GitHub API (no auth needed for public repos).
 * @param {string} url - The GitHub URL.
 * @return {Promise<ExtractedContent>} The extracted content.
 */
export async function extractGithub(
  url: string
): Promise<ExtractedContent> {
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    throw new Error(
      "Could not parse GitHub owner/repo from URL"
    );
  }

  const {owner, repo} = parsed;

  // Fetch repo metadata for title and date.
  const repoData = await fetchRepoMeta(owner, repo);

  // Fetch README content.
  let readme = await fetchReadme(owner, repo);

  if (!readme) {
    throw new Error(
      `No README found for ${owner}/${repo}`
    );
  }

  // Prepend repo description if available.
  if (repoData.description) {
    readme = `${repoData.description}\n\n${readme}`;
  }

  if (readme.length > MAX_TEXT_LENGTH) {
    readme = readme.substring(0, MAX_TEXT_LENGTH);
  }

  return {
    title: `${owner}/${repo}` +
      (repoData.description ?
        ` — ${repoData.description}` : ""),
    fullText: readme,
    sourceType: "github",
    datePublished: repoData.createdAt ?
      new Date(repoData.createdAt) : null,
  };
}

/**
 * Parses owner and repo from a GitHub URL.
 * @param {string} url - The GitHub URL.
 * @return {object | null} Parsed owner and repo.
 */
function parseGithubUrl(
  url: string
): { owner: string; repo: string } | null {
  const match = url.match(
    /github\.com\/([^/]+)\/([^/?#]+)/
  );
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
  };
}

/**
 * Fetches repo metadata from the GitHub API.
 * @param {string} owner - The repo owner.
 * @param {string} repo - The repo name.
 * @return {Promise<object>} Repo description and date.
 */
async function fetchRepoMeta(
  owner: string,
  repo: string
): Promise<{ description: string; createdAt: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "reading-materials-bot",
        },
      }
    );
    if (!res.ok) {
      return {description: "", createdAt: ""};
    }
    const data = await res.json();
    return {
      description: data.description || "",
      createdAt: data.created_at || "",
    };
  } catch {
    return {description: "", createdAt: ""};
  }
}

/**
 * Fetches the README content from a GitHub repo.
 * @param {string} owner - The repo owner.
 * @param {string} repo - The repo name.
 * @return {Promise<string | null>} README text or null.
 */
async function fetchReadme(
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      {
        headers: {
          "Accept": "application/vnd.github.v3.raw",
          "User-Agent": "reading-materials-bot",
        },
      }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
