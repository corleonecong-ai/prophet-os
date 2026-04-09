import type { Plan, PlanStep } from '@/lib/planner/parse';
import { getSkillRegistry } from '@/lib/skills/loader';
import { executeSkill } from '@/lib/skills/executor';
import { getEngine } from '@/lib/engines/index';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt?: number;
  doneAt?: number;
}

export interface RunEvent {
  type: 'step_started' | 'step_done' | 'step_failed' | 'step_skipped' | 'plan_complete' | 'plan_error';
  stepId?: string;
  data?: unknown;
  error?: string;
  timestamp: number;
}

export type OnEvent = (event: RunEvent) => void;

// --- Condition Evaluator (whitelist, no eval) ---

function resolveTemplate(expr: string, context: Map<string, StepResult>): string {
  return expr.replace(/\{\{(\w+)\.output\.(\w+)\}\}/g, (_, stepId: string, field: string) => {
    const result = context.get(stepId);
    const val = (result?.output as Record<string, unknown> | undefined)?.[field];
    return String(val ?? 'undefined');
  });
}

function evaluateCondition(condition: string | null, context: Map<string, StepResult>): boolean {
  if (!condition) return true;

  const resolved = resolveTemplate(condition, context);

  // Simple numeric comparisons: X > 0.6, X >= 0.5, X < 0.4, X <= 0.3
  const numCmp = resolved.match(/^([\d.]+)\s*(>=|<=|>|<|==|!=)\s*([\d.]+)$/);
  if (numCmp) {
    const [, left, op, right] = numCmp;
    const l = parseFloat(left);
    const r = parseFloat(right);
    if (op === '>') return l > r;
    if (op === '>=') return l >= r;
    if (op === '<') return l < r;
    if (op === '<=') return l <= r;
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
  }

  // String equality: X == 'yes', X != 'no'
  const strCmp = resolved.match(/^(.+)\s*(==|!=)\s*['"](.+)['"]$/);
  if (strCmp) {
    const [, left, op, right] = strCmp;
    if (op === '==') return left.trim() === right;
    if (op === '!=') return left.trim() !== right;
  }

  // Boolean literals
  if (resolved.trim() === 'true') return true;
  if (resolved.trim() === 'false') return false;

  // Default: condition present but unparseable → SKIP the step (safe default)
  console.warn(`[DAG] Could not evaluate condition: "${resolved}" — defaulting to false (skipping)`);
  return false;
}

// --- Topological Sort (Kahn's Algorithm) → layers for parallel execution ---

function topoSort(steps: PlanStep[]): PlanStep[][] {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  const stepMap = new Map<string, PlanStep>();

  for (const s of steps) {
    inDegree.set(s.id, 0);
    graph.set(s.id, []);
    stepMap.set(s.id, s);
  }

  for (const s of steps) {
    for (const dep of s.depends_on) {
      graph.get(dep)!.push(s.id);
      inDegree.set(s.id, inDegree.get(s.id)! + 1);
    }
  }

  const layers: PlanStep[][] = [];
  let queue = steps.filter((s) => inDegree.get(s.id) === 0);

  while (queue.length > 0) {
    layers.push(queue);
    const nextQueue: PlanStep[] = [];
    for (const node of queue) {
      for (const neighbor of graph.get(node.id) ?? []) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) nextQueue.push(stepMap.get(neighbor)!);
      }
    }
    queue = nextQueue;
  }

  return layers;
}

// --- Resolve inputs: replace {{sN.output.field}} with actual values ---

function resolveInputs(inputs: Record<string, unknown>, context: Map<string, StepResult>): Record<string, unknown> {
  const str = JSON.stringify(inputs);

  // First pass: resolve {{sN.output.field}} → specific field value
  let resolved = str.replace(/\{\{(\w+)\.output\.(\w+)\}\}/g, (match, stepId: string, field: string) => {
    const result = context.get(stepId);
    const val = (result?.output as Record<string, unknown> | undefined)?.[field];
    if (val === undefined) return match;
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  });

  // Second pass: resolve {{sN.output}} → full output object (no field specified)
  resolved = resolved.replace(/\{\{(\w+)\.output\}\}/g, (match, stepId: string) => {
    const result = context.get(stepId);
    if (!result?.output) return match;
    if (typeof result.output === 'string') return result.output;
    return JSON.stringify(result.output);
  });

  try {
    return JSON.parse(resolved) as Record<string, unknown>;
  } catch {
    return inputs;
  }
}

// --- Execute a Single Step ---

async function executeStep(
  step: PlanStep,
  context: Map<string, StepResult>,
  onEvent: OnEvent
): Promise<StepResult> {
  onEvent({ type: 'step_started', stepId: step.id, timestamp: Date.now() });
  const startedAt = Date.now();

  try {
    const resolvedInputs = resolveInputs(step.inputs as Record<string, unknown>, context);

    let output: unknown;

    if (step.type === 'engine') {
      const [engineName, method] = step.name.split('.');
      const engine = getEngine(engineName);
      if (!engine[method]) throw new Error(`Engine "${engineName}" has no method "${method}"`);
      output = await engine[method](resolvedInputs);
    } else {
      const registry = getSkillRegistry();
      const skill = registry.get(step.name);
      if (!skill) throw new Error(`Unknown skill: "${step.name}"`);
      output = await executeSkill(skill, resolvedInputs);
    }

    const result: StepResult = { stepId: step.id, status: 'done', output, startedAt, doneAt: Date.now() };
    onEvent({ type: 'step_done', stepId: step.id, data: output, timestamp: Date.now() });
    return result;
  } catch (e) {
    const error = (e as Error).message;
    const result: StepResult = { stepId: step.id, status: 'failed', error, startedAt, doneAt: Date.now() };
    onEvent({ type: 'step_failed', stepId: step.id, error, timestamp: Date.now() });
    return result;
  }
}

// --- Main DAG Runner ---

export async function runDAG(plan: Plan, onEvent: OnEvent): Promise<Map<string, StepResult>> {
  const context = new Map<string, StepResult>();
  const layers = topoSort(plan.steps);

  for (const layer of layers) {
    // Determine eligible steps in this layer
    const eligible: PlanStep[] = [];
    const toSkip: PlanStep[] = [];

    for (const step of layer) {
      // Skip if any dependency failed or was skipped
      const depBlocked = step.depends_on.some((dep) => {
        const s = context.get(dep)?.status;
        return s === 'failed' || s === 'skipped';
      });

      if (depBlocked || !evaluateCondition(step.condition, context)) {
        toSkip.push(step);
      } else {
        eligible.push(step);
      }
    }

    // Emit skipped events
    for (const step of toSkip) {
      const result: StepResult = { stepId: step.id, status: 'skipped' };
      context.set(step.id, result);
      onEvent({ type: 'step_skipped', stepId: step.id, timestamp: Date.now() });
    }

    // Run eligible steps in parallel
    if (eligible.length > 0) {
      const results = await Promise.all(eligible.map((step) => executeStep(step, context, onEvent)));
      for (const result of results) {
        context.set(result.stepId, result);
      }
    }
  }

  onEvent({ type: 'plan_complete', data: Object.fromEntries(context), timestamp: Date.now() });
  return context;
}
