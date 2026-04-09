'use client';

import { PRESET_INTENTS } from '@/lib/presets';

interface IntentConsoleProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function IntentConsole({ value, onChange, onSubmit, loading }: IntentConsoleProps) {
  const handlePresetClick = (intent: string) => {
    onChange(intent);
  };

  return (
    <div className="flex flex-col gap-4">
      <textarea
        className="w-full h-24 bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-zinc-100 font-mono text-sm resize-none focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-60"
        placeholder="说一句话，ProphetOS 帮你做完剩下的事…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
      />

      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {PRESET_INTENTS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset.intent)}
              disabled={loading}
              className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:opacity-50 text-zinc-400 hover:text-zinc-200 rounded-full transition-colors font-mono"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-mono rounded-lg transition-colors"
        >
          {loading ? '⟳ 执行中…' : '▶ Plan & Run'}
        </button>
      </div>

      <div className="text-[10px] text-zinc-600 font-mono">
        💡 预设意图 ↑  ·  ⌘+Enter 快速执行
      </div>
    </div>
  );
}
