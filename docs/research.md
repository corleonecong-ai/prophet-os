# ProphetOS 调研文档

> Boris 工作流 — Step 1: 调研
> 日期：2026-04-09

---

## 1. 架构理解

ProphetOS 采用四层垂直架构，自上而下依次为：

**L4 Intent Interface（意图接入层）**
用户的自然语言输入在这里进入系统。这一层不做任何处理，只负责接收和格式化意图——无论是用户在网页输入框打的一句话，还是上游系统通过 `POST /api/intent` 推入的结构化意图。它的职责是"收口"，不做判断。

**L3.5 Planner Agent（规划层 ⭐ 命门）**
这是整个系统最核心的一层。Planner 拿到意图后，独立完成以下推理：看意图→判断需要哪些能力→决定调用顺序和依赖关系→输出一份完整的、可直接执行的 DAG plan（JSON）。它不是查预设的 yaml 模板，而是每次现场推理生成。Planner 的位置是"大脑"——上层意图进来，下层执行计划出去，它是唯一能将模糊自然语言翻译成可执行结构的节点。

**L3 Workflow Layer（工作流层）**
Planner 生成的 DAG plan 在这一层变成实际运行的工作流。DAG Runner 读取 plan 中的 steps，解析依赖关系，决定哪些步骤可以并行、哪些必须串行，然后调度执行。这一层不做任何业务判断，只负责"按图施工"。

**L2 Atomic Skill Layer（原子能力层）**
系统的能力积木。每个 Skill 是一个独立的最小可复用单元，有明确的输入/输出 schema。DAG Runner 调用这里的 Skill 来完成每一个具体步骤。Skill 可以被任意 DAG plan 引用和组合，MVP 实现 6 个。

**L1 Three Engines（引擎层）**
底层算力和数据基础设施：Prophet（群体智能预测）、Atlas（知识本体）、Claw（自动执行调度）。Skill 调用引擎，引擎不暴露给上层。

**Planner 的关键位置**：它是 L4 和 L3 之间的"翻译器"，也是 L2 能力清单的"策略选择者"。没有 Planner，系统只是一堆工具；有了 Planner，系统才有"自主性"。

---

## 2. 三大引擎职责矩阵

| 维度 | 🔮 Prophet Engine | 🗺️ Atlas Engine | ⚡ Claw Engine |
|---|---|---|---|
| **回答什么问题** | "这个品类/市场组合，用户群体会怎么反应？爆款概率多高？" | "这个品类的标准知识结构是什么？有哪些属性、合规要求、关键词？" | "这个 DAG plan 如何一步步执行？当前进度是什么？" |
| **核心原子 Skill** | `llm.simulate`（50 persona 模拟）+ `llm.reason`（推理分析） | `kb.lookup`（本体查询）+ 静态 `ontology.json` | DAG Runner + `llm.generate`（报告生成）+ `llm.transform` |
| **对标产品** | MiroFish（群体智能预测平台） | Palantir Foundry（企业知识本体建模） | OpenClaw（Agent 自动执行框架） |
| **缩水实现策略** | 不做真实用户行为数据训练，改为 LLM prompt 模拟 50 个带分布权重的 persona，每个 persona 独立给出评分和理由，汇总计算概率 | 不做动态知识图谱数据库，改为静态 `ontology.json` 文件预置 10 个品类的结构化知识，`kb.lookup` 直接读文件检索 | 不做真实 Agent 任务队列（无 Redis），改为 in-memory 任务队列 + SSE 流式推送执行状态，伪装成实时流程 |

---

## 3. Planner Agent 的输入输出与命门分析

### 输入

Planner 接收两类输入：

1. **用户意图**（必填）：一句自然语言，如"帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料"
2. **系统上下文**（注入 prompt）：
   - 可用 Skill 清单（6 个 Skill 的 id、描述、输入输出 schema）
   - 可用引擎列表（Prophet/Atlas/Claw 及其能力描述）
   - DAG plan 的 JSON schema 约束（严格格式要求）
   - 输出规则（步骤数限制、依赖写法、条件表达式格式）

### 输出

Planner 输出一份严格符合以下 schema 的 JSON：

