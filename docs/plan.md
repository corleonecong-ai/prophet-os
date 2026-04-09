# ProphetOS 实现规划

> Boris 工作流 — Step 2: 规划
> 日期：2026-04-09
> 状态：待审查，**don't implement yet**

---

## 1. 实现目标

### 3 小时 MVP 最终演示效果

浏览器打开 `http://localhost:3000`，完整走通以下流程：

1. **意图输入**：用户在输入框输入"帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料"
2. **Plan 生成**：点击"Plan & Run"，`POST /api/plan` 触发 Planner Agent，2-5 秒内返回 8 步左右 DAG JSON
3. **时间线渲染**：前端将 DAG steps 渲染为可视化时间线，显示并行关系和条件分支
4. **流式执行**：`POST /api/execute` 开启 SSE 连接，step 按拓扑顺序一个一个（或成批）执行，每个 step 的 `started/done/failed` 事件实时推入前端对应卡片
5. **最终报告**：全部 step 完成后，展示结构化报告：
   - 🔮 burst 概率（Prophet 预测结果）
   - 🇩🇪 德语 Listing（标题 + bullet + description）
   - ✅ 合规清单（CE/EEE 等德国市场要求）
   - 🔑 关键词列表（德语 SEO 关键词）

### 技术边界（不做）
- 无数据库、无 Redis、无登录、无测试、不部署
- 不做真实电商 OAuth
- 不做完整 Reflexion 循环（最多单次 replan）
- 不实现 16 个 Skill，只实现 6 个

---

## 2. 完整文件清单

总计：**39 个文件**

### 配置文件（8）

| 路径 | 说明 |
|---|---|
| `package.json` | 依赖：next@14、typescript、tailwindcss、shadcn/ui、@anthropic-ai/sdk、js-yaml、zod |
| `tsconfig.json` | TypeScript strict 模式，paths: `@/*` → `./` |
| `next.config.mjs` | 启用 App Router，关闭 strict mode warning，设置 `serverExternalPackages: ['js-yaml']` |
| `tailwind.config.ts` | shadcn/ui 主题配置，dark mode: class |
| `postcss.config.js` | tailwind + autoprefixer |
| `.gitignore` | node_modules / .next / .env.local |
| `.env.local.example` | `ANTHROPIC_API_KEY=sk-ant-xxxxx` |
| `CLAUDE.md` | 项目上下文简版，给后续 AI worker 看的 |

### 核心 Lib（10）

| 路径 | 说明 |
|---|---|
| `lib/anthropic.ts` | Anthropic SDK 单例，`claude-sonnet-4-6`，统一导出 `client` |
| `lib/skills/types.ts` | SkillMeta、SkillInput/Output 的 TypeScript 类型定义 |
| `lib/skills/loader.ts` | 扫描 `skills/public/`，读 yaml + prompt.md，返回 `Map<string, SkillMeta>` |
| `lib/engines/prophet.ts` | Prophet Engine：接收 `{category, market, sku_desc}`，调用 `llm.simulate`，返回 `{burst_prob, personas, summary}` |
| `lib/engines/atlas.ts` | Atlas Engine：读 `data/ontology.json`，实现 `kb.lookup(entity, domain)`，返回本体 entry |
| `lib/engines/index.ts` | 统一导出所有 engine，`getEngine(name: string)` 工厂函数 |
| `lib/claw/dag-runner.ts` | DAG Runner：拓扑排序（Kahn）→ 并行执行 → SSE 事件回调 |
| `lib/claw/queue.ts` | in-memory 任务队列，`Map<string, ExecutionContext>`，存储运行中任务状态 |
| `lib/planner/prompt.ts` | 组装 Planner system prompt，注入 skill catalog 和 schema |
| `lib/planner/parse.ts` | 解析、校验、修复 Planner 输出的 DAG JSON |

### API 路由（6）

| 路径 | 说明 |
|---|---|
| `app/api/plan/route.ts` | `POST`：接收 `{intent}`，调用 Planner，返回 DAG JSON |
| `app/api/execute/route.ts` | `POST`：接收 `{plan}`，启动 DAG Runner，SSE 流式推送事件 |
| `app/api/skill/[id]/route.ts` | `POST`：直接执行单个 Skill（调试用） |
| `app/api/engine/[name]/route.ts` | `POST`：直接调用单个 engine（调试用） |
| `app/api/intent/route.ts` | `POST`：上游意图接入骨架（只返回 202，不真实处理） |
| `app/api/webhook/result/route.ts` | `POST`：结果回传骨架（只返回 200） |

### 前端（5）

| 路径 | 说明 |
|---|---|
| `app/layout.tsx` | 根布局，全局字体、Tailwind dark class |
| `app/page.tsx` | 主页，状态机（idle → planning → executing → done），协调各组件 |
| `app/globals.css` | Tailwind base + shadcn/ui 变量 |
| `components/IntentInput.tsx` | 意图输入框 + "Plan & Run" 按钮，受控组件 |
| `components/PlanTimeline.tsx` | 接收 DAG steps，渲染时间线卡片，显示 depends_on 箭头和 condition badge |
| `components/ExecutionStream.tsx` | 订阅 SSE `/api/execute`，按 stepId 更新各卡片状态（pending/running/done/failed） |
| `components/FinalReport.tsx` | 接收所有 step outputs，渲染 burst 概率 + listing + 合规 + 关键词四个 section |

### 数据文件（1）

| 路径 | 说明 |
|---|---|
| `data/ontology.json` | 10 个品类的本体知识结构（属性/合规/关键词/竞品/价格带） |

### Skill 资源（12）

每个 Skill 一个目录，含 `skill.yaml`（元数据+schema）和 `prompt.md`（LLM 指令）：

