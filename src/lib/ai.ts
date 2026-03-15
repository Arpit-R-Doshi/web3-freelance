import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const MODEL = "llama-3.1-8b-instant";

/** Extract technical skills from a project description */
export async function extractSkills(description: string): Promise<string[]> {
  if (!groq) return fallbackExtractSkills(description);

  try {
    const resp = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a technical skills extractor. Given a project description, return ONLY a JSON array of required technical skills. No explanation, no markdown, just the JSON array. Example: [\"React\",\"Node.js\",\"PostgreSQL\"]",
        },
        { role: "user", content: description },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as string[];
  } catch (e) {
    console.error("[AI] extractSkills failed:", e);
  }
  return fallbackExtractSkills(description);
}

/** Generate ordered milestones with dependencies for a project */
export async function generateMilestones(
  projectName: string,
  description: string,
  skills: string[]
): Promise<MilestoneInput[]> {
  if (!groq) return fallbackMilestones(projectName, description, skills);

  try {
    const prompt = `Project: "${projectName}"
Description: ${description}
Required Skills: ${skills.join(", ")}

Generate 5-7 development milestones as a JSON array. Each milestone must be a distinct, achievable step.
Return ONLY a JSON array with no markdown or extra text:
[
  {
    "title": "short milestone name",
    "description": "technical description of what needs to be done",
    "simpleExplanation": "non-technical explanation a business person would understand",
    "dependsOnTitles": ["title of prerequisite milestone"],
    "testCases": [
      {"name": "test name", "description": "what this test checks"}
    ]
  }
]`;

    const resp = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a senior software architect. Return clean JSON only, no markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as MilestoneInput[];
      return parsed.slice(0, 7);
    }
  } catch (e) {
    console.error("[AI] generateMilestones failed:", e);
  }
  return fallbackMilestones(projectName, description, skills);
}

/** Summarize a commit message in plain English for non-technical clients */
export async function summarizeCommit(message: string): Promise<string> {
  if (!groq) return `Developer made changes: ${message}`;

  try {
    const resp = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Summarize this git commit message in one plain English sentence for a non-technical client. No jargon. Start with what was done, keep it under 15 words.",
        },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 60,
    });
    return resp.choices[0]?.message?.content?.trim() ?? `Changes pushed: ${message}`;
  } catch {
    return `Changes pushed: ${message}`;
  }
}

// ─── Types ───────────────────────────────────────
export type MilestoneInput = {
  title: string;
  description: string;
  simpleExplanation: string;
  dependsOnTitles: string[];
  testCases: { name: string; description: string }[];
};

// ─── Fallbacks (no API key) ───────────────────────
function fallbackExtractSkills(description: string): string[] {
  const techWords = [
    "React", "Next.js", "Node.js", "TypeScript", "JavaScript", "Python", "Django",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes", "AWS", "GCP",
    "REST API", "GraphQL", "WebSocket", "Flutter", "Swift", "Kotlin", "Solidity",
    "HTML", "CSS", "Tailwind", "Express", "FastAPI", "Spring", "Laravel", "Vue.js",
    "Angular", "Redux", "Prisma", "Firebase", "Supabase", "Stripe", "Auth", "JWT",
  ];
  const lower = description.toLowerCase();
  return techWords.filter((t) => lower.includes(t.toLowerCase())).slice(0, 8);
}

function fallbackMilestones(name: string, desc: string, skills: string[]): MilestoneInput[] {
  return [
    {
      title: "Project Setup & Architecture",
      description: "Initialize repository, configure development environment, set up project structure and dependencies.",
      simpleExplanation: "Setting up the foundation — like preparing all the building materials and tools before construction begins.",
      dependsOnTitles: [],
      testCases: [
        { name: "Repo initialized", description: "Repository exists with proper structure" },
        { name: "Dependencies installed", description: "All packages install without errors" },
      ],
    },
    {
      title: "Database Design",
      description: "Design and implement the database schema, create tables, relationships and seed data.",
      simpleExplanation: "Creating the organized storage system — imagine designing filing cabinets where all the app's information will live.",
      dependsOnTitles: ["Project Setup & Architecture"],
      testCases: [
        { name: "Schema created", description: "All database tables exist with correct columns" },
        { name: "Relationships valid", description: "Foreign keys and relationships work correctly" },
      ],
    },
    {
      title: "Core Backend API",
      description: `Implement primary REST API endpoints for the main application logic. Skills used: ${skills.slice(0, 3).join(", ")}.`,
      simpleExplanation: "Building the engine room — all the logic that makes the app actually work behind the scenes.",
      dependsOnTitles: ["Database Design"],
      testCases: [
        { name: "API endpoints respond", description: "All key endpoints return correct responses" },
        { name: "Authentication works", description: "Users can register and log in securely" },
      ],
    },
    {
      title: "Frontend Interface",
      description: "Build user interface components connecting to the backend API.",
      simpleExplanation: "Building what users actually see and click — making the app look good and easy to use.",
      dependsOnTitles: ["Core Backend API"],
      testCases: [
        { name: "Pages render", description: "All main pages load without errors" },
        { name: "Forms work", description: "Users can submit forms and see results" },
      ],
    },
    {
      title: "Testing & Quality Assurance",
      description: "Write unit and integration tests, fix discovered bugs, optimize performance.",
      simpleExplanation: "Thorough checking — like a test drive of a new car to find anything that needs fixing before delivery.",
      dependsOnTitles: ["Frontend Interface"],
      testCases: [
        { name: "Unit tests pass", description: "All automated tests pass" },
        { name: "No critical bugs", description: "No crash-causing issues found" },
      ],
    },
    {
      title: "Deployment & Launch",
      description: "Configure production environment, CI/CD pipeline, deploy application.",
      simpleExplanation: "Going live — like opening a store to the public after all the preparation is done.",
      dependsOnTitles: ["Testing & Quality Assurance"],
      testCases: [
        { name: "Deployed successfully", description: "App is accessible on public URL" },
        { name: "Performance acceptable", description: "Pages load in under 3 seconds" },
      ],
    },
  ];
}
