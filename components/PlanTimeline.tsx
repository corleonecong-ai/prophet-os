'use client';

import type { PlanStep } from '@/lib/planner/parse';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface PlanTimelineProps {
  steps: PlanStep[];
  stepStatus: Record<string, StepStatus>;
}

const statusIcon: Record<StepStatus, string> = {
  pending: '○',
  running: '⟳',
  done: '✓',
  failed: '✗',
  skipped: '—',
};

const statusColor: Record<StepStatus, string> = {
  pending: 'text-zinc-500 border-zinc-700',
  running: 'text-yellow-400 border-yellow-500 animate-pulse',
  done: 'text-emerald-400 border-emerald-600',
  failed: 'text-red-400 border-red-600',
  skipped: 'text-zinc-600 border-zinc-800',
};

export default function PlanTimeline({ steps, stepStatus }: PlanTimelineProps) {
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs text-zinc-500 font-mono uppercase tracking-widest">DAG Plan — {steps.length} steps</h2>
      <div className="flex flex-col gap-2">
        {steps.map((step) => {
          const status = stepStatus[step.id] ?? 'pending';
          return (
            <div
              key={step.id}
              className={`border rounded-lg p-3 transition-all ${statusColor[status]}`}
            >
              <div className="flex items-start gap-3">
                <span className="font-mono text-lg leading-none mt-0.5 w-5 shrink-0 text-center">
                  {statusIcon[status]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                      {step.id}
                    </span>
                    <span className="font-mono text-sm font-semibold truncate">{step.name}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">
                      {step.type}
                    </span>
                    {step.condition && (
                      <span className="text-xs text-violet-400 bg-violet-950 px-1.5 py-0.5 rounded font-mono truncate max-w-[200px]" title={step.condition}>
                        if {step.condition}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{step.why}</p>
                  {step.depends_on.length > 0 && (
                    <p className="text-xs text-zinc-600 mt-0.5 font-mono">
                      depends on: {step.depends_on.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