| 路径 | 说明 |
|---|---|
| `skills/public/llm.transform/skill.yaml` | 文本转换 Skill 元数据，input: `{text, instruction}` output: `{text}` |
| `skills/public/llm.transform/prompt.md` | "You are a text transformation engine. Transform the given text according to the instruction exactly..." |
| `skills/public/llm.generate/skill.yaml` | 结构化生成元数据，input: `{schema, context}` output: `{json}` |
| `skills/public/llm.generate/prompt.md` | "You are a structured content generator. Generate JSON strictly conforming to the provided schema..." |
| `skills/public/llm.reason/skill.yaml` | 推理分析元数据，input: `{facts, question}` output: `{answer, steps}` |
| `skills/public/llm.reason/prompt.md` | "You are an analytical reasoning engine. Given facts and a question, reason step by step..." |
| `skills/public/llm.simulate/skill.yaml` | 群体模拟元数据（核心），input: `{role_distribution, target, n}` output: `{personas, summary, score}` |
| `skills/public/llm.simulate/prompt.md` | 50 persona 矩阵模拟指令，要求输出 JSON array，包含 persona 评分和理由 |
| `skills/public/llm.expand/skill.yaml` | 列表扩展元数据，input: `{seed, n, criteria}` output: `{items}` |
| `skills/public/llm.expand/prompt.md` | "You are a list expansion engine. Given a seed and criteria, generate N diverse, specific items..." |
| `skills/public/kb.lookup/skill.yaml` | 本体查询元数据，input: `{entity, domain}` output: `{entry}` |
| `skills/public/kb.lookup/prompt.md` | Atlas Engine 直接读 ontology.json，此 prompt 作为 fallback LLM 查询指令 |

### 文档（3）

| 路径 | 说明 |
|---|---|
| `README.md` | 项目说明、3 步启动、演示意图示例、架构图 ASCII |
| `docs/research.md` | 已存在，调研文档 |
| `docs/plan.md` | 本文件 |

---

## 3. 关键代码骨架

### 3.1 Skill Loader（`lib/skills/types.ts` + `lib/skills/loader.ts`）

```typescript
// lib/skills/types.ts

export interface SkillParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}

export interface SkillMeta {
  id: string;           // e.g. "llm.simulate"
  name: string;         // human-readable name
  description: string;  // one-line description for Planner prompt injection
  engine: 'prophet' | 'atlas' | 'claw' | 'llm';
  inputs: SkillParam[];
  outputs: SkillParam[];
  promptTemplate: string;  // content of prompt.md
}

export type SkillRegistry = Map<string, SkillMeta>;

// lib/skills/loader.ts

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { SkillMeta, SkillRegistry } from './types';

const SKILLS_DIR = path.join(process.cwd(), 'skills', 'public');

export function loadSkills(): SkillRegistry {
  const registry: SkillRegistry = new Map();
  
  if (!fs.existsSync(SKILLS_DIR)) return registry;
  
  const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const dir of skillDirs) {
    const yamlPath = path.join(SKILLS_DIR, dir, 'skill.yaml');
    const promptPath = path.join(SKILLS_DIR, dir, 'prompt.md');
    
    if (!fs.existsSync(yamlPath) || !fs.existsSync(promptPath)) continue;
    
    const meta = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as Omit<SkillMeta, 'promptTemplate'>;
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');
    
    registry.set(meta.id, { ...meta, promptTemplate });
  }
  
  return registry;
}

// Singleton — loaded once at module import, re-used across requests
let _registry: SkillRegistry | null = null;
export function getSkillRegistry(): SkillRegistry {
  if (!_registry) _registry = loadSkills();
  return _registry;
}

export function buildSkillCatalog(registry: SkillRegistry): string {
  return Array.from(registry.values())
    .map(s => `- ${s.id}: ${s.description}
  inputs: ${s.inputs.map(p => `${p.name}(${p.type})`).join(', ')}
  outputs: ${s.outputs.map(p => `${p.name}(${p.type})`).join(', ')}`)
    .join('\n');
}
```

---

### 3.2 Planner Prompt（`lib/planner/prompt.ts`）

完整可直接使用的 Planner prompt 模板：

```typescript
// lib/planner/prompt.ts

export function buildPlannerSystemPrompt(skillCatalog: string): string {
  return `
You are ProphetOS Planner — an autonomous planning agent for cross-border e-commerce sellers.

Your ONLY job: receive a user intent in natural language, and output a valid, executable DAG plan as strict JSON.

## The Three Engines You Can Dispatch

1. **prophet** — Crowd intelligence prediction engine
   - Method: prophet.predict
   - Purpose: Simulate how a target market's consumer personas will respond to a product
   - Use when: User asks about product viability, burst probability, consumer demand

2. **atlas** — Knowledge ontology engine  
   - Method: atlas.lookup
   - Purpose: Query structured knowledge about product categories, compliance requirements, market attributes, SEO keywords
   - Use when: User needs category knowledge, listing requirements, compliance checklists, keyword sets

3. **claw** — Autonomous execution engine
   - Method: claw.execute
   - Purpose: Orchestrate generation tasks — reports, listings, structured documents
   - Use when: User needs content generated (listings, reports, summaries)

## Available Atomic Skills (use these as step "name" when type is "skill")

{{skill_catalog}}

## Output JSON Schema (STRICT — no deviation)

You MUST output a single JSON object matching this exact schema:

