'use client';

const SKILLS = [
  {
    id: 'llm.simulate',
    icon: '🔮',
    name: 'llm.simulate',
    label: 'Prophet 买家模拟',
    desc: '模拟 N 个真实买家 persona，7维立体画像，AIDA漏斗打分，输出驱动/阻碍因素 + 执行清单',
    engine: 'Prophet Engine',
    color: 'border-violet-800/50 bg-violet-950/10 text-violet-300',
    tag: 'text-violet-400 bg-violet-950',
  },
  {
    id: 'kb.lookup',
    icon: '🗺️',
    name: 'kb.lookup',
    label: 'Atlas 知识图谱',
    desc: '查询本体知识库：品类定位、德国合规认证、竞品格局、价格带、季节性数据',
    engine: 'Atlas Engine',
    color: 'border-blue-800/50 bg-blue-950/10 text-blue-300',
    tag: 'text-blue-400 bg-blue-950',
  },
  {
    id: 'llm.reason',
    icon: '🧠',
    name: 'llm.reason',
    label: '推理引擎',
    desc: '多步推理链，综合上游输出做概率判断，输出结构化结论 + burst_prob',
    engine: 'Claude Reasoning',
    color: 'border-emerald-800/50 bg-emerald-950/10 text-emerald-300',
    tag: 'text-emerald-400 bg-emerald-950',
  },
  {
    id: 'llm.generate',
    icon: '✍️',
    name: 'llm.generate',
    label: '内容生成',
    desc: '生成结构化内容：德语/中文 Listing 标题、5条卖点、产品描述、最终分析报告',
    engine: 'Claude Generation',
    color: 'border-amber-800/50 bg-amber-950/10 text-amber-300',
    tag: 'text-amber-400 bg-amber-950',
  },
  {
    id: 'llm.expand',
    icon: '🔑',
    name: 'llm.expand',
    label: '关键词扩展',
    desc: '语义扩展生成德语长尾关键词池，按搜索意图分类，可直接导入亚马逊后台',
    engine: 'Claude Expansion',
    color: 'border-cyan-800/50 bg-cyan-950/10 text-cyan-300',
    tag: 'text-cyan-400 bg-cyan-950',
  },
  {
    id: 'llm.transform',
    icon: '🔄',
    name: 'llm.transform',
    label: '格式转换',
    desc: '结构转换与本地化：中→德翻译、合规清单格式化、JSON→Markdown、内容改写',
    engine: 'Claude Transform',
    color: 'border-zinc-700/50 bg-zinc-900/30 text-zinc-300',
    tag: 'text-zinc-400 bg-zinc-800',
  },
];

const ENGINES = [
  { icon: '🔮', name: 'Prophet', desc: '群体智能预测 · 50买家模拟 · 爆款概率', color: 'text-violet-400' },
  { icon: '🗺️', name: 'Atlas', desc: '品类本体知识图谱 · 合规数据库 · 竞品分析', color: 'text-blue-400' },
  { icon: '⚡', name: 'Claw', desc: 'DAG编排引擎 · 拓扑排序 · 并行执行', color: 'text-emerald-400' },
];

interface SkillsPanelProps {
  compact?: boolean;
}

export default function SkillsPanel({ compact = false }: SkillsPanelProps) {
  return (
    <div className="border border-zinc-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">原子能力矩阵 · Skill Registry</h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">6 个原子技能 × 3 个引擎 = 无限工作流组合</p>
        </div>
        <div className="flex gap-1">
          {ENGINES.map(e => (
            <span key={e.name} className={`text-[10px] font-mono ${e.color} bg-zinc-900 px-2 py-0.5 rounded-full`}>
              {e.icon} {e.name}
            </span>
          ))}
        </div>
      </div>

      {/* Skills grid */}
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {SKILLS.map(skill => (
          <div key={skill.id} className={`border rounded-lg p-3 ${skill.color}`}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">{skill.icon}</span>
                <div>
                  <p className="text-xs font-semibold leading-tight">{skill.label}</p>
                  <p className="text-[10px] font-mono opacity-60">{skill.id}</p>
                </div>
              </div>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${skill.tag}`}>
                {skill.engine.split(' ')[0]}
              </span>
            </div>
            {!compact && (
              <p className="text-[11px] opacity-70 leading-relaxed">{skill.desc}</p>
            )}
          </div>
        ))}
      </div>

      {/* Engines row */}
      {!compact && (
        <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-3 gap-2">
          {ENGINES.map(e => (
            <div key={e.name} className="text-center">
              <p className={`text-lg mb-0.5`}>{e.icon}</p>
              <p className={`text-[10px] font-bold font-mono ${e.color}`}>{e.name} Engine</p>
              <p className="text-[9px] text-zinc-600 mt-0.5 leading-tight">{e.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
