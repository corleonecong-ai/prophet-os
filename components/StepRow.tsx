'use client';

import { useState, useEffect, type ReactNode } from 'react';
import type { PlanStep } from '@/lib/planner/parse';
import type { StepStatus } from '@/components/PlanTimeline';

interface StepRowProps {
  step: PlanStep;
  status: StepStatus;
  output?: unknown;
  isParallel?: boolean;
  summary?: ReactNode;
  startedAt?: number;
}

const DOT_COLOR: Record<StepStatus, string> = {
  pending:  'bg-zinc-700',
  running:  'bg-yellow-400 animate-pulse',
  done:     'bg-emerald-500',
  failed:   'bg-red-500',
  skipped:  'bg-zinc-700',
};

const CARD_COLOR: Record<StepStatus, string> = {
  pending:  'border-zinc-800',
  running:  'border-yellow-600/40 bg-yellow-950/10',
  done:     'border-emerald-800/40 bg-emerald-950/10',
  failed:   'border-red-800/40 bg-red-950/10',
  skipped:  'border-zinc-800 opacity-50',
};

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 200);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="font-mono text-yellow-400/70">{(elapsed / 1000).toFixed(1)}s</span>;
}

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const str = JSON.stringify(data, null, 2);
  return (
    <div className="mt-2">
      <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">{label}</p>
      <pre className="text-[10px] text-zinc-500 bg-zinc-950 rounded p-2 overflow-auto max-h-48 leading-relaxed">
        {str.slice(0, 2000)}{str.length > 2000 ? '\n…（截断）' : ''}
      </pre>
    </div>
  );
}

export default function StepRow({ step, status, output, isParallel, summary, startedAt }: StepRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Unwrap output
  const rawOut = output && typeof output === 'object'
    ? (('output' in (output as object)) ? (output as Record<string, unknown>).output : output)
    : output;

  const hasOutput = rawOut !== undefined && rawOut !== null;
  const doneAt = output && typeof output === 'object' && 'doneAt' in (output as object)
    ? (output as Record<string, unknown>).doneAt as number : null;
  const startAt = output && typeof output === 'object' && 'startedAt' in (output as object)
    ? (output as Record<string, unknown>).startedAt as number : startedAt;

  const duration = (doneAt && startAt) ? ((doneAt - startAt) / 1000).toFixed(1) : null;

  return (
    <div className={`border rounded-lg transition-all duration-200 ${CARD_COLOR[status]}`}>
      {/* ── Header row ── */}
      <div className="flex items-start gap-3 p-3">
        {/* Status dot */}
        <div className="mt-1 shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${DOT_COLOR[status]}`} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Step meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{step.id}</span>
            <span className="font-mono text-sm font-semibold text-zinc-200">{step.name}</span>
            <span className="text-[10px] text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
              {step.type === 'engine' ? '引擎' : '技能'}
            </span>
            {isParallel && (
              <span className="text-[10px] text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded font-mono">⚡ 并行</span>
            )}
            {step.condition && (
              <span className="text-[10px] text-violet-400 bg-violet-950/40 px-1.5 py-0.5 rounded font-mono">条件执行</span>
            )}
          </div>

          {/* Why */}
          <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">{step.why}</p>

          {/* Summary */}
          {summary && <div className="mt-2 pt-2 border-t border-zinc-800/40">{summary}</div>}

          {/* Running indicator + timer */}
          {status === 'running' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex gap-0.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1 h-1 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[11px] text-yellow-400/60">执行中</span>
              {startAt && <ElapsedTimer startedAt={startAt} />}
            </div>
          )}
        </div>

        {/* Right: duration + expand */}
        <div className="flex items-center gap-2 shrink-0">
          {duration && (
            <span className="text-[10px] font-mono text-zinc-600">{duration}s</span>
          )}
          {step.depends_on.length > 0 && (
            <span className="text-[10px] text-zinc-700 font-mono hidden sm:inline">↳{step.depends_on.join(',')}</span>
          )}
          {(hasOutput || status === 'done' || status === 'failed') && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors"
            >
              {expanded ? '收起 ▲' : '展开 ▼'}
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-zinc-800/50 px-3 pb-3">
          {step.inputs && Object.keys(step.inputs as object).length > 0 && (
            <JsonViewer data={step.inputs} label="Inputs" />
          )}
          {hasOutput && <JsonViewer data={rawOut} label="Output" />}
          {status === 'failed' && !!output && typeof output === 'object' && 'error' in (output as object) && (
            <div className="mt-2 text-xs text-red-400 font-mono bg-red-950/30 rounded p-2">
              ✗ {String((output as Record<string, unknown>).error)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