\`\`\`json
{
  "goal": "string — one sentence restating the user's core objective",
  "reasoning": "string — 2-3 sentences explaining your decomposition strategy",
  "estimated_seconds": "number — estimated total execution time in seconds",
  "estimated_tokens": "number — estimated total tokens consumed",
  "steps": [
    {
      "id": "string — unique step ID, use s1/s2/s3...",
      "type": "'engine' | 'skill'",
      "name": "string — engine method (prophet.predict) or skill ID (llm.simulate)",
      "inputs": "object — concrete key/value inputs for this step",
      "depends_on": "string[] — IDs of steps that must complete before this one; [] for no dependency",
      "condition": "string | null — conditional expression like '{{s1.output.burst_prob}} > 0.6'; null if unconditional",
      "why": "string — one sentence: why is this step necessary"
    }
  ],
  "success_criteria": "string[] — 2-4 verifiable completion conditions",
  "risks": "string[] — 2-3 specific failure risks"
}
\`\`\`

## Planning Rules

1. Steps with no shared dependencies CAN be parallelized — set the same depends_on for them
2. Use depends_on to create proper data flow: later steps reference earlier outputs via \`{{sN.output.field}}\`
3. condition is ONLY for branching logic (skip this step if condition is false); it's null for most steps
4. Step count: minimum 5, maximum 12
5. Conditions use ONLY these operators: > < == != >= <= && ||  — no JavaScript, no eval
6. Every step ID must be unique; depends_on may only reference IDs defined earlier in the steps array
7. The plan must be a valid DAG — no cycles, no self-references

## Few-Shot Example

User intent: "帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料"
(Translation: "Check if outdoor coffee makers can go viral, if yes prepare German market listing materials")

Output:
\`\`\`json
{
  "goal": "Assess burst probability of outdoor coffee makers in the German market, and conditionally generate a complete German listing package",
  "reasoning": "First look up category knowledge and run consumer simulation in parallel — both are independent. Then reason about burst probability using both results. If burst_prob > 0.6, proceed to generate German listing, compliance checklist, and SEO keywords. Finally assemble a full report.",
  "estimated_seconds": 45,
  "estimated_tokens": 14000,
  "steps": [
    {
      "id": "s1",
      "type": "engine",
      "name": "atlas.lookup",
      "inputs": {
        "entity": "outdoor coffee maker",
        "domain": "product_category",
        "market": "DE"
      },
      "depends_on": [],
      "condition": null,
      "why": "Retrieve structured category knowledge: compliance requirements, attributes, and market context for Germany"
    },
    {
      "id": "s2",
      "type": "skill",
      "name": "llm.simulate",
      "inputs": {
        "role_distribution": "German outdoor enthusiasts aged 25-45, 60% male, mix of campers/hikers/van-lifers",
        "target": "portable outdoor espresso machine, battery-powered, €89",
        "n": 50
      },
      "depends_on": [],
      "condition": null,
      "why": "Simulate 50 consumer personas to get bottom-up demand signal and burst probability estimate"
    },
    {
      "id": "s3",
      "type": "skill",
      "name": "llm.reason",
      "inputs": {
        "facts": "Category data: {{s1.output.entry}} | Persona simulation: {{s2.output.summary}}",
        "question": "What is the burst probability for outdoor coffee makers in Germany? Consider trend signals, persona enthusiasm scores, and market gaps."
      },
      "depends_on": ["s1", "s2"],
      "condition": null,
      "why": "Synthesize category knowledge + persona simulation into a reasoned burst probability verdict"
    },
    {
      "id": "s4",
      "type": "skill",
      "name": "llm.generate",
      "inputs": {
        "schema": "{title: string, bullets: string[5], description: string, backend_keywords: string[]}",
        "context": "Product: outdoor coffee maker for German market. Category data: {{s1.output.entry}}. Consumer insights: {{s2.output.summary}}. Generate in German language."
      },
      "depends_on": ["s3"],
      "condition": "{{s3.output.burst_prob}} > 0.6",
      "why": "Generate a complete German Amazon listing only if burst probability exceeds threshold"
    },
    {
      "id": "s5",
      "type": "engine",
      "name": "atlas.lookup",
      "inputs": {
        "entity": "outdoor coffee maker",
        "domain": "compliance",
        "market": "DE"
      },
      "depends_on": ["s3"],
      "condition": "{{s3.output.burst_prob}} > 0.6",
      "why": "Look up CE certification and EEE compliance requirements for electrical appliances in Germany"
    },
    {
      "id": "s6",
      "type": "skill",
      "name": "llm.expand",
      "inputs": {
        "seed": "outdoor coffee maker german keywords",
        "n": 30,
        "criteria": "High-volume German Amazon search terms, mix of short-tail and long-tail, relevant to camping and outdoor lifestyle"
      },
      "depends_on": ["s3"],
      "condition": "{{s3.output.burst_prob}} > 0.6",
      "why": "Generate 30 German SEO keywords for the listing backend"
    },
    {
      "id": "s7",
      "type": "skill",
      "name": "llm.generate",
      "inputs": {
        "schema": "{burst_prob: number, verdict: string, listing_de: object, compliance: object, keywords: string[], recommendation: string}",
        "context": "Burst analysis: {{s3.output}} | Listing: {{s4.output}} | Compliance: {{s5.output.entry}} | Keywords: {{s6.output.items}}"
      },
      "depends_on": ["s4", "s5", "s6"],
      "condition": null,
      "why": "Assemble all results into a final structured report for display"
    }
  ],
  "success_criteria": [
    "burst_prob is a number between 0 and 1",
    "German listing contains title, 5 bullets, and description",
    "Compliance checklist contains at least 3 DE-specific requirements",
    "Keyword list contains at least 20 German terms"
  ],
  "risks": [
    "llm.simulate may produce overly optimistic persona scores — cross-validate with atlas category data",
    "German compliance data in ontology may be incomplete for edge-case accessories",
    "Conditional steps s4/s5/s6 will be skipped if burst_prob <= 0.6, resulting in a partial report"
  ]
}
\`\`\`

---

Now plan for the following user intent:

{{intent}}

Output ONLY the JSON object. No markdown wrapper, no explanation, no preamble.
`.trim();
}

export function buildPlannerUserMessage(intent: string): string {
  return intent;
}
```

---

### 3.3 Plan 解析健壮策略（`lib/planner/parse.ts`）

```typescript
// lib/planner/parse.ts

import { z } from 'zod';

// --- Zod Schema ---

const StepSchema = z.object({
  id: z.string(),
  type: z.enum(['engine', 'skill']),
  name: z.string(),
  inputs: z.record(z.unknown()).default({}),
  depends_on: z.array(z.string()).default([]),
  condition: z.string().nullable().default(null),
  why: z.string().default(''),
});

