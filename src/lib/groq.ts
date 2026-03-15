import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const MODEL = "llama-3.1-8b-instant";

async function chat(prompt: string, maxTokens = 1024): Promise<string> {
  if (!groq) return "";
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.15,
    max_tokens: maxTokens,
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

function safeJSON<T>(text: string, fallback: T): T {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try extracting the first [...] or {...} block
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const raw = arrMatch?.[0] ?? objMatch?.[0];
    if (raw) {
      try { return JSON.parse(raw) as T; } catch { /* fall through */ }
    }
    console.error("[groq] JSON parse failed:", cleaned.slice(0, 200));
    return fallback;
  }
}

export async function extractSkills(description: string): Promise<string[]> {
  if (!groq) return ["JavaScript", "TypeScript", "React", "Node.js"];
  const prompt = `Extract required technical skills from this software project description.
Return ONLY a valid JSON array of strings. No explanation, no markdown.
Example: ["React", "Node.js", "PostgreSQL"]

Project: ${description}`;
  const text = await chat(prompt, 256);
  return safeJSON<string[]>(text, ["JavaScript", "TypeScript"]);
}

export type MilestoneSpec = {
  title: string;
  description: string;
  simpleExplanation: string;
  dependsOn: string[];
  testCount: number;
};

export async function generateMilestones(
  name: string,
  description: string,
  skills: string[]
): Promise<MilestoneSpec[]> {
  if (!groq) return getFallbackMilestones(name);
  const prompt = `Generate 5-7 software development milestones for this project. Each milestone is a concrete, testable deliverable.

Return ONLY a valid JSON array. No explanation, no markdown.
Each item must have: title (string), description (1-2 sentence technical detail), simpleExplanation (1 sentence plain English for non-technical clients), dependsOn (array of titles this depends on, empty for first), testCount (integer 2-4).

Project: ${name}
Requirements: ${description}
Tech stack: ${skills.join(", ")}

Rules:
- First milestone should have empty dependsOn
- Dependencies must reference exact titles from your own list
- simpleExplanation must be non-technical, friendly language
- testCount reflects how complex the milestone is`;

  const text = await chat(prompt, 2048);
  const specs = safeJSON<MilestoneSpec[]>(text, getFallbackMilestones(name));
  return specs.slice(0, 8); // cap at 8
}

function getFallbackMilestones(projectName: string): MilestoneSpec[] {
  return [
    {
      title: "Project Setup & Architecture",
      description: "Initialize repository, configure development environment, set up CI pipeline and core dependencies.",
      simpleExplanation: "Setting up the foundation — like laying the blueprint before building a house.",
      dependsOn: [],
      testCount: 2,
    },
    {
      title: "Database Design",
      description: "Design and implement the database schema with all required tables, indexes, and relationships.",
      simpleExplanation: "Creating the filing system to store all the app's information.",
      dependsOn: ["Project Setup & Architecture"],
      testCount: 3,
    },
    {
      title: "Core Backend API",
      description: "Build RESTful API endpoints for all primary business logic and data operations.",
      simpleExplanation: "Building the engine that powers the app behind the scenes.",
      dependsOn: ["Database Design"],
      testCount: 4,
    },
    {
      title: "Authentication System",
      description: "Implement secure user registration, login, and session management.",
      simpleExplanation: "The login door — making sure only the right people can get in.",
      dependsOn: ["Core Backend API"],
      testCount: 3,
    },
    {
      title: "Frontend UI",
      description: "Build the user interface components, pages, and client-side logic.",
      simpleExplanation: "Everything the user sees and clicks — the face of the product.",
      dependsOn: ["Authentication System"],
      testCount: 3,
    },
    {
      title: "Integration & Testing",
      description: "Connect frontend with backend, run end-to-end tests, fix integration bugs.",
      simpleExplanation: "Making sure all the pieces work perfectly together.",
      dependsOn: ["Frontend UI"],
      testCount: 4,
    },
    {
      title: "Deployment & Delivery",
      description: "Deploy to production environment, configure domains, final QA pass.",
      simpleExplanation: "Opening the doors — launching the finished product to the world.",
      dependsOn: ["Integration & Testing"],
      testCount: 2,
    },
  ];
}

export async function summarizeCommit(message: string): Promise<string> {
  if (!groq) return message;
  const prompt = `Summarize this git commit in one plain English sentence for a non-technical client. Be concise and friendly.
Commit: "${message}"
Return ONLY the sentence, nothing else.`;
  const text = await chat(prompt, 80);
  return text || message;
}
