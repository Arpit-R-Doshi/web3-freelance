import { Octokit } from "@octokit/rest";

const octokit = process.env.GITHUB_TOKEN
  ? new Octokit({ auth: process.env.GITHUB_TOKEN })
  : null;

const OWNER = process.env.GITHUB_OWNER ?? "";

export async function createRepo(
  name: string,
  description: string
): Promise<{ html_url: string; name: string } | null> {
  if (!octokit || !OWNER) return null;
  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name,
      description,
      private: false,
      auto_init: true,
    });
    return { html_url: data.html_url, name: data.name };
  } catch (e: any) {
    console.error("[GitHub] createRepo failed:", e.message);
    return null;
  }
}

export async function addCollaborator(
  repoName: string,
  githubUsername: string,
  permission: "push" | "pull" | "admin" = "push"
): Promise<boolean> {
  if (!octokit || !OWNER) return false;
  try {
    await octokit.repos.addCollaborator({
      owner: OWNER,
      repo: repoName,
      username: githubUsername,
      permission,
    });
    return true;
  } catch (e: any) {
    console.error("[GitHub] addCollaborator failed:", e.message);
    return false;
  }
}

export async function setupWebhook(
  repoName: string,
  webhookUrl: string,
  secret: string
): Promise<boolean> {
  if (!octokit || !OWNER) return false;
  try {
    await octokit.repos.createWebhook({
      owner: OWNER,
      repo: repoName,
      config: { url: webhookUrl, content_type: "json", secret },
      events: ["push"],
      active: true,
    });
    return true;
  } catch (e: any) {
    console.error("[GitHub] setupWebhook failed:", e.message);
    return false;
  }
}