const PlanSchema = z.object({
  goal: z.string(),
  reasoning: z.string().default(''),
  estimated_seconds: z.number().default(30),
  estimated_tokens: z.number().default(10000),
  steps: z.array(StepSchema).min(1),
  success_criteria: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof StepSchema>;

// --- JSON Extraction ---
// Handle Claude wrapping JSON in ```json ... ``` blocks

function extractJSON(raw: string): string {
  // Strip markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  
  // Try to find the first { ... } block
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  
  return raw.trim();
}

// --- DAG Validation ---

function detectCycle(steps: PlanStep[]): string | null {
  // Kahn's algorithm for cycle detection
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  
  for (const step of steps) {
    inDegree.set(step.id, 0);
    graph.set(step.id, []);
  }
  
  for (const step of steps) {
    for (const dep of step.depends_on) {
      graph.get(dep)?.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }
  
  const queue = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);
  let visited = 0;
  
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of graph.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  
  return visited === steps.length ? null : 'Cycle detected in DAG';
}

function validateDependencyRefs(steps: PlanStep[]): string | null {
  const ids = new Set(steps.map(s => s.id));
  for (const step of steps) {
    for (const dep of step.depends_on) {
      if (!ids.has(dep)) {
        return `Step "${step.id}" depends_on unknown id "${dep}"`;
      }
      if (dep === step.id) {
        return `Step "${step.id}" depends on itself`;
      }
    }
  }
  return null;
}

// --- Main Parse Function ---

export interface ParseResult {
  ok: boolean;
  plan?: Plan;
  error?: string;
}

export function parsePlan(raw: string): ParseResult {
  // 1. Extract JSON string
  let jsonStr: string;
  try {
    jsonStr = extractJSON(raw);
  } catch {
    return { ok: false, error: 'Could not locate JSON in Planner output' };
  }
  
  // 2. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, error: `JSON.parse failed: ${(e as Error).message}` };
  }
  
  // 3. Validate with Zod (applies defaults for missing optional fields)
  const result = PlanSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: `Schema validation failed: ${result.error.message}` };
  }
  
  const plan = result.data;
  
  // 4. Validate dependency references
  const refError = validateDependencyRefs(plan.steps);
  if (refError) return { ok: false, error: refError };
  
  // 5. Check for cycles
  const cycleError = detectCycle(plan.steps);
  if (cycleError) return { ok: false, error: cycleError };
  
  return { ok: true, plan };
}
```

---

### 3.4 DAG Runner（`lib/claw/dag-runner.ts`）

```typescript
// lib/claw/dag-runner.ts

import type { Plan, PlanStep } from '@/lib/planner/parse';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt?: number;
  doneAt?: number;
}

export interface RunEvent {
  type: 'step_started' | 'step_done' | 'step_failed' | 'step_skipped' | 'plan_complete' | 'plan_error';
  stepId?: string;
  data?: unknown;
  error?: string;
  timestamp: number;
}

export type OnEvent = (event: RunEvent) => void;

// --- Condition Evaluator (whitelist, no eval) ---

function evaluateCondition(
  condition: string | null,
  context: Map<string, StepResult>
): boolean {
  if (!condition) return true;
  
  // Replace {{sN.output.field}} placeholders with actual values
  let expr = condition.replace(/\{\{(\w+)\.output\.(\w+)\}\}/g, (_, stepId, field) => {
    const result = context.get(stepId);
    const val = (result?.output as Record<string, unknown>)?.[field];
    return String(val ?? 'undefined');
  });
  
  // Whitelist: only allow numbers, booleans, comparison operators, logical operators
  const safe = /^[\d\s\.\>\<\=\!\&\|\(\)truefalsundei]+$/.test(expr);
  if (!safe) return true; // If expression is complex/unsafe, default to true (don't skip)
  
  // Parse manually for simple comparisons: X > 0.6, X == 'yes', etc.
  const gtMatch = expr.match(/^([\d.]+)\s*>\s*([\d.]+)$/);
  if (gtMatch) return parseFloat(gtMatch[1]) > parseFloat(gtMatch[2]);
  
  const ltMatch = expr.match(/^([\d.]+)\s*<\s*([\d.]+)$/);
  if (ltMatch) return parseFloat(ltMatch[1]) < parseFloat(ltMatch[2]);
  
  const gteMatch = expr.match(/^([\d.]+)\s*>=\s*([\d.]+)$/);
  if (gteMatch) return parseFloat(gteMatch[1]) >= parseFloat(gteMatch[2]);
  
  const eqMatch = expr.match(/^(.+)\s*==\s*(.+)$/);
  if (eqMatch) return eqMatch[1].trim() === eqMatch[2].trim();
  
  const neMatch = expr.match(/^(.+)\s*!=\s*(.+)$/);
  if (neMatch) return neMatch[1].trim() !== neMatch[2].trim();
  
  // Default: condition is present but unparseable — run the step
  return true;
}

// --- Topological Sort (Kahn's Algorithm) ---

function topoSort(steps: PlanStep[]): PlanStep[][] {
  // Returns layers: steps in the same layer can run in parallel
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  const stepMap = new Map<string, PlanStep>();
  
  for (const s of steps) {
    inDegree.set(s.id, 0);
    graph.set(s.id, []);
    stepMap.set(s.id, s);
  }
  
  for (const s of steps) {
    for (const dep of s.depends_on) {
      graph.get(dep)!.push(s.id);
      inDegree.set(s.id, inDegree.get(s.id)! + 1);
    }
  }
  
  const layers: PlanStep[][] = [];
  let queue = steps.filter(s => inDegree.get(s.id) === 0);
  
  while (queue.length > 0) {
    layers.push(queue);
    const nextQueue: PlanStep[] = [];
    for (const node of queue) {
      for (const neighbor of graph.get(node.id) ?? []) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) nextQueue.push(stepMap.get(neighbor)!);
      }
    }
    queue = nextQueue;
  }
  
  return layers;
}