```json
{
  "goal": "string — 一句话目标，复述用户核心诉求",
  "reasoning": "string — 2-3 句高层方法，说明为什么这样拆解",
  "estimated_seconds": "number — 预估总执行时长（秒）",
  "estimated_tokens": "number — 预估总 token 消耗",
  "steps": [
    {
      "id": "string — 步骤唯一 ID，如 s1/s2",
      "type": "'engine' | 'skill' — 调用类型",
      "name": "string — skill ID 或 engine 方法名，如 llm.simulate / prophet.predict",
      "inputs": "object — 该步骤的具体输入参数，key/value",
      "depends_on": "string[] — 依赖的前置步骤 ID 列表，空数组表示无依赖",
      "condition": "string | null — 条件表达式，如 '{{s1.output.burst_prob}} > 0.6'，null 表示无条件",
      "why": "string — 一句话：为什么这一步必要"
    }
  ],
  "success_criteria": "string[] — 可校验的完成条件列表",
  "risks": "string[] — 可能翻车点列表"
}
```

### Planner 的自主规划推理过程

Planner 的推理分三个内部阶段（通过 prompt engineering 引导 LLM 完成）：

1. **意图解析**：将自然语言拆解成"主体 + 动词 + 条件 + 目标市场"等结构化要素。例："户外咖啡机" → 品类；"能不能爆" → 需要 Prophet 预测；"能爆就准备" → 有条件分支；"德国市场上架材料" → 需要 Atlas 本体 + listing 生成。

2. **能力匹配**：对照可用 Skill 清单，判断每个子目标需要哪个 Skill，决定调用顺序和数据流（上一步的 output 如何作为下一步的 input）。

3. **DAG 构建**：显式声明每个步骤的依赖关系（`depends_on`），识别哪些步骤可以并行（无互相依赖），生成合法的 DAG 图（无环）。

### 为什么 Planner 是项目命门

**技术风险集中**：Planner 要求 LLM 输出严格格式的 JSON，且步骤之间的依赖逻辑必须合法（无环、引用存在的 step id）。一旦 LLM 输出格式错乱或依赖关系矛盾，整个 DAG 执行层崩溃。

**无法规避**：Planner 的质量直接决定演示效果——DAG 步骤数、并行度、条件分支，都来自 Planner 的一次推理，没有人工兜底。

**Prompt 工程是核心工作量**：Planner 的 system prompt 需要精确描述 schema、示例、边界规则，这是整个项目中需要最多迭代调试的部分，而非代码本身。

---

## 4. MVP 最小可信内核文件清单（预估）

总计：**32 个文件**

### 配置文件（3）

| 文件 | 说明 |
|---|---|
| `package.json` | 依赖声明：next、typescript、tailwindcss、shadcn、@anthropic-ai/sdk |
| `tsconfig.json` | TypeScript strict 模式配置 |
| `tailwind.config.ts` | Tailwind 主题配置 |

### Skill 资源（12）

每个 Skill 一个 yaml（元数据 + schema）+ 一个 prompt.md（LLM 指令）

| 文件 | 说明 |
|---|---|
| `skills/public/llm.transform/skill.yaml` | 文本转换 Skill 元数据 |
| `skills/public/llm.transform/prompt.md` | 文本转换 LLM 指令 |
| `skills/public/llm.generate/skill.yaml` | 结构化生成 Skill 元数据 |
| `skills/public/llm.generate/prompt.md` | 结构化生成 LLM 指令 |
| `skills/public/llm.reason/skill.yaml` | 推理分析 Skill 元数据 |
| `skills/public/llm.reason/prompt.md` | 推理分析 LLM 指令 |
| `skills/public/llm.simulate/skill.yaml` | 群体模拟 Skill 元数据（核心） |
| `skills/public/llm.simulate/prompt.md` | 群体模拟 LLM 指令（50 persona 分布） |
| `skills/public/llm.expand/skill.yaml` | 列表扩展 Skill 元数据 |
| `skills/public/llm.expand/prompt.md` | 列表扩展 LLM 指令 |
| `skills/public/kb.lookup/skill.yaml` | 本体查询 Skill 元数据 |
| `skills/public/kb.lookup/prompt.md` | 本体查询 LLM 指令（或直接读 JSON） |

### 引擎实现（3）

| 文件 | 说明 |
|---|---|
| `engines/prophet.ts` | Prophet Engine：封装 llm.simulate，计算 burst 概率 |
| `engines/atlas.ts` | Atlas Engine：读取 ontology.json，实现 kb.lookup |
| `engines/claw.ts` | Claw Engine：DAG Runner，in-memory 队列，`ExecutionContext` 共享状态，SSE 事件推送 |

