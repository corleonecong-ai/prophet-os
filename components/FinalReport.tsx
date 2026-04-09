'use client';

interface FinalReportProps {
  stepOutputs: Record<string, unknown>;
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return JSON.stringify(v, null, 2);
}

function extractReport(stepOutputs: Record<string, unknown>) {
  // Try to find the last llm.generate output that looks like a final report
  const outputs = Object.values(stepOutputs) as Array<{ output?: unknown; status?: string }>;

  for (const o of outputs.reverse()) {
    const out = o?.output;
    if (out && typeof out === 'object') {
      const r = out as Record<string, unknown>;
      if ('burst_prob' in r || 'listing_de' in r || 'verdict' in r) return r;
      // unwrap nested json field
      if ('json' in r && typeof r.json === 'object') return r.json as Record<string, unknown>;
    }
  }
  return null;
}

function BurstMeter({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-2xl font-bold text-zinc-100">{pct}%</span>
    </div>
  );
}

export default function FinalReport({ stepOutputs }: FinalReportProps) {
  const report = extractReport(stepOutputs);

  if (!report) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4">
        <p className="text-zinc-500 text-sm font-mono">执行完成，原始输出：</p>
        <pre className="text-xs text-zinc-400 mt-2 overflow-auto max-h-96">
          {JSON.stringify(stepOutputs, null, 2)}
        </pre>
      </div>
    );
  }

  const burstProb = typeof report.burst_prob === 'number' ? report.burst_prob : null;
  const verdict = safeStr(report.verdict);
  const recommendation = safeStr(report.recommendation);
  const listing = report.listing_de as Record<string, unknown> | null;
  const compliance = report.compliance as Record<string, unknown> | null;
  const keywords = Array.isArray(report.keywords) ? report.keywords as string[] : null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Final Report</h2>

      {/* Burst Probability */}
      {burstProb !== null && (
        <div className="border border-zinc-700 rounded-lg p-4">
          <p className="text-xs text-zinc-500 font-mono mb-2">🔮 Burst Probability</p>
          <BurstMeter prob={burstProb} />
          {verdict && <p className="text-sm text-zinc-300 mt-2">{verdict}</p>}
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div className="border border-zinc-700 rounded-lg p-4">
          <p className="text-xs text-zinc-500 font-mono mb-2">💡 Recommendation</p>
          <p className="text-sm text-zinc-300">{recommendation}</p>
        </div>
      )}

      {/* German Listing */}
      {listing && (
        <div className="border border-violet-800 rounded-lg p-4">
          <p className="text-xs text-violet-400 font-mono mb-3">🇩🇪 German Listing</p>
          {!!listing.title && (
            <p className="text-sm font-semibold text-zinc-100 mb-2">{safeStr(listing.title)}</p>
          )}
          {Array.isArray(listing.bullets) && (
            <ul className="text-sm text-zinc-300 space-y-1 mb-2 list-none">
              {(listing.bullets as string[]).map((b, i) => (
                <li key={i} className="flex gap-2"><span className="text-violet-400">•</span>{b}</li>
              ))}
            </ul>
          )}
          {!!listing.description && (
            <p className="text-xs text-zinc-500 mt-2 border-t border-zinc-800 pt-2">{safeStr(listing.description)}</p>
          )}
        </div>
      )}

      {/* Compliance */}
      {compliance && (
        <div className="border border-zinc-700 rounded-lg p-4">
          <p className="text-xs text-zinc-500 font-mono mb-2">✅ Compliance (DE)</p>
          <pre className="text-xs text-zinc-400 overflow-auto">{JSON.stringify(compliance, null, 2)}</pre>
        </div>
      )}

      {/* Keywords */}
      {keywords && keywords.length > 0 && (
        <div className="border border-zinc-700 rounded-lg p-4">
          <p className="text-xs text-zinc-500 font-mono mb-2">🔑 SEO Keywords ({keywords.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw, i) => (
              <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