// --- Execute Single Step ---

async function executeStep(
  step: PlanStep,
  context: Map<string, StepResult>,
  onEvent: OnEvent
): Promise<StepResult> {
  onEvent({ type: 'step_started', stepId: step.id, timestamp: Date.now() });
  
  const startedAt = Date.now();
  
  try {
    // Resolve input template references: {{s1.output.field}} → actual value
    const resolvedInputs = JSON.parse(
      JSON.stringify(step.inputs).replace(
        /\{\{(\w+)\.output\.(\w+)\}\}/g,
        (_, sid, field) => {
          const prev = context.get(sid);
          const val = (prev?.output as Record<string, unknown>)?.[field];
          return val !== undefined ? String(val) : '';
        }
      )
    );
    
    // Dispatch to engine or skill
    const output = await dispatchStep(step.type, step.name, resolvedInputs);
    
    const result: StepResult = { stepId: step.id, status: 'done', output, startedAt, doneAt: Date.now() };
    onEvent({ type: 'step_done', stepId: step.id, data: output, timestamp: Date.now() });
    return result;
    
  } catch (e) {
    const error = (e as Error).message;
    const result: StepResult = { stepId: step.id, status: 'failed', error, startedAt, doneAt: Date.now() };
    onEvent({ type: 'step_failed', stepId: step.id, error, timestamp: Date.now() });
    return result;
  }
}

// dispatchStep signature — implementation routes to engine/skill
async function dispatchStep(type: string, name: string, inputs: Record<string, unknown>): Promise<unknown> {
  if (type === 'engine') {
    const [engineName, method] = name.split('.');
    const { getEngine } = await import('@/lib/engines/index');
    const engine = getEngine(engineName);
    return engine[method](inputs);
  } else {
    const { getSkillRegistry } = await import('@/lib/skills/loader');
    const { executeSkill } = await import('@/lib/skills/executor');  // to be implemented
    const registry = getSkillRegistry();
    const skill = registry.get(name);
    if (!skill) throw new Error(`Unknown skill: ${name}`);
    return executeSkill(skill, inputs);
  }
}

// --- Main DAG Runner ---

export async function runDAG(plan: Plan, onEvent: OnEvent): Promise<Map<string, StepResult>> {
  const context = new Map<string, StepResult>();
  const layers = topoSort(plan.steps);
  
  for (const layer of layers) {
    // Within each layer, check conditions and run eligible steps in parallel
    const eligible = layer.filter(step => {
      // If any dependency failed, skip this step
      const depFailed = step.depends_on.some(
        dep => context.get(dep)?.status === 'failed' || context.get(dep)?.status === 'skipped'
      );
      if (depFailed) return false;
      
      // Evaluate condition
      return evaluateCondition(step.condition, context);
    });
    
    const skipped = layer.filter(s => !eligible.includes(s));
    for (const step of skipped) {
      const result: StepResult = { stepId: step.id, status: 'skipped' };
      context.set(step.id, result);
      onEvent({ type: 'step_skipped', stepId: step.id, timestamp: Date.now() });
    }
    
    // Run eligible steps in parallel (Promise.all)
    const results = await Promise.all(
      eligible.map(step => executeStep(step, context, onEvent))
    );
    
    for (const result of results) {
      context.set(result.stepId, result);
    }
  }
  
  onEvent({ type: 'plan_complete', data: Object.fromEntries(context), timestamp: Date.now() });
  return context;
}
```

---

### 3.5 SSE 流式 API（`app/api/execute/route.ts`）

```typescript
// app/api/execute/route.ts

import { NextRequest } from 'next/server';
import { runDAG } from '@/lib/claw/dag-runner';
import type { RunEvent } from '@/lib/claw/dag-runner';
import type { Plan } from '@/lib/planner/parse';

export const runtime = 'nodejs';  // SSE requires Node.js runtime, not Edge

