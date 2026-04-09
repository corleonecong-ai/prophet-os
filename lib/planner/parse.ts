import { z } from 'zod';

// --- Zod Schema ---

const StepSchema = z.object({
  id: z.string(),
  type: z.enum(['engine', 'skill']),
  name: z.string(),
  inputs: z.record(z.unknown()).default({}),
  depends_on: z.array(z.string()).default([]),
  condition: z.string().nullable().default(null),
  why: z.string().default(''),
});

const PlanSchema = z.object({
  goal: z.string(),
  reasoning: z.string().default(''),
  estimated_seconds: z.number().default(30),
  estimated_tokens: z.number().default(10000),
  steps: z.array(StepSchema).min(1),
  success_criteria: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof StepSchema>;

// --- JSON Extraction ---
// Handles Claude wrapping JSON in ```json ... ``` blocks

function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return raw.trim();
}

// --- DAG Validation ---

function validateDependencyRefs(steps: PlanStep[]): string | null {
  const ids = new Set(steps.map((s) => s.id));
  for (const step of steps) {
    for (const dep of step.depends_on) {
      if (!ids.has(dep)) {
        return `Step "${step.id}" depends_on unknown id "${dep}"`;
      }
      if (dep === step.id) {
        return `Step "${step.id}" depends on itself`;
      }
    }
  }
  return null;
}

function detectCycle(steps: PlanStep[]): string | null {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.id, 0);
    graph.set(step.id, []);
  }

  for (const step of steps) {
    for (const dep of step.depends_on) {
      graph.get(dep)?.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue = Array.from(inDegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of graph.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return visited === steps.length ? null : 'Cycle detected in DAG';
}

// --- Main Parse Function ---

export interface ParseResult {
  ok: boolean;
  plan?: Plan;
  error?: string;
}

export function parsePlan(raw: string): ParseResult {
  let jsonStr: string;
  try {
    jsonStr = extractJSON(raw);
  } catch {
    return { ok: false, error: 'Could not locate JSON in Planner output' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, error: `JSON.parse failed: ${(e as Error).message}` };
  }

  const result = PlanSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: `Schema validation failed: ${result.error.message}` };
  }

  const plan = result.data;

  const refError = validateDependencyRefs(plan.steps);
  if (refError) return { ok: false, error: refError };

  const cycleError = detectCycle(plan.steps);
  if (cycleError) return { ok: false, error: cycleError };

  return { ok: true, plan };
}
