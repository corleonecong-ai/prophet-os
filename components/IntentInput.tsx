'use client';

interface IntentInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function IntentInput({ value, onChange, onSubmit, loading }: IntentInputProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm text-zinc-400 font-mono">意图 / Intent</label>
      <textarea
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-zinc-100 font-mono text-sm resize-none focus:outline-none focus:border-violet-500 transition-colors"
        rows={3}
        placeholder="帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-600 font-mono">⌘+Enter to run</span>
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-mono rounded-lg transition-colors"
        >
          {loading ? '⟳ Planning...' : '▶ Plan & Run'}
        </button>
      </div>
    </div>
  );
}