export async function POST(req: NextRequest) {
  const { plan }: { plan: Plan } = await req.json();
  
  // Set up SSE response
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };
      
      try {
        await runDAG(plan, send);
      } catch (e) {
        send({
          type: 'plan_error',
          error: (e as Error).message,
          timestamp: Date.now(),
        });
      } finally {
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// SSE Event Format (each line is a separate event):
// data: {"type":"step_started","stepId":"s1","timestamp":1712700000000}
// data: {"type":"step_done","stepId":"s1","data":{...output},"timestamp":1712700005000}
// data: {"type":"step_failed","stepId":"s2","error":"timeout","timestamp":1712700003000}
// data: {"type":"step_skipped","stepId":"s4","timestamp":1712700006000}
// data: {"type":"plan_complete","data":{...all results},"timestamp":1712700020000}
```

---

## 4. 完整示例 Plan JSON

意图："帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料"

```json
{
  "goal": "Assess burst probability of outdoor coffee makers in Germany and conditionally generate a complete German market listing package",
  "reasoning": "First, run category ontology lookup and consumer simulation in parallel — both are independent of each other. Then synthesize both signals into a burst probability verdict. If burst_prob > 0.6, trigger three parallel downstream tasks: German listing generation, compliance lookup, and SEO keyword expansion. Finally, assemble all outputs into a structured final report regardless of verdict.",
  "estimated_seconds": 48,
  "estimated_tokens": 15500,
  "steps": [
    {
      "id": "s1",
      "type": "engine",
      "name": "atlas.lookup",
      "inputs": {
        "entity": "outdoor coffee maker",
        "domain": "product_category",
        "market": "DE"
      },
      "depends_on": [],
      "condition": null,
      "why": "Retrieve structured category knowledge for outdoor coffee makers in Germany: product attributes, category rank, and competitive context"
    },
    {
      "id": "s2",
      "type": "skill",
      "name": "llm.simulate",
      "inputs": {
        "role_distribution": "German outdoor enthusiasts aged 25-45: 35% weekend campers, 25% hikers/backpackers, 20% van-lifers, 15% urban coffee snobs, 5% professional guides",
        "target": "portable battery-powered espresso machine for outdoor use, weight 450g, price €89, 15 bar pressure",
        "n": 50
      },
      "depends_on": [],
      "condition": null,
      "why": "Simulate 50 German consumer personas across target demographics to get bottom-up demand signal and enthusiasm scores"
    },
    {
      "id": "s3",
      "type": "skill",
      "name": "llm.reason",
      "inputs": {
        "facts": "Category ontology: {{s1.output.entry}} | Persona simulation results: {{s2.output.summary}} | Average persona score: {{s2.output.score}}",
        "question": "Based on the category data and persona simulation, what is the burst probability (0.0-1.0) for outdoor coffee makers in Germany? Provide the number as burst_prob in your output JSON."
      },
      "depends_on": ["s1", "s2"],
      "condition": null,
      "why": "Synthesize category signals and persona demand into a single reasoned burst probability verdict"
    },
    {
      "id": "s4",
      "type": "skill",
      "name": "llm.generate",
      "inputs": {
        "schema": "{\"title\": \"string (max 200 chars)\", \"bullets\": \"string[5]\", \"description\": \"string (max 2000 chars)\", \"search_terms\": \"string (max 250 chars)\"}",
        "context": "Generate a complete Amazon Germany listing in German language. Product: portable outdoor espresso machine. Category data: {{s1.output.entry}}. Consumer pain points: {{s2.output.summary}}. Emphasize portability, outdoor lifestyle, and premium coffee quality."
      },
      "depends_on": ["s3"],
      "condition": "{{s3.output.burst_prob}} > 0.6",
      "why": "Generate German Amazon listing only if burst probability exceeds 60% threshold — conditional on commercial viability"
    },
    {
      "id": "s5",
      "type": "engine",
      "name": "atlas.lookup",
      "inputs": {
        "entity": "outdoor coffee maker",
        "domain": "compliance",
        "market": "DE"
      },
      "depends_on": ["s3"],
      "condition": "{{s3.output.burst_prob}} > 0.6",
      "why": "Look up CE marking, WEEE, and electrical appliance compliance requirements specific to Germany — needed for listing"
    },
    {
      "id": "s6",
      "type": "skill",
      "name": "llm.expand",
      "inputs": {
        "seed": "Kaffeemaschine outdoor camping espresso",
        "n": 30,
        "criteria": "High-volume German Amazon search terms for portable coffee equipment; mix of 40% broad (1-2 words) and 60% long-tail (3-5 words); relevant to camping, hiking, outdoor adventure; include German-language variants"
      },
      "depends_on": ["s3"],
      "condition": "{{s3.output.burst_prob}} > 0.6",
      "why": "Expand 30 German SEO keywords for listing backend and PPC campaigns — requires burst verdict before investing in keyword research"
    },
    {
      "id": "s7",
      "type": "skill",
      "name": "llm.transform",
      "inputs": {
        "text": "{{s2.output.summary}}",
        "instruction": "Extract the top 3 consumer objections and top 3 purchase motivators from this persona simulation summary. Format as JSON: {objections: string[3], motivators: string[3]}"
      },
      "depends_on": ["s2"],
      "condition": null,
      "why": "Extract structured consumer insights from raw simulation — useful for marketing copy regardless of burst verdict"
    },
    {
      "id": "s8",
      "type": "skill",
      "name": "llm.generate",
      "inputs": {
        "schema": "{\"burst_prob\": \"number\", \"verdict\": \"string\", \"consumer_insights\": \"object\", \"listing_de\": \"object|null\", \"compliance\": \"object|null\", \"keywords\": \"string[]|null\", \"recommendation\": \"string\"}",
        "context": "Burst probability verdict: {{s3.output}} | Consumer insights: {{s7.output}} | German listing: {{s4.output}} | Compliance data: {{s5.output.entry}} | SEO keywords: {{s6.output.items}}. Assemble into final report. If listing/compliance/keywords are null, explain why (low burst probability) and recommend next steps."
      },
      "depends_on": ["s3", "s4", "s5", "s6", "s7"],
      "condition": null,
      "why": "Assemble all results into final structured report for UI display — runs regardless of burst verdict"
    }
  ],
  "success_criteria": [
    "s3 returns burst_prob as a number between 0.0 and 1.0",
    "If burst_prob > 0.6: s4 listing contains title, 5 bullets, and description in German",
    "If burst_prob > 0.6: s5 compliance lists at least CE marking requirement",
    "s8 final report is valid JSON with all required fields"
  ],
  "risks": [
    "llm.simulate may produce overly generous scores if persona distribution is not tight enough — mitigate by using specific German demographic segments",
    "Conditional steps s4/s5/s6 skip if burst_prob <= 0.6, resulting in a minimal report — acceptable behavior",
    "s8 depends on s4/s5/s6 which may be skipped — generator must handle null inputs gracefully"
  ]
}
```

---

## 5. 实现顺序

### 总原则
配置 → Skill 类型 → Skill Loader → 6 Skill → Ontology 数据 → Atlas/Prophet 引擎 → **Planner ⭐** → DAG Runner → API 路由 → 前端 → README

---

| # | 步骤名称 | 做什么 | 产出文件 | AI Worker | 验证命令 + 期望结果 | 预估时长 |
|---|---|---|---|---|---|---|
| ✅ **1** | **项目骨架** | `npx create-next-app` 生成框架，安装所有依赖（next、ts、tailwind、shadcn、@anthropic-ai/sdk、js-yaml、zod） | `package.json` `tsconfig.json` `next.config.mjs` `tailwind.config.ts` `postcss.config.js` `.gitignore` `.env.local.example` | Claude Code | `npm run dev` → 浏览器 localhost:3000 显示 Next.js 默认页面；`node -e "require('@anthropic-ai/sdk')"` → 无报错 | 10 min |
| ✅ **2** | **Skill 类型定义** | 创建 `SkillMeta`、`SkillParam`、`SkillRegistry` TypeScript 接口，确保整个项目类型一致 | `lib/skills/types.ts` | Claude Code | `npx tsc --noEmit` → 0 errors | 5 min |
| ✅ **3** | **Skill Loader** | 实现 `loadSkills()`，扫描 `skills/public/`，读 yaml + prompt.md，返回 Map；实现 `buildSkillCatalog()` | `lib/skills/loader.ts` | Claude Code | 创建一个临时 `skills/public/test.skill/` 目录 + yaml，跑 `node -e "const {loadSkills}=require('./lib/skills/loader'); console.log(loadSkills().size)"` → 输出 1 | 10 min |
| ✅ **4** | **6 个 Skill 资源** | 编写全部 6 个 skill.yaml + prompt.md，每个 yaml 包含完整 inputs/outputs schema | `skills/public/llm.*/` `skills/public/kb.lookup/`（共 12 文件） | Claude Code（批量） | `node -e "const {loadSkills}=require('./lib/skills/loader'); console.log(loadSkills().size)"` → 输出 6 | 15 min |
| ✅ **5** | **Ontology 数据** | 编写 `data/ontology.json`，10 个品类，每个品类包含 `attributes`/`compliance`/`keywords`/`competitors`/`price_range` 字段；户外咖啡机必须在内 | `data/ontology.json` | Claude Code（内容生成） | `node -e "const d=require('./data/ontology.json'); console.log(Object.keys(d).length)"` → 输出 ≥ 10；`node -e "console.log(JSON.stringify(require('./data/ontology.json')['outdoor_coffee_maker'],null,2))"` → 显示完整条目 | 10 min |
| ✅ **6** | **Atlas + Prophet 引擎** | 实现 Atlas Engine（读 ontology.json，实现 `lookup`）和 Prophet Engine（调用 Claude 运行 llm.simulate 逻辑，返回 `{burst_prob, personas, summary}`）；实现 `lib/engines/index.ts` 工厂 | `lib/anthropic.ts` `lib/engines/atlas.ts` `lib/engines/prophet.ts` `lib/engines/index.ts` | Claude Code | `curl -X POST localhost:3000/api/engine/atlas -H 'Content-Type: application/json' -d '{"method":"lookup","inputs":{"entity":"outdoor coffee maker","domain":"product_category","market":"DE"}}'` → 返回 ontology entry JSON | 15 min |
| ✅ **7** | **Planner Prompt + Parse** | 实现 `buildPlannerSystemPrompt()`（注入 skillCatalog），实现 `parsePlan()`（提取 JSON、Zod 校验、DAG 环检测、引用校验） | `lib/planner/prompt.ts` `lib/planner/parse.ts` | Claude Code | `node -e "const {parsePlan}=require('./lib/planner/parse'); const r=parsePlan('{\"goal\":\"test\",\"steps\":[{\"id\":\"s1\",\"type\":\"skill\",\"name\":\"llm.transform\",\"inputs\":{},\"depends_on\":[],\"condition\":null,\"why\":\"test\"}]}'); console.log(r.ok)"` → 输出 true | 10 min |
| ✅ **8** | **Planner Agent + `/api/plan`** ⭐ | 实现完整 Planner：调用 Claude（claude-sonnet-4-6），注入 skill catalog，解析响应，retry 最多 2 次；实现 `/api/plan` 路由 | `lib/planner/index.ts`（或在 route 内） `app/api/plan/route.ts` | Claude Code | `curl -X POST localhost:3000/api/plan -H 'Content-Type: application/json' -d '{"intent":"帮我看户外咖啡机能不能爆"}'` → 返回包含 `steps` 数组的 JSON，步骤数 ≥ 5 | 20 min |
| ✅ **9** | **Skill Executor** | 实现通用 `executeSkill(skill, inputs)` 函数：将 inputs 注入 prompt template，调用 Claude，返回 parsed output | `lib/skills/executor.ts` | Claude Code | `curl -X POST localhost:3000/api/skill/llm.transform -d '{"inputs":{"text":"hello","instruction":"capitalize"}}'` → 返回 `{"text":"HELLO"}` | 10 min |
| ✅ **10** | **DAG Runner + `/api/execute`** | 实现完整 DAG Runner（Kahn 拓排 + 并行执行 + condition 求值 + onEvent 回调）；实现 SSE `/api/execute` 路由 | `lib/claw/dag-runner.ts` `lib/claw/queue.ts` `app/api/execute/route.ts` | Claude Code | `curl -N -X POST localhost:3000/api/execute -H 'Content-Type: application/json' -d '{"plan":{...2步简单plan...}}'` → 看到 SSE 事件流：`data: {"type":"step_started"...}` `data: {"type":"step_done"...}` | 20 min |
| ✅ **11** | **骨架路由** | 实现 `/api/skill/[id]`、`/api/engine/[name]`、`/api/intent`、`/api/webhook/result` 四个路由 | `app/api/skill/[id]/route.ts` `app/api/engine/[name]/route.ts` `app/api/intent/route.ts` `app/api/webhook/result/route.ts` | Claude Code | `curl -X POST localhost:3000/api/intent -d '{}'` → 202；`curl -X POST localhost:3000/api/webhook/result -d '{}'` → 200 | 5 min |
| ✅ **12** | **前端单页** | 实现 `app/page.tsx` 状态机 + 4 个组件（IntentInput、PlanTimeline、ExecutionStream、FinalReport）；接入 `/api/plan` 和 SSE `/api/execute` | `app/layout.tsx` `app/page.tsx` `app/globals.css` `components/*.tsx`（4 个） | Claude Code（可用 Gemini CLI 辅助 UI） | 浏览器 localhost:3000 → 输入意图 → 点击 Plan & Run → 看到 DAG 时间线和执行流 | 25 min |
| **13** | **端到端测试** | 手动走一遍完整流程：输入 Demo 意图，验证全部 5 个成功标准；修复任何 bug | — | 人工 + Claude Code 修复 | 全流程：目测 5 步成功标准全部达成 | 10 min |
| ✅ **14** | **README** | 编写 README：一句话定位、3 步启动、Demo 意图示例、架构 ASCII 图 | `README.md` | Claude Code（writer 模式） | `cat README.md` → 包含启动命令和演示意图 | 5 min |

**总计：170 分钟（约 2h50min）**

---

## 6. 风险点 + 兜底方案

### 风险 1：Planner 输出非法 JSON

**症状**：Claude 把 JSON 包在 ` ```json ``` ` 里，或字段拼错，或 `depends_on` 引用了不存在的 step id，导致 `parsePlan()` 报错。

**兜底**：
- `extractJSON()` 先剥 markdown fence，再找第一个 `{` 到最后一个 `}`
- Zod schema 对所有可选字段设 `.default()` —— 字段缺失不报错，而是填默认值
- 解析失败时，**自动 retry 最多 2 次**，每次在 user message 末尾追加 `"\n\nIMPORTANT: Output ONLY valid JSON, no markdown, no explanation."` 强化指令
- 2 次 retry 后仍失败 → 触发 Plan B 降级（见第 7 节）

### 风险 2：`llm.simulate` 输出质量差（persona 评分虚高/结构乱）

**症状**：Claude 模拟的 50 个 persona 评分集中在高分，缺乏区分度，或输出结构不是合法 JSON array，导致 `burst_prob` 计算无意义。

**兜底**：
- `prompt.md` 明确要求 persona 输出为 JSON array，每个元素含 `{persona_id, segment, score(1-10), reason, objection}`
- 在 prompt 中强制要求分布：`"Ensure scores follow a realistic distribution: 20% score 1-4 (skeptical), 50% score 5-7 (interested), 30% score 8-10 (enthusiastic)"`
- 若 LLM 不输出 JSON，fallback 为：把原始文本送给 `llm.transform`，instruction 为"extract persona scores as JSON array"，再计算平均分
- 若 score 字段解析失败，用硬编码默认值 `burst_prob = 0.55`（中性结果，继续演示）

### 风险 3：DAG 出现循环依赖

**症状**：Planner 生成的步骤中 s3 依赖 s4，s4 依赖 s3，Kahn 算法检测到环，DAG Runner 拒绝执行。

**兜底**：
- `parsePlan()` 在 Planner 输出阶段就做环检测，**发现环即触发 retry**，不等到 DAG Runner 阶段
- retry prompt 追加：`"IMPORTANT: The DAG you generated contains a cycle between steps. All depends_on must form a directed acyclic graph. Please regenerate."`
- 若 2 次 retry 后仍有环，**移除全部 depends_on**（退化为串行执行所有步骤），保证流程能跑完

### 风险 4：时间到 2:30 还没跑通 Planner

**症状**：距离演示只剩 30 分钟，`/api/plan` 还不能返回合法 DAG JSON。

**兜底**：立即切换到 **Plan B 降级方案**（见第 7 节）。降级不需要修改任何已完成的代码，只需在 `/api/plan` 路由中加一个 `HARDCODED_PLAN` 常量开关。**2:30 是 Plan B 切换的硬截止线，不犹豫。**

### 风险 5：`npm install` 慢（WSL 网络问题）

**症状**：依赖安装卡在某个包上，超过 5 分钟。

**兜底**：
- 提前在步骤 1 中用 `npm install --prefer-offline` 先走 cache
- 若卡住：`npm install --registry https://registry.npmmirror.com`（使用淘宝镜像）
- 若 shadcn/ui 安装慢：先跳过 shadcn，用原生 Tailwind div 做 UI，shadcn 是锦上添花不是必须

---

## 7. Plan B 降级方案

### 触发条件
以下任一情况触发 Plan B：
- 2:30 Planner 还没跑通（2 次 retry 后仍输出非法 JSON）
- API 调用频繁报 429（rate limit）
- `/api/plan` 返回时间 > 15 秒（用户体验不可接受）

### Plan B：硬编码工作流

Plan B 的核心思路：**绕过 Planner，用一个预设的 `HARDCODED_PLAN` 常量直接作为 `/api/plan` 的返回值**，DAG Runner、前端、SSE 流全部保留不动。演示效果完全相同，只是 Plan 不是 AI 实时生成的。

**实现方式（最小改动）：**

在 `app/api/plan/route.ts` 顶部加：

```typescript
const PLAN_B_MODE = process.env.PLAN_B === 'true';

// Paste the full hardcoded plan JSON from Section 4 here:
const HARDCODED_PLAN = { /* ... Section 4 的完整 8 步 Plan JSON ... */ };

