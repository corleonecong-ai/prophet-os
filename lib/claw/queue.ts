export interface ExecutionContext {
  planId: string;
  status: 'running' | 'done' | 'failed';
  results: Map<string, unknown>;
  startedAt: number;
  doneAt?: number;
}

// In-memory store — single-process only (no Redis needed for MVP)
const store = new Map<string, ExecutionContext>();

export function createContext(planId: string): ExecutionContext {
  const ctx: ExecutionContext = {
    planId,
    status: 'running',
    results: new Map(),
    startedAt: Date.now(),
  };
  store.set(planId, ctx);
  return ctx;
}

export function getContext(planId: string): ExecutionContext | undefined {
  return store.get(planId);
}

export function completeContext(planId: string): void {
  const ctx = store.get(planId);
  if (ctx) {
    ctx.status = 'done';
    ctx.doneAt = Date.now();
  }
}
