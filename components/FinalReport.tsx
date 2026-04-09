'use client';

import { useState, useCallback } from 'react';

interface FinalReportProps {
  stepOutputs: Record<string, unknown>;
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors shrink-0 ${
        copied
          ? 'bg-emerald-900/60 text-emerald-400'
          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
      }`}
    >
      {copied ? '✓ 已复制' : label}
    </button>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return JSON.stringify(v, null, 2);
}

function unwrap(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // StepResult wrapper: { output: {...}, status: "done", startedAt, doneAt }
  const inner = 'output' in r && r.output && typeof r.output === 'object'
    ? r.output as Record<string, unknown>
    : r;
  // nested json field
  if ('json' in inner && inner.json && typeof inner.json === 'object') {
    return { ...inner, ...(inner.json as Record<string, unknown>) };
  }
  return inner;
}

function getDuration(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.startedAt === 'number' && typeof r.doneAt === 'number') {
    return r.doneAt - r.startedAt;
  }
  return null;
}

// ── extractor: scans all step outputs and pulls structured data ───────────────

interface ExtractedData {
  // Prophet
  personas: Array<{ name?: string; score?: number; verdict?: string; quote?: string }>;
  avgScore: number | null;
  burstProb: number | null;
  simulationSummary: string | null;
  // Atlas
  category: string | null;
  subcategory: string | null;
  marketMaturity: string | null;
  topCompetitors: string[];
  priceRange: Record<string, unknown> | null;
  certifications: string[];
  atlasSummary: string | null;
  // Listing
  listingTitle: string | null;
  listingBullets: string[];
  listingDescription: string | null;
  listingKeywords: string[];
  // Reasoning
  reasonAnswer: string | null;
  reasonSteps: string[];
  reasonBurstProb: number | null;
  // Final report
  verdict: string | null;
  recommendation: string | null;
  // Execution stats
  stepCount: number;
  doneCount: number;
  failedCount: number;
  skippedCount: number;
  totalDuration: number | null;
  stepDurations: Array<{ id: string; ms: number }>;
}

function extractAllData(stepOutputs: Record<string, unknown>): ExtractedData {
  const result: ExtractedData = {
    personas: [], avgScore: null, burstProb: null, simulationSummary: null,
    category: null, subcategory: null, marketMaturity: null,
    topCompetitors: [], priceRange: null, certifications: [], atlasSummary: null,
    listingTitle: null, listingBullets: [], listingDescription: null, listingKeywords: [],
    reasonAnswer: null, reasonSteps: [], reasonBurstProb: null,
    verdict: null, recommendation: null,
    stepCount: 0, doneCount: 0, failedCount: 0, skippedCount: 0,
    totalDuration: null, stepDurations: [],
  };

  const entries = Object.entries(stepOutputs);
  result.stepCount = entries.length;

  let totalMs = 0;
  let hasTime = false;

  for (const [id, rawStep] of entries) {
    // Execution stats
    const r = rawStep as Record<string, unknown>;
    const status = r.status as string | undefined;
    if (status === 'done') result.doneCount++;
    else if (status === 'failed') result.failedCount++;
    else if (status === 'skipped') result.skippedCount++;

    const dur = getDuration(rawStep);
    if (dur !== null) {
      result.stepDurations.push({ id, ms: dur });
      totalMs += dur;
      hasTime = true;
    }

    const d = unwrap(rawStep);
    if (!d) continue;

    // ── Atlas / kb.lookup ──
    if (d.category || d.entry) {
      const entry = (d.entry && typeof d.entry === 'object') ? d.entry as Record<string, unknown> : d;
      if (entry.category) result.category = safeStr(entry.category);
      if (entry.subcategory) result.subcategory = safeStr(entry.subcategory);
      if (entry.market_maturity) result.marketMaturity = safeStr(entry.market_maturity);
      if (Array.isArray(entry.top_competitors)) result.topCompetitors = (entry.top_competitors as string[]).slice(0, 5);
      if (entry.price_range && typeof entry.price_range === 'object') result.priceRange = entry.price_range as Record<string, unknown>;
      if (Array.isArray(entry.certifications_required)) result.certifications = entry.certifications_required as string[];
      if (typeof entry.source === 'string') result.atlasSummary = entry.source === 'ontology' ? '本体知识库 (v1.0)' : '推断生成';
    }

    // ── Prophet / llm.simulate ──
    if (Array.isArray(d.personas)) {
      result.personas = (d.personas as Array<Record<string, unknown>>).map(p => ({
        name: typeof p.name === 'string' ? p.name : undefined,
        score: typeof p.score === 'number' ? p.score : undefined,
        verdict: typeof p.verdict === 'string' ? p.verdict : undefined,
        quote: typeof p.quote === 'string' ? p.quote : typeof p.comment === 'string' ? p.comment : undefined,
      }));
      if (typeof d.score === 'number') result.avgScore = d.score;
      if (typeof d.burst_prob === 'number') result.burstProb = d.burst_prob;
      if (typeof d.summary === 'string') result.simulationSummary = d.summary;
    }

    // ── llm.reason ──
    if (typeof d.answer === 'string' && result.reasonAnswer === null) {
      result.reasonAnswer = d.answer;
      if (Array.isArray(d.steps)) result.reasonSteps = d.steps as string[];
      if (typeof d.burst_prob === 'number') result.reasonBurstProb = d.burst_prob;
    }

    // ── llm.generate: German listing ──
    if (typeof d.title === 'string' && result.listingTitle === null) {
      result.listingTitle = d.title;
      if (Array.isArray(d.bullets)) result.listingBullets = d.bullets as string[];
      if (typeof d.description === 'string') result.listingDescription = d.description;
      if (Array.isArray(d.keywords)) result.listingKeywords = d.keywords as string[];
    }

    // ── Final report (listing_de wrapped) ──
    if (typeof d.verdict === 'string') result.verdict = d.verdict;
    if (typeof d.recommendation === 'string') result.recommendation = d.recommendation;
    if (typeof d.burst_prob === 'number' && result.burstProb === null) result.burstProb = d.burst_prob;

    const listingDe = d.listing_de as Record<string, unknown> | undefined;
    if (listingDe && result.listingTitle === null) {
      if (typeof listingDe.title === 'string') result.listingTitle = listingDe.title;
      if (Array.isArray(listingDe.bullets)) result.listingBullets = listingDe.bullets as string[];
      if (typeof listingDe.description === 'string') result.listingDescription = listingDe.description;
    }

    // ── llm.expand: keywords ──
    if (Array.isArray(d.items) && result.listingKeywords.length === 0) {
      result.listingKeywords = d.items as string[];
    }
  }

  if (hasTime) result.totalDuration = totalMs;
  // Prefer simulation burst_prob over reason, over final report
  if (result.burstProb === null && result.reasonBurstProb !== null) result.burstProb = result.reasonBurstProb;

  return result;
}

// ── sub-components ────────────────────────────────────────────────────────────

function BurstGauge({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const label = pct >= 70 ? '强力推荐进入' : pct >= 50 ? '有条件推荐' : '暂不建议';
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference * (1 - prob);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#27272a" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black font-mono" style={{ color }}>{pct}%</span>
          <span className="text-[10px] text-zinc-500 font-mono">爆款概率</span>
        </div>
      </div>
      <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: `${color}22`, color }}>{label}</span>
    </div>
  );
}

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-400 w-8 text-right">{score.toFixed(1)}</span>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="text-xl mt-0.5">{icon}</span>
      <div>
        <h3 className="text-sm font-bold text-zinc-100 font-mono">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function FinalReport({ stepOutputs }: FinalReportProps) {
  const d = extractAllData(stepOutputs);
  const burstProb = d.burstProb ?? 0;
  const burstPct = Math.round(burstProb * 100);
  const isViable = burstPct >= 50;

  const topPersonas = d.personas.filter(p => p.score !== undefined).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const scoreDistribution = [
    { label: '9-10', count: d.personas.filter(p => (p.score ?? 0) >= 9).length, color: 'bg-emerald-400' },
    { label: '7-8', count: d.personas.filter(p => (p.score ?? 0) >= 7 && (p.score ?? 0) < 9).length, color: 'bg-emerald-600' },
    { label: '5-6', count: d.personas.filter(p => (p.score ?? 0) >= 5 && (p.score ?? 0) < 7).length, color: 'bg-yellow-500' },
    { label: '1-4', count: d.personas.filter(p => (p.score ?? 0) > 0 && (p.score ?? 0) < 5).length, color: 'bg-red-500' },
  ];
  const maxDistCount = Math.max(...scoreDistribution.map(s => s.count), 1);

  const totalSecs = d.totalDuration !== null ? (d.totalDuration / 1000).toFixed(1) : null;
  const longestStep = d.stepDurations.sort((a, b) => b.ms - a.ms)[0];

  if (d.stepCount === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Section label ── */}
      <div className="flex items-center gap-3">
        <h2 className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Analysis Report</h2>
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-xs text-zinc-600 font-mono">{d.doneCount}/{d.stepCount} steps completed</span>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 1: Executive Summary
      ══════════════════════════════════════════════════ */}
      <div className={`border rounded-xl p-5 ${isViable ? 'border-emerald-800/60 bg-emerald-950/20' : 'border-red-800/40 bg-red-950/10'}`}>
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          {/* Gauge */}
          <BurstGauge prob={burstProb} />

          {/* Executive text */}
          <div className="flex-1">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">执行摘要 · Executive Summary</p>
            {d.verdict ? (
              <p className="text-sm text-zinc-200 leading-relaxed mb-3">{d.verdict}</p>
            ) : (
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                基于 Prophet 引擎对 {d.personas.length || '多'} 个目标买家 persona 的模拟，
                Atlas 本体知识库对德国户外市场的认知，以及 Claw DAG 执行链的综合推理，
                系统判断该品类进入概率为 <strong className="text-zinc-100">{burstPct}%</strong>。
              </p>
            )}
            {d.recommendation && (
              <p className="text-xs text-zinc-400 border-l-2 border-zinc-700 pl-3 italic">{d.recommendation}</p>
            )}
            {/* Quick stats row */}
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-zinc-800/50">
              {d.avgScore !== null && (
                <div className="text-center">
                  <p className="text-lg font-black font-mono text-emerald-400">{d.avgScore.toFixed(1)}</p>
                  <p className="text-[10px] text-zinc-600">平均评分 /10</p>
                </div>
              )}
              {d.personas.length > 0 && (
                <div className="text-center">
                  <p className="text-lg font-black font-mono text-blue-400">{d.personas.length}</p>
                  <p className="text-[10px] text-zinc-600">Persona 样本</p>
                </div>
              )}
              {d.topCompetitors.length > 0 && (
                <div className="text-center">
                  <p className="text-lg font-black font-mono text-violet-400">{d.topCompetitors.length}</p>
                  <p className="text-[10px] text-zinc-600">主要竞品</p>
                </div>
              )}
              {d.certifications.length > 0 && (
                <div className="text-center">
                  <p className="text-lg font-black font-mono text-yellow-400">{d.certifications.length}</p>
                  <p className="text-[10px] text-zinc-600">合规要求</p>
                </div>
              )}
              {d.listingKeywords.length > 0 && (
                <div className="text-center">
                  <p className="text-lg font-black font-mono text-zinc-300">{d.listingKeywords.length}</p>
                  <p className="text-[10px] text-zinc-600">关键词</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 2: Prophet Engine — Persona Intelligence
      ══════════════════════════════════════════════════ */}
      {(d.personas.length > 0 || d.simulationSummary || d.reasonAnswer) && (
        <div className="border border-zinc-800 rounded-xl p-5">
          <SectionHeader
            icon="🔮"
            title="Prophet Engine — 买家 Persona 模拟"
            subtitle={`基于消费者心理模型的多维度打分 · ${d.personas.length > 0 ? `${d.personas.length} 个 persona 已模拟` : '推理引擎综合评估'}`}
          />

          {/* Score distribution histogram */}
          {scoreDistribution.some(s => s.count > 0) && (
            <div className="mb-5">
              <p className="text-[10px] text-zinc-600 font-mono mb-3 uppercase tracking-wider">评分分布</p>
              <div className="flex items-end gap-3 h-20">
                {scoreDistribution.map(bucket => (
                  <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-zinc-500">{bucket.count}</span>
                    <div className="w-full flex items-end justify-center">
                      <div
                        className={`w-full ${bucket.color} rounded-t opacity-80`}
                        style={{ height: `${Math.max((bucket.count / maxDistCount) * 56, bucket.count > 0 ? 4 : 0)}px` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top & bottom personas */}
          {topPersonas.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">TOP PERSONAS</p>
              {topPersonas.slice(0, 3).map((p, i) => (
                <div key={i} className="bg-zinc-900 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-zinc-300">{p.name ?? `Persona ${i + 1}`}</span>
                    {p.score !== undefined && (
                      <span className={`text-xs font-bold font-mono ${p.score >= 7 ? 'text-emerald-400' : p.score >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {p.score.toFixed(1)}/10
                      </span>
                    )}
                  </div>
                  {p.score !== undefined && <ScoreBar score={p.score} />}
                  {p.verdict && <p className="text-[11px] text-zinc-500 mt-1.5">{p.verdict.slice(0, 100)}{p.verdict.length > 100 ? '…' : ''}</p>}
                  {p.quote && <p className="text-[11px] text-zinc-500 mt-1 italic border-l border-zinc-700 pl-2">{`"${p.quote.slice(0, 120)}"`}</p>}
                </div>
              ))}
              {topPersonas.length > 3 && (
                <p className="text-[10px] text-zinc-600 font-mono pl-1">+ {topPersonas.length - 3} 个其他 persona 数据已纳入均值计算</p>
              )}
            </div>
          )}

          {/* Simulation summary */}
          {d.simulationSummary && (
            <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
              <p className="text-[10px] text-zinc-600 font-mono mb-1 uppercase tracking-wider">模拟综述</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{d.simulationSummary}</p>
            </div>
          )}

          {/* Reasoning chain */}
          {d.reasonAnswer && (
            <div className="mt-3 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">推理引擎综合判断</p>
                {d.reasonBurstProb !== null && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${d.reasonBurstProb >= 0.7 ? 'bg-emerald-500' : d.reasonBurstProb >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.round(d.reasonBurstProb * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold font-mono ${d.reasonBurstProb >= 0.7 ? 'text-emerald-400' : d.reasonBurstProb >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {Math.round(d.reasonBurstProb * 100)}%
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{d.reasonAnswer.slice(0, 300)}{d.reasonAnswer.length > 300 ? '…' : ''}</p>
              {d.reasonSteps.length > 0 && (
                <div className="mt-2 space-y-1">
                  {d.reasonSteps.slice(0, 3).map((step, i) => (
                    <p key={i} className="text-[10px] text-zinc-600 flex gap-1.5">
                      <span className="text-zinc-700 shrink-0">{i + 1}.</span>
                      {safeStr(step).slice(0, 100)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 3: Atlas Engine — Market Intelligence
      ══════════════════════════════════════════════════ */}
      {(d.category || d.topCompetitors.length > 0 || d.certifications.length > 0) && (
        <div className="border border-zinc-800 rounded-xl p-5">
          <SectionHeader
            icon="🗺️"
            title="Atlas Engine — 德国市场知识图谱"
            subtitle={`本体知识库 · 品类定位 · 竞争格局 · 合规要求 ${d.atlasSummary ? `· ${d.atlasSummary}` : ''}`}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            {d.category && (
              <div className="bg-zinc-900 rounded-lg p-3">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider mb-2">品类定位</p>
                <p className="text-sm font-semibold text-zinc-100">{d.category}</p>
                {d.subcategory && <p className="text-xs text-zinc-500 mt-0.5">› {d.subcategory}</p>}
                {d.marketMaturity && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-zinc-600">市场成熟度</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                      d.marketMaturity.includes('成熟') || d.marketMaturity.toLowerCase().includes('mature')
                        ? 'bg-blue-950 text-blue-400'
                        : 'bg-emerald-950 text-emerald-400'
                    }`}>{d.marketMaturity}</span>
                  </div>
                )}
                {d.priceRange && (
                  <div className="mt-2 text-[10px] text-zinc-600">
                    价格带: <span className="text-zinc-400">
                      {safeStr(d.priceRange.min_eur ?? d.priceRange.min)} – {safeStr(d.priceRange.max_eur ?? d.priceRange.max)} EUR
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Competitors */}
            {d.topCompetitors.length > 0 && (
              <div className="bg-zinc-900 rounded-lg p-3">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider mb-2">主要竞品</p>
                <div className="space-y-1.5">
                  {d.topCompetitors.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-700 font-mono w-4">{i + 1}</span>
                      <span className="text-xs text-zinc-300">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance */}
            {d.certifications.length > 0 && (
              <div className="bg-zinc-900 rounded-lg p-3 sm:col-span-2">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider mb-2">德国合规认证要求</p>
                <div className="flex flex-wrap gap-2">
                  {d.certifications.map((cert, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-xs bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 px-2.5 py-1 rounded-full">
                      <span className="text-emerald-500 text-[10px]">✓</span>
                      {cert}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">
                  以上认证为德国亚马逊上架必要条件 · 务必在发货前完成资质备案
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 4: German Market Listing Package
      ══════════════════════════════════════════════════ */}
      {(d.listingTitle || d.listingBullets.length > 0 || d.listingKeywords.length > 0) && (
        <div className="border border-violet-800/50 rounded-xl p-5 bg-violet-950/10">
          <SectionHeader
            icon="🇩🇪"
            title="德国市场上架包 — German Listing Package"
            subtitle="由 Claw DAG 链路编排生成 · 可直接导入 Amazon Seller Central"
          />

          {/* Title */}
          {d.listingTitle && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">产品标题 · Title</p>
                <CopyButton text={d.listingTitle} />
              </div>
              <p className="text-sm font-semibold text-zinc-100 leading-relaxed bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                {d.listingTitle}
              </p>
            </div>
          )}

          {/* Bullets */}
          {d.listingBullets.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">卖点 Bullets ({d.listingBullets.length}条)</p>
                <CopyButton text={d.listingBullets.map((b, i) => `• ${b}`).join('\n')} />
              </div>
              <ul className="space-y-2">
                {d.listingBullets.map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-zinc-300 bg-zinc-900 rounded-lg p-2.5 border border-zinc-800">
                    <span className="text-violet-400 font-bold shrink-0">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Description */}
          {d.listingDescription && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">产品描述 · Description</p>
                <CopyButton text={d.listingDescription} />
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                {d.listingDescription}
              </p>
            </div>
          )}

          {/* Keywords */}
          {d.listingKeywords.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
                  后台关键词 · Backend Keywords ({d.listingKeywords.length}个)
                </p>
                <CopyButton text={d.listingKeywords.join(', ')} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.listingKeywords.slice(0, 30).map((kw, i) => (
                  <span key={i} className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                    {kw}
                  </span>
                ))}
                {d.listingKeywords.length > 30 && (
                  <span className="text-[10px] font-mono text-zinc-600 px-2 py-0.5">+{d.listingKeywords.length - 30} more</span>
                )}
              </div>
            </div>
          )}

          {/* Download button */}
          {(d.listingTitle || d.listingBullets.length > 0) && (
            <div className="mt-5 pt-4 border-t border-violet-800/30">
              <button
                onClick={() => {
                  const lines: string[] = ['=== ProphetOS 上架材料包 ===', ''];
                  if (d.listingTitle) lines.push('【标题】', d.listingTitle, '');
                  if (d.listingBullets.length > 0) {
                    lines.push('【卖点 Bullets】');
                    d.listingBullets.forEach((b, i) => lines.push(`${i + 1}. ${b}`));
                    lines.push('');
                  }
                  if (d.listingDescription) lines.push('【产品描述】', d.listingDescription, '');
                  if (d.listingKeywords.length > 0) lines.push('【后台关键词】', d.listingKeywords.join(', '), '');
                  if (d.certifications.length > 0) lines.push('【合规认证】', d.certifications.join(', '), '');
                  if (d.burstProb !== null) lines.push(`【爆款概率】${Math.round(d.burstProb * 100)}% (${d.personas.length} personas)`);
                  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'prophet-os-listing-package.txt';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="w-full py-2.5 bg-violet-700 hover:bg-violet-600 text-white text-sm font-mono rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>📦</span>
                <span>下载完整材料包</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 5: Claw Engine — DAG Execution Stats
      ══════════════════════════════════════════════════ */}
      <div className="border border-zinc-800 rounded-xl p-5">
        <SectionHeader
          icon="⚡"
          title="Claw Engine — DAG 执行追踪"
          subtitle="智能编排 · 并行分层执行 · 条件依赖推理"
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-black font-mono text-zinc-100">{d.doneCount}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">完成步骤</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-black font-mono text-red-400">{d.failedCount}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">失败步骤</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-black font-mono text-zinc-500">{d.skippedCount}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">跳过步骤</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-black font-mono text-blue-400">{totalSecs ?? '—'}<span className="text-sm text-zinc-600">s</span></p>
            <p className="text-[10px] text-zinc-600 mt-0.5">总耗时</p>
          </div>
        </div>

        {/* Per-step duration bars */}
        {d.stepDurations.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider mb-2">各步骤耗时</p>
            <div className="space-y-1.5">
              {d.stepDurations.slice(0, 8).map(({ id, ms }) => {
                const maxMs = longestStep?.ms ?? 1;
                const pct = (ms / maxMs) * 100;
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-600 w-6 shrink-0">{id}</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 w-14 text-right shrink-0">
                      {ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
          <p className="text-[10px] text-zinc-700 font-mono">
            Powered by ProphetOS · Prophet × Atlas × Claw
          </p>
          <span className="text-[10px] font-mono text-emerald-600 bg-emerald-950/40 px-2 py-1 rounded-full">
            🤖 全程无人工干预
          </span>
        </div>
      </div>
    </div>
  );
}
