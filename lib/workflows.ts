import type { ProviderId } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Saved multi-step workflows. Each step runs an agent (mode + optional provider/
// model override) on a prompt template; outputs pipe into later steps. Pure data
// + helpers — execution is orchestrated client-side over /api/chat (see page.tsx).
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  name: string;
  /** Agent preset id (build/plan/research/chat) → system prompt + default tools. */
  agentId: string;
  /** Optional provider override; empty = use the current selection. */
  providerId?: ProviderId | "";
  /** Optional model override; empty = provider default / current. */
  model?: string;
  /** Prompt template — supports {{input}}, {{previous}}, {{step1}}…{{stepN}}. */
  prompt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

const KEY = "amari.workflows.v1";

export function wfUid(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

/** Fill template variables from the run context. */
export function resolveTemplate(
  tpl: string,
  ctx: { input: string; previous: string; steps: string[] },
): string {
  return tpl
    .replace(/\{\{\s*input\s*\}\}/gi, ctx.input)
    .replace(/\{\{\s*previous\s*\}\}/gi, ctx.previous)
    .replace(/\{\{\s*step\s*(\d+)\s*\}\}/gi, (_m, n) => ctx.steps[Number(n) - 1] ?? "");
}

export function exampleWorkflows(): Workflow[] {
  const now = Date.now();
  return [
    {
      id: wfUid(),
      name: "Research → Brief",
      description: "Research a topic on the web, then write a tight brief.",
      createdAt: now,
      updatedAt: now,
      steps: [
        {
          id: wfUid(),
          name: "Research",
          agentId: "research",
          prompt:
            "Research this topic and gather the key facts with source URLs:\n\n{{input}}",
        },
        {
          id: wfUid(),
          name: "Brief",
          agentId: "chat",
          prompt:
            "Write a concise, well-structured brief (bullet points + a 2-line summary) from these findings. Keep the source links.\n\n{{previous}}",
        },
      ],
    },
    {
      id: wfUid(),
      name: "Plan → Build → Review",
      description: "Plan a coding task, implement it, then review the result.",
      createdAt: now,
      updatedAt: now,
      steps: [
        {
          id: wfUid(),
          name: "Plan",
          agentId: "plan",
          prompt: "Produce a concrete, ordered implementation plan for:\n\n{{input}}",
        },
        {
          id: wfUid(),
          name: "Build",
          agentId: "build",
          prompt:
            "Implement this plan in the workspace, creating/editing files and running commands as needed:\n\n{{previous}}",
        },
        {
          id: wfUid(),
          name: "Review",
          agentId: "plan",
          prompt:
            "Review the implementation against the original plan. List any bugs, gaps, or risks, and verify by reading the files.\n\nOriginal plan:\n{{step1}}",
        },
      ],
    },
  ];
}

export function loadWorkflows(): Workflow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return exampleWorkflows(); // seed on first use only
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveWorkflows(list: Workflow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function blankWorkflow(): Workflow {
  const now = Date.now();
  return {
    id: wfUid(),
    name: "New workflow",
    description: "",
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: wfUid(),
        name: "Step 1",
        agentId: "chat",
        prompt: "{{input}}",
      },
    ],
  };
}
