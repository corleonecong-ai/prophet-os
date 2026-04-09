'use client';

import { useState } from 'react';

interface ArtifactTabsProps {
  stepOutputs: Record<string, unknown>;
}

function unwrap(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const inner = ('output' in r && r.output && typeof r.output === 'object')
    ? r.output as Record<string, unknown> : r;
  if ('json' in inner && inner.json && typeof inner.json === 'object')
    return { ...inner, ...(inner.json as Record<string, unknown>) };
  return inner;
}

type ArtifactType = 'listing' | 'compliance' | 'keywords' | 'burst';

interface ExtractedArtifacts {
  listing: Record<string, unknown> | null;
  compliance: Record<string, unknown> | null;
  keywords: Record<string, unknown> | null;
  burst: Record<string, unknown> | null;
}

function extractArtifacts(stepOutputs: Record<string, unknown>): ExtractedArtifacts {
  const artifacts: ExtractedArtifacts = {
    listing: null,
    compliance: null,
    keywords: null,
    burst: null,
  };

  Object.values(stepOutputs).forEach((value) => {
    const unwrapped = unwrap(value);
    if (!unwrapped) return;

    // 德语 Listing: title or bullets
    if (!artifacts.listing && ('title' in unwrapped || 'bullets' in unwrapped)) {
      artifacts.listing = unwrapped;
    }

    // 合规清单: certifications_required
    if (!artifacts.compliance && ('certifications_required' in unwrapped || ('entry' in unwrapped &&
        typeof unwrapped.entry === 'object' && unwrapped.entry !== null && 'certifications_required' in unwrapped.entry))) {
      artifacts.compliance = unwrapped;
    }

    // 关键词池: items array
    if (!artifacts.keywords && 'items' in unwrapped && Array.isArray(unwrapped.items)) {
      artifacts.keywords = unwrapped;
    }

    // 爆款报告: burst_prob, score, or actionable_insights
    if (!artifacts.burst && ('burst_prob' in unwrapped || 'score' in unwrapped || 'actionable_insights' in unwrapped)) {
      artifacts.burst = unwrapped;
    }
  });

  return artifacts;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-zinc-500 hover:text-violet-400 transition-colors text-xs font-mono"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function ListingTab({ data }: { data: Record<string, unknown> | null }) {
  if (!data) {
    return (
      <div className="text-zinc-500 text-sm">
        暂无数据 — 需运行包含 llm.generate 的 DAG
      </div>
    );
  }

  const title = data.title ? String(data.title) : null;
  const bullets = Array.isArray(data.bullets) ? data.bullets : [];

  const textContent = [title, ...bullets.map(String)].filter(Boolean).join('\n');

  return (
    <div className="space-y-4">
      <div className="absolute top-4 right-4">
        <CopyButton text={textContent} />
      </div>
      {title && (
        <h3 className="text-zinc-100 font-semibold text-lg">{title}</h3>
      )}
      {bullets.length > 0 && (
        <ul className="space-y-2">
          {bullets.map((bullet, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="text-violet-400 flex-shrink-0">●</span>
              <span className="text-zinc-300">{String(bullet)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComplianceTab({ data }: { data: Record<string, unknown> | null }) {
  if (!data) {
    return (
      <div className="text-zinc-500 text-sm">
        暂无数据 — 需运行包含合规检查的 DAG
      </div>
    );
  }

  let certs: unknown[] = [];
  let category: string | null = null;
  let subcategory: string | null = null;

  if (Array.isArray(data.certifications_required)) {
    certs = data.certifications_required;
  } else if ('entry' in data && data.entry && typeof data.entry === 'object') {
    const entry = data.entry as Record<string, unknown>;
    if (Array.isArray(entry.certifications_required)) {
      certs = entry.certifications_required;
    }
  }

  if ('category' in data) category = String(data.category);
  if ('subcategory' in data) subcategory = String(data.subcategory);

  const textContent = [
    category && `分类: ${category}`,
    subcategory && `子分类: ${subcategory}`,
    ...certs.map(c => String(c))
  ].filter(Boolean).join('\n');

  if (certs.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        暂无数据 — 需运行包含合规检查的 DAG
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="absolute top-4 right-4">
        <CopyButton text={textContent} />
      </div>
      {(category || subcategory) && (
        <div className="text-sm text-zinc-400">
          {category && <div>分类: <span className="text-zinc-200">{category}</span></div>}
          {subcategory && <div>子分类: <span className="text-zinc-200">{subcategory}</span></div>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {certs.map((cert, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-3 py-1 bg-green-900 text-green-200 text-sm rounded-full font-mono"
          >
            {String(cert)}
          </span>
        ))}
      </div>
    </div>
  );
}

function KeywordsTab({ data }: { data: Record<string, unknown> | null }) {
  if (!data) {
    return (
      <div className="text-zinc-500 text-sm">
        暂无数据 — 需运行包含关键词生成的 DAG
      </div>
    );
  }

  const items = Array.isArray(data.items) ? data.items : [];

  if (items.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        暂无数据 — 需运行包含关键词生成的 DAG
      </div>
    );
  }

  const textContent = items.map(String).join(', ');

  return (
    <div className="space-y-3">
      <div className="absolute top-4 right-4">
        <CopyButton text={textContent} />
      </div>
      <div className="text-xs text-zinc-500 font-mono">共 {items.length} 个关键词</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <span
            key={idx}
            className="inline-block px-2.5 py-1 bg-zinc-800 text-zinc-300 text-xs font-mono rounded border border-zinc-700"
          >
            {String(item)}
          </span>
        ))}
      </div>
    </div>
  );
}

function BurstTab({ data }: { data: Record<string, unknown> | null }) {
  if (!data) {
    return (
      <div className="text-zinc-500 text-sm">
        暂无数据 — 需运行包含爆款分析的 DAG
      </div>
    );
  }

  let burstProb: number | null = null;
  let score: number | null = null;
  let insights: string[] = [];
  let rationale: string | null = null;

  if ('burst_prob' in data && typeof data.burst_prob === 'number') {
    burstProb = data.burst_prob;
  }
  if ('score' in data && typeof data.score === 'number') {
    score = data.score;
  }
  if ('actionable_insights' in data && Array.isArray(data.actionable_insights)) {
    insights = data.actionable_insights.map(String);
  }
  if ('rationale' in data) {
    rationale = String(data.rationale);
  }

  const displayValue = burstProb ?? score;
  const textContent = [
    displayValue !== null && `${Math.round(displayValue * 100)}%`,
    ...insights,
    rationale && `原因: ${rationale}`
  ].filter(Boolean).join('\n');

  if (displayValue === null && insights.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        暂无数据 — 需运行包含爆款分析的 DAG
      </div>
    );
  }

  const percent = displayValue !== null ? Math.round(displayValue * 100) : 0;
  let color = 'text-red-400';
  if (percent >= 70) color = 'text-green-400';
  else if (percent >= 50) color = 'text-yellow-400';

  return (
    <div className="space-y-4">
      <div className="absolute top-4 right-4">
        <CopyButton text={textContent} />
      </div>
      {displayValue !== null && (
        <div className={`text-6xl font-bold ${color}`}>
          {percent}%
        </div>
      )}
      {insights.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-zinc-400">可行洞察：</div>
          <ul className="space-y-1">
            {insights.map((insight, idx) => (
              <li key={idx} className="text-sm text-zinc-300 flex gap-2">
                <span className="text-violet-400 flex-shrink-0">▸</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rationale && (
        <div className="text-sm italic text-zinc-400">
          {rationale}
        </div>
      )}
    </div>
  );
}

const TABS: { type: ArtifactType; label: string; icon: string }[] = [
  { type: 'listing', label: '德语 Listing', icon: '🇩🇪' },
  { type: 'compliance', label: '合规清单', icon: '✅' },
  { type: 'keywords', label: '关键词池', icon: '🔑' },
  { type: 'burst', label: '爆款报告', icon: '📊' },
];

export default function ArtifactTabs({ stepOutputs }: ArtifactTabsProps) {
  const [activeTab, setActiveTab] = useState<number>(0);
  const artifacts = extractArtifacts(stepOutputs);
  const artifactList: (Record<string, unknown> | null)[] = [
    artifacts.listing,
    artifacts.compliance,
    artifacts.keywords,
    artifacts.burst,
  ];

  const currentData = artifactList[activeTab];

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        交付物 · Artifacts
      </div>

      <div className="flex gap-6 border-b border-zinc-800">
        {TABS.map((tab, idx) => (
          <button
            key={idx}
            onClick={() => setActiveTab(idx)}
            className={`pb-3 text-sm font-mono transition-colors flex items-center gap-1.5 ${
              idx === activeTab
                ? 'text-violet-400 border-b-2 border-violet-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="relative bg-zinc-900 rounded-xl p-4 min-h-32">
        {activeTab === 0 && <ListingTab data={currentData} />}
        {activeTab === 1 && <ComplianceTab data={currentData} />}
        {activeTab === 2 && <KeywordsTab data={currentData} />}
        {activeTab === 3 && <BurstTab data={currentData} />}
      </div>
    </div>
  );
}
