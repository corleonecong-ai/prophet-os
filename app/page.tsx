'use client';

import { useState, useRef } from 'react';
import IntentConsole from '@/components/IntentConsole';
import PlanTimeline from '@/components/PlanTimeline';
import type { StepStatus } from '@/components/PlanTimeline';
import FinalReport from '@/components/FinalReport';
import ArtifactTabs from '@/components/ArtifactTabs';
import SkillsPanel from '@/components/SkillsPanel';
import type { Plan } from '@/lib/planner/parse';

type AppState = 'idle' | 'planning' | 'executing' | 'done' | 'error';

const STATUS_STYLES: Record<AppState, string> = {
  idle:      'bg-zinc-800 text-zinc-500',
  planning:  'bg-yellow-900/60 text-yellow-400 animate-pulse',
  executing: 'bg-blue-900/60 text-blue-400 animate-pulse',
  done:      'bg-emerald-900/60 text-emerald-400',
  error:     'bg-red-900/60 text-red-400',
};

const STATUS_LABEL: Record<AppState, string> = {
  idle:      'READY',
  planning:  'PLANNING',
  executing: 'EXECUTING',
  done:      'DONE',
  error:     'ERROR',
};

export default function Home() {
  const [intent, setIntent] = useState('帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料');
  const [appState, setAppState] = useState<AppState>('idle');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({});
  const [stepOutputs, setStepOutputs] = useState<Record<string, unknown>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function addLog(msg: string) {
    setLog((prev) => [...prev.slice(-50), msg]);
  }

  async function handleRun() {
    if (!intent.trim()) return;
    setPlan(null);
    setStepStatus({});
    setStepOutputs({});
    setErrorMsg('');
    setLog([]);
    setShowLog(false);
    setAppState('planning');
    addLog('⟳ Calling Planner...');

    try {
      const planRes = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });

      if (!planRes.ok) {
        const err = await planRes.json() as { error?: string };
        throw new Error(err.error ?? 'Planner returned error');
      }

      const planData = await planRes.json() as { plan: Plan; attempts: number };
      const newPlan = planData.plan;
      setPlan(newPlan);

      const initialStatus: Record<string, StepStatus> = {};
      for (const s of newPlan.steps) initialStatus[s.id] = 'pending';
      setStepStatus(initialStatus);

      addLog(`✓ Plan ready: ${newPlan.steps.length} steps (attempt ${planData.attempts})`);
      setAppState('executing');

      abortRef.current = new AbortController();

      const execRes = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
        signal: abortRef.current.signal,
      });

      if (!execRes.ok || !execRes.body) throw new Error('Execute endpoint failed');

      const reader = execRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw) as {
              type: string;
              stepId?: string;
              data?: unknown;
              error?: string;
            };

            if (event.type === 'step_started' && event.stepId) {
              setStepStatus((prev) => ({ ...prev, [event.stepId!]: 'running' }));
              addLog(`⟳ ${event.stepId} started`);
            } else if (event.type === 'step_done' && event.stepId) {
              setStepStatus((prev) => ({ ...prev, [event.stepId!]: 'done' }));
              setStepOutputs((prev) => ({ ...prev, [event.stepId!]: { output: event.data, status: 'done' } }));
              addLog(`✓ ${event.stepId} done`);
            } else if (event.type === 'step_failed' && event.stepId) {
              setStepStatus((prev) => ({ ...prev, [event.stepId!]: 'failed' }));
              addLog(`✗ ${event.stepId} failed: ${event.error}`);
            } else if (event.type === 'step_skipped' && event.stepId) {
              setStepStatus((prev) => ({ ...prev, [event.stepId!]: 'skipped' }));
              addLog(`— ${event.stepId} skipped`);
            } else if (event.type === 'plan_complete') {
              const allOutputs = event.data as Record<string, unknown>;
              setStepOutputs(allOutputs);
              setAppState('done');
              addLog('✓ Plan complete');
            } else if (event.type === 'plan_error') {
              throw new Error(event.error ?? 'Execution error');
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      if (appState !== 'done') setAppState('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = (e as Error).message;
      setErrorMsg(msg);
      setAppState('error');
      addLog(`✗ Error: ${msg}`);
    }
  }

  const loading = appState === 'planning' || appState === 'executing';

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">

        {/* ── Hero ── */}
        <div className="text-center pt-4 pb-8 border-b border-zinc-800">
          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="text-3xl">🔮</span>
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.35em]">ProphetOS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-snug mb-3">
            别的工具问 AI。
            <br />
            <span className="text-emerald-400">ProphetOS 问 50 个真实买家。</span>
          </h1>
          <p className="text-sm text-zinc-500 mb-4">
            说一句话，睡一觉，德语 Listing 已经在了。
          </p>
          <span className={`text-xs font-mono px-3 py-1 rounded-full ${STATUS_STYLES[appState]}`}>
            {STATUS_LABEL[appState]}
          </span>
        </div>

        {/* ── Before / After (idle only) ── */}
        {appState === 'idle' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-zinc-800/50 rounded-xl p-4">
            <div>
              <p className="text-red-400/60 font-mono text-[10px] uppercase tracking-widest mb-3">BEFORE — 今天的工作流</p>
              <div className="space-y-2">
                {[
                  ['打开 JS 看趋势', '15 min'],
                  ['ChatGPT 写 Listing', '30 min'],
                  ['DeepL 翻译德语', '20 min'],
                  ['查 HS 编码 + 合规', '60 min'],
                  ['亚马逊后台填写', '30 min'],
                ].map(([label, time]) => (
                  <div key={label} className="flex justify-between text-xs text-zinc-600">
                    <span>{label}</span>
                    <span className="text-red-400/50 font-mono">{time}</span>
                  </div>
                ))}
                <div className="border-t border-zinc-800 pt-2 flex justify-between text-xs font-mono text-zinc-500">
                  <span>合计</span>
                  <span className="text-red-400">~3 小时 · 8 个 tab</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-emerald-400/60 font-mono text-[10px] uppercase tracking-widest mb-3">AFTER — ProphetOS</p>
              <div className="space-y-2">
                {[
                  ['打字说一句话', '5 s'],
                  ['喝杯咖啡 ☕', '38 s'],
                ].map(([label, time]) => (
                  <div key={label} className="flex justify-between text-xs text-zinc-600">
                    <span>{label}</span>
                    <span className="text-emerald-400/50 font-mono">{time}</span>
                  </div>
                ))}
                <div className="border-t border-zinc-800 pt-2 flex justify-between text-xs font-mono text-zinc-500">
                  <span>合计</span>
                  <span className="text-emerald-400">43 秒 · 零断点</span>
                </div>
              </div>
              <p className="text-emerald-400/30 text-[10px] mt-3 font-mono">快 250 倍。全程无人工干预。</p>
            </div>
          </div>
        )}

        {/* ── Planner thinking animation ── */}
        {appState === 'planning' && (
          <div className="border border-yellow-800/30 bg-yellow-950/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-xs text-yellow-400/80 font-mono">Planner Agent 正在规划执行路径…</span>
            </div>
            <div className="space-y-1.5">
              {[
                '💭 "分析品类和目标市场背景…"',
                '💭 "模拟目标买家群体的购买意愿…"',
                '💭 "根据爆发概率决定是否分支生成上架材料…"',
                '💭 "规划 DAG 步骤和并行执行策略…"',
              ].map((line, i) => (
                <p key={i} className="text-xs text-zinc-600 font-mono">{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* ── Skills Panel (idle only) ── */}
        {appState === 'idle' && <SkillsPanel />}

        {/* ── Intent Console ── */}
        <IntentConsole
          value={intent}
          onChange={setIntent}
          onSubmit={handleRun}
          loading={loading}
        />

        {/* ── Error ── */}
        {appState === 'error' && errorMsg && (
          <div className="border border-red-800 bg-red-950/50 rounded-lg p-4 text-sm text-red-400 font-mono">
            ✗ {errorMsg}
          </div>
        )}

        {/* ── DAG Timeline ── */}
        {plan && (
          <PlanTimeline
            steps={plan.steps}
            stepStatus={stepStatus}
            stepOutputs={stepOutputs}
            goal={plan.goal}
            reasoning={plan.reasoning}
          />
        )}

        {/* ── Execution Log (collapsible) ── */}
        {log.length > 0 && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2 text-xs font-mono text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900 transition-colors"
              onClick={() => setShowLog(v => !v)}
            >
              <span className="uppercase tracking-widest">Execution Log ({log.length})</span>
              <span>{showLog ? '▲' : '▼'}</span>
            </button>
            {showLog && (
              <div className="px-4 pb-3 font-mono text-xs text-zinc-400 space-y-0.5 max-h-40 overflow-y-auto border-t border-zinc-800">
                {log.map((l, i) => <div key={i} className="py-0.5">{l}</div>)}
              </div>
            )}
          </div>
        )}

        {/* ── Artifact Tabs ── */}
        {appState === 'done' && Object.keys(stepOutputs).length > 0 && (
          <ArtifactTabs stepOutputs={stepOutputs} />
        )}

        {/* ── Final Report ── */}
        {appState === 'done' && Object.keys(stepOutputs).length > 0 && (
          <FinalReport stepOutputs={stepOutputs} />
        )}
      </div>
    </main>
  );
}