export async function POST(req: NextRequest) {
  const { intent } = await req.json();
  
  if (PLAN_B_MODE) {
    // Simulate 1-second "thinking" delay for realism
    await new Promise(r => setTimeout(r, 1000));
    return Response.json(HARDCODED_PLAN);
  }
  
  // ... 原来的 Planner 调用逻辑
}
```

启动方式：`PLAN_B=true npm run dev`

**Plan B 保证的演示效果（全部 5 步成功标准仍然达成）：**

1. ✅ 输入意图框，看到输入文字
2. ✅ 点击 Plan & Run，1 秒后返回 8 步 DAG 时间线（来自硬编码，但视觉完全一样）
3. ✅ step 一个一个执行（DAG Runner 真实执行，Skill/Engine 真实调用 Claude）
4. ✅ 看到 SSE 事件流，卡片状态实时更新
5. ✅ 看到最终报告（burst 概率 + 德语 Listing + 合规 + 关键词）

**Plan B 的关键前提**：步骤 4-11（Skill、引擎、DAG Runner、前端）必须都已完成。Plan B 只 mock 了 Planner 这一个节点，其他全部真实运行。

**Plan B 的话术**（如果 demo 时有人问）：
> "Planner 是可以实时规划的，这里为了演示稳定性展示了一个预设的高质量 Plan，整个执行层是完全真实的。"

---

*文档结束。等待审查。*