### 核心 Lib（3）

| 文件 | 说明 |
|---|---|
| `lib/skill-loader.ts` | 扫描 skills/public/，读取 yaml + prompt.md，返回 Skill 注册表 |
| `lib/planner.ts` | Planner Agent：组装 prompt，调用 Claude，解析并验证 DAG JSON |
| `lib/anthropic.ts` | Anthropic SDK 单例客户端，统一管理 API key |

### API 路由（5）

| 文件 | 说明 |
|---|---|
| `app/api/plan/route.ts` | POST：接收意图，调用 Planner，返回 DAG plan JSON |
| `app/api/execute/route.ts` | POST：接收 plan，启动 DAG Runner，SSE 流式推送执行进度 |
| `app/api/prophet/route.ts` | POST：直接调用 Prophet Engine，返回 persona 模拟结果 |
| `app/api/atlas/route.ts` | POST：直接调用 Atlas Engine，返回本体查询结果 |
| `app/api/claw/route.ts` | POST：直接调用 Claw Engine 执行单个任务，SSE 推送 |

### 前端组件（5）

| 文件 | 说明 |
|---|---|
| `app/page.tsx` | 主页：4 Tab 布局容器 |
| `app/components/PlanRunner.tsx` | Plan & Run Tab：意图输入 + DAG 时间线 + 执行流 + 报告 |
| `app/components/ProphetPanel.tsx` | Prophet Tab：品类/市场输入 + persona 结果 + 概率展示 |
| `app/components/AtlasPanel.tsx` | Atlas Tab：实体查询输入 + 知识图谱结构化展示 |
| `app/components/ClawPanel.tsx` | Claw Tab：任务输入 + DAG 执行步骤流 |

### 数据文件（1）

| 文件 | 说明 |
|---|---|
| `data/ontology.json` | 10 个品类的本体知识结构（属性、合规、关键词、竞品等） |

### 文档（1）

| 文件 | 说明 |
|---|---|
| `README.md` | 项目说明、启动方式、演示意图示例 |

---

## 5. 三大风险点 + 兜底

### 风险 1：Planner 输出 JSON 格式不稳定

**症状**：LLM 有时返回 markdown 代码块包裹的 JSON，有时字段缺失，有时 `depends_on` 引用了不存在的 step id，导致 DAG Runner 解析崩溃。

**兜底**：
- `lib/planner.ts` 中对 Claude 调用启用 `tool_use` 模式（结构化输出），而非 free-form 文本，强制 schema 合规
- 加 JSON schema 验证层（`zod`），解析失败时自动 retry 一次（最多 2 次）
- DAG Runner 在执行前做依赖合法性校验（引用的 step id 必须存在且无环），校验失败返回明确错误而非静默崩溃

### 风险 2：llm.simulate 的 50 persona 并发导致超时或 token 爆炸

**症状**：50 个 persona 如果串行调用，每个 ~500 token，总计 25,000+ token，耗时可能超过 30 秒，超出前端等待容忍。

**兜底**：
- 不做 50 次独立 API 调用，改为一次调用让 Claude 在单个 prompt 中模拟全部 50 个 persona（"角色扮演矩阵"方式），输出结构化 JSON 数组
- 若单次 token 超限，降级为 20 persona，演示效果不变（概率计算仍然合理）
- SSE 流式推送中间结果，让用户看到"正在模拟"的进度感，而非等待黑屏

### 风险 3：前端 SSE 执行流与后端 DAG Runner 状态同步断裂

**症状**：DAG Runner 执行中某个 step 抛异常，SSE 连接断开，前端 UI 卡在中间状态，用户看不到任何反馈；或 step 并行执行时，前端渲染顺序混乱。

**兜底**：
- 每个 SSE 事件携带明确的 `{ type: 'step_start' | 'step_done' | 'step_error' | 'plan_complete', stepId, data }` 结构，前端按 `stepId` 更新对应卡片状态，顺序无关
- DAG Runner 用 `try/catch` 包裹每个 step 执行，step 失败时：先推送 `step_error` 事件，再将失败 step 的 error 信息连同原始意图送回 Planner 触发**单次 replan**（生成修订版 DAG 继续执行），而非整体中止
- Replan 仅做一次，若 replan 后仍失败则降级为跳过该 step、继续执行无依赖的后续 step，保证演示流程不断
- 前端设置 30 秒超时，超时后主动关闭 SSE 并展示"执行超时，已显示部分结果"
