'use client';

import type { PlanStep } from '@/lib/planner/parse';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface PlanTimelineProps {
  steps: PlanStep[];
  stepStatus: Record<string, StepStatus>;
  stepOutputs?: Record<string, unknown>;
}

const statusIcon: Record<StepStatus, string> = {
  pending: '○',
  running: '⟳',
  done: '✓',
  failed: '✗',
  skipped: '—',
};

const statusColor: Record<StepStatus, string> = {
  pending: 'border-zinc-800 text-zinc-500',
  running: 'border-yellow-500/50 text-yellow-400 bg-yellow-950/20',
  done: 'border-emerald-700/50 text-emerald-400 bg-emerald-950/20',
  failed: 'border-red-700/50 text-red-400 bg-red-950/20',
  skipped: 'border-zinc-800 text-zinc-600',
};

const statusIconColor: Record<StepStatus, string> = {
  pending: 'text-zinc-600',
  running: 'text-yellow-400 animate-spin',
  done: 'text-emerald-400',
  failed: 'text-red-400',
  skipped: 'text-zinc-600',
};

// Extract a human-readable summary from step output
function getStepSummary(stepName: string, rawOutput: unknown): React.ReactNode | null {
  if (!rawOutput || typeof rawOutput !== 'object') return null;
  const out = rawOutput as Record<string, unknown>;

  // Unwrap {output: ...} wrapper
  const data = ('output' in out && out.output && typeof out.output === 'object')
    ? out.output as Record<string, unknown>
    : out;

  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  // atlas.lookup / kb.lookup
  if (stepName.includes('atlas') || stepName === 'kb.lookup') {
    const entry = (d.entry ?? d) as Record<string, unknown>;
    if (entry?.category) {
      return (
        <div className="mt-2 text-xs space-y-1">
          <span className="text-emerald-400/70">📦 {String(entry.category)} › {String(entry.subcategory ?? '')}</span>
          {!!entry.market_maturity && (
            <span className="ml-2 text-zinc-500">市场成熟度: <span className="text-zinc-300">{String(entry.market_maturity)}</span></span>
          )}
          {Array.isArray(entry.top_competitors) && (
            <div className="text-zinc-500">竞品: <span className="text-zinc-400">{(entry.top_competitors as string[]).slice(0, 3).join(' · ')}</span></div>
          )}
          {Array.isArray(entry.certifications_required) && (
            <div className="text-zinc-500">合规: <span className="text-emerald-400/70">{(entry.certifications_required as string[]).join(' · ')}</span></div>
          )}
          {typeof entry.source === 'string' && (
            <span className="text-zinc-600">来源: {entry.source === 'ontology' ? '本体知识库' : '推断'}</span>
          )}
        </div>
      );
    }
  }

  // llm.simulate / prophet.predict
  if (stepName.includes('simulate') || stepName.includes('prophet')) {
    const score = typeof d.score === 'number' ? d.score : null;
    const burstProb = typeof d.burst_prob === 'number' ? d.burst_prob : null;
    const personaCount = Array.isArray(d.personas) ? d.personas.length : 0;
    const summary = typeof d.summary === 'string' ? d.summary : null;
    return (
      <div className="mt-2 text-xs space-y-1.5">
        <div className="flex items-center gap-3">
          {personaCount > 0 && <span className="text-zinc-400">👥 {personaCount} 个 persona 模拟完成</span>}
          {score !== null && (
            <span className="text-zinc-400">
              平均评分: <span className={`font-bold ${score >= 7 ? 'text-emerald-400' : score >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>{score.toFixed(1)}/10</span>
            </span>
          )}
          {burstProb !== null && (
            <span className="text-zinc-400">
              爆款概率: <span className={`font-bold ${burstProb >= 0.7 ? 'text-emerald-400' : burstProb >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>{Math.round(burstProb * 100)}%</span>
            </span>
          )}
        </div>
        {summary && (
          <p className="text-zinc-500 leading-relaxed line-clamp-2">{summary.slice(0, 180)}{summary.length > 180 ? '…' : ''}</p>
        )}
      </div>
    );
  }

  // llm.reason
  if (stepName.includes('reason')) {
    const answer = typeof d.answer === 'string' ? d.answer : null;
    const burstProb = typeof d.burst_prob === 'number' ? d.burst_prob : null;
    const steps = Array.isArray(d.steps) ? d.steps as string[] : [];
    return (
      <div className="mt-2 text-xs space-y-1.5">
        {burstProb !== null && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">综合判断:</span>
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden max-w-32">
              <div
                className={`h-full ${burstProb >= 0.7 ? 'bg-emerald-500' : burstProb >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${Math.round(burstProb * 100)}%` }}
              />
            </div>
            <span className={`font-bold ${burstProb >= 0.7 ? 'text-emerald-400' : burstProb >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
              {Math.round(burstProb * 100)}% 爆款概率
            </span>
          </div>
        )}
        {answer && <p className="text-zinc-400 leading-relaxed">{answer.slice(0, 200)}{answer.length > 200 ? '…' : ''}</p>}
        {steps.length > 0 && (
          <p className="text-zinc-600">{steps.length} 步推理链 · {steps[0]?.slice(0, 80)}…</p>
        )}
      </div>
    );
  }

  // llm.generate (listing)
  if (stepName.includes('generate')) {
    const title = typeof d.title === 'string' ? d.title : null;
    const bullets = Array.isArray(d.bullets) ? d.bullets as string[] : [];
    const json = (d.json && typeof d.json === 'object') ? d.json as Record<string, unknown> : null;
    const actualTitle = title ?? (json && typeof json.title === 'string' ? json.title : null);
    const burstProb = typeof d.burst_prob === 'number' ? d.burst_prob : null;
    const verdict = typeof d.verdict === 'string' ? d.verdict : null;

    if (burstProb !== null || verdict) {
      // Final report step
      return (
        <div className="mt-2 text-xs space-y-1">
          {verdict && <p className="text-zinc-400">{verdict.slice(0, 150)}{verdict.length > 150 ? '…' : ''}</p>}
          <p className="text-zinc-600">最终报告已生成，包含爆款分析 + 德语 Listing + 合规清单 + 关键词</p>
        </div>
      );
    }
    return (
      <div className="mt-2 text-xs space-y-1">
        {actualTitle && <p className="text-zinc-300 font-medium">「{actualTitle.slice(0, 80)}」</p>}
        {bullets.length > 0 && (
          <p className="text-zinc-500">{bullets.length} 条卖点 · {String(bullets[0]).slice(0, 60)}…</p>
        )}
        {!actualTitle && !bullets.length && <p className="text-zinc-500">结构化内容已生成</p>}
      </div>
    );
  }

  // llm.expand (keywords)
  if (stepName.includes('expand')) {
    const items = Array.isArray(d.items) ? d.items as string[] : [];
    return (
      <div className="mt-2 text-xs">
        <span className="text-zinc-500">生成 {items.length} 个关键词 · </span>
        <span className="text-zinc-400">{items.slice(0, 5).join(' · ')}{items.length > 5 ? ` +${items.length - 5}` : ''}</span>
      </div>
    );
  }

  // llm.transform
  if (stepName.includes('transform')) {
    const text = typeof d.text === 'string' ? d.text : null;
    return text ? (
      <div className="mt-2 text-xs text-zinc-500">{text.slice(0, 120)}{text.length > 120 ? '…' : ''}</div>
    ) : null;
  }

  return null;
}

export default function PlanTimeline({ steps, stepStatus, stepOutputs = {} }: PlanTimelineProps) {
  if (steps.length === 0) return null;

  // Group steps by their layer (steps that start at the same time)
  const doneCount = steps.filter(s => stepStatus[s.id] === 'done').length;
  const totalDone = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
          DAG 执行计划 — {steps.length} 步
        </h2>
        {doneCount > 0 && (
          <span className="text-xs font-mono text-zinc-500">
            <span className="text-emerald-400">{doneCount}</span>/{steps.length} 完成 ({totalDone}%)
          </span>
        )}
      </div>

      {/* Progress bar */}
      {doneCount > 0 && (
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all duration-500"
            style={{ width: `${totalDone}%` }}
          />
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {steps.map((step) => {
          const status = stepStatus[step.id] ?? 'pending';
          const rawOutput = stepOutputs[step.id];
          const summary = status === 'done' ? getStepSummary(step.name, rawOutput) : null;

          return (
            <div
              key={step.id}
              className={`border rounded-lg p-3 transition-all duration-300 ${statusColor[status]}`}
            >
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <span className={`font-mono text-base leading-none mt-0.5 w-5 shrink-0 text-center ${statusIconColor[status]}`}>
                  {statusIcon[status]}
                </span>

                <div className="flex-1 min-w-0">
                  {/* Step header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-400">
                      {step.id}
                    </span>
                    <span className="font-mono text-sm font-semibold">{step.name}</span>
                    <span className="text-xs text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
                      {step.type === 'engine' ? '引擎' : '技能'}
                    </span>
                    {step.condition && (
                      <span className="text-xs text-violet-400 bg-violet-950/50 px-1.5 py-0.5 rounded font-mono" title={step.condition}>
                        条件执行
                      </span>
                    )}
                    {step.depends_on.length > 0 && (
                      <span className="text-xs text-zinc-600 font-mono">
                        ↳ {step.depends_on.join(', ')}
                      </span>
                    )}
                  </div>

                  {/* Why */}
                  <p className="text-xs text-zinc-600 mt-1">{step.why}</p>

                  {/* Output summary (only when done) */}
                  {summary && (
                    <div className="mt-2 pt-2 border-t border-zinc-800/50">
                      {summary}
                    </div>
                  )}

                  {/* Running indicator */}
                  {status === 'running' && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-yellow-400/70">执行中…</span>
                    </div>
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
