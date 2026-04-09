'use client';

import { useState, useRef } from 'react';
import IntentInput from '@/components/IntentInput';
import PlanTimeline from '@/components/PlanTimeline';
import type { StepStatus } from '@/components/PlanTimeline';
import FinalReport from '@/components/FinalReport';
import type { Plan } from '@/lib/planner/parse';

type AppState = 'idle' | 'planning' | 'executing' | 'done' | 'error';

export default function Home() {
  const [intent, setIntent] = useState('帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料');
  const [appState, setAppState] = useState<AppState>('idle');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({});
  const [stepOutputs, setStepOutputs] = useState<Record<string, unknown>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  function addLog(msg: string) {
    setLog((prev) => [...prev.slice(-50), msg]);
  }

  async function handleRun() {
    if (!intent.trim()) return;

    // Reset state
    setPlan(null);
    setStepStatus({});
    setStepOutputs({});
    setErrorMsg('');
    setLog([]);
    setAppState('planning');
    addLog('⟳ Calling Planner...');

    try {
      // Step 1: Get plan
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

      // Initialize step statuses
      const initialStatus: Record<string, StepStatus> = {};
      for (const s of newPlan.steps) initialStatus[s.id] = 'pending';
      setStepStatus(initialStatus);

      addLog(`✓ Plan ready: ${newPlan.steps.length} steps (attempt ${planData.attempts})`);
      setAppState('executing');

      // Step 2: Execute via SSE
      abortRef.current = new AbortController();

      const execRes = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
        signal: abortRef.current.signal,
      });

      if (!execRes.ok || !execRes.body) {
        throw new Error('Execute endpoint failed');
      }

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
          } catch (parseErr) {
            // Skip malformed SSE lines
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
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-800 pb-6">
          <span className="text-2xl">🔮</span>
          <div>
            <h1 className="text-xl font-mono font-bold text-zinc-100">ProphetOS</h1>
            <p className="text-xs text-zinc-500 font-mono">Intent → Planner → DAG → Report</p>
          </div>
          <div className="ml-auto">
            <span className={`text-xs font-mono px-2 py-1 rounded ${
              appState === 'idle' ? 'bg-zinc-800 text-zinc-500' :
              appState === 'planning' ? 'bg-yellow-900 text-yellow-400 animate-pulse' :
              appState === 'executing' ? 'bg-blue-900 text-blue-400 animate-pulse' :
              appState === 'done' ? 'bg-emerald-900 text-emerald-400' :
              'bg-red-900 text-red-400'
            }`}>
              {appState.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Intent Input */}
        <IntentInput
          value={intent}
          onChange={setIntent}
          onSubmit={handleRun}
          loading={loading}
        />

        {/* Error */}
        {appState === 'error' && errorMsg && (
          <div className="border border-red-800 bg-red-950 rounded-lg p-4 text-sm text-red-400 font-mono">
            ✗ {errorMsg}
          </div>
        )}

        {/* Plan Info */}
        {plan && (
          <div className="border border-zinc-800 rounded-lg p-4">
            <p className="text-xs text-zinc-500 font-mono mb-1">Goal</p>
            <p className="text-sm text-zinc-300">{plan.goal}</p>
            <p className="text-xs text-zinc-600 mt-1 font-mono">{plan.reasoning}</p>
          </div>
        )}

        {/* DAG Timeline */}
        {plan && <PlanTimeline steps={plan.steps} stepStatus={stepStatus} />}

        {/* Execution Log */}
        {log.length > 0 && (
          <div className="border border-zinc-800 rounded-lg p-4">
            <p className="text-xs text-zinc-500 font-mono mb-2 uppercase tracking-widest">Execution Log</p>
            <div className="font-mono text-xs text-zinc-400 space-y-0.5 max-h-40 overflow-y-auto">
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        )}

        {/* Final Report */}
        {appState === 'done' && Object.keys(stepOutputs).length > 0 && (
          <FinalReport stepOutputs={stepOutputs} />
        )}
      </div>
    </main>
  );
}
