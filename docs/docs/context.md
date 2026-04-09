# ProphetOS 作战上下文(给所有 AI 工具的圣经)

## 项目一句话定位
跨境卖家的自主规划 AI 操作系统:用户说一句话,Planner Agent 自己想清楚要调哪些原子 Skill 和引擎,生成 DAG plan,自动执行,回传结果。

## 范式跃迁(为什么 ProphetOS 不一样)
- JS/H10:工具集,用户自己干所有事
- Accio Work:技能包,用户挑技能
- Coze/Dify:工作流,用户搭流程
- **ProphetOS:意图驱动,用户只表达想要什么** ⭐

## 四层架构
- **L4 Intent Interface**:自然语言输入 / 结构化意图 / 上游 API
- **L3.5 Planner Agent ⭐**:看意图 → 输出可执行 DAG plan(本项目命门)
- **L3 Workflow Layer**:Planner 现场生成的 DAG(不是预设的 yaml)
- **L2 Atomic Skill Layer**:16 个原子能力(MVP 实现 6 个)
- **L1 Three Engines**:Prophet / Atlas / Claw

## 三大引擎(对应原始三大核心能力)
- 🔮 **Prophet Engine**:群体智能预测(对标 MiroFish)
  - 主要原子:`llm.simulate`(50 persona 模拟)+ `llm.reason`
- 🗺️ **Atlas Engine**:知识本体建模(对标 Palantir Foundry)
  - 主要原子:`kb.lookup`(本体查询)+ 静态 ontology.json
- ⚡ **Claw Engine**:Agent 自动执行(对标 OpenClaw)
  - 主要原子:DAG runner + task queue + 报告生成

## MVP 6 个原子 Skill(必做)
| Skill ID | 名称 | 输入 | 输出 |
|---|---|---|---|
| `llm.transform` | 文本转换 | text, instruction | text |
| `llm.generate` | 结构化生成 | schema, context | json |
| `llm.reason` | 推理分析 | facts, question | answer + steps |
| `llm.simulate` ⭐ | 群体行为模拟 | role, distribution, target | persona[] + summary |
| `llm.expand` | 列表扩展 | seed, n, criteria | list |
| `kb.lookup` | 本体查询 | entity, domain | entry |

## Planner Agent 输出 schema(必须严格遵守)
```json
{
  "goal": "一句话目标",
  "reasoning": "2-3 句高层方法",
  "estimated_seconds": 38,
  "estimated_tokens": 11500,
  "steps": [
    {
      "id": "s1",
      "type": "engine" | "skill",
      "name": "prophet.predict" | "llm.transform" | ...,
      "inputs": { ... },
      "depends_on": ["s0"],
      "condition": "{{s0.output}} == 'yes'",
      "why": "一句话:为什么这一步必要"
    }
  ],
  "success_criteria": ["可校验条件1", "可校验条件2"],
  "risks": ["可能翻车点"]
}
```

## 技术栈约束
- Next.js 14 App Router + TypeScript(strict)
- Tailwind CSS + shadcn/ui
- @anthropic-ai/sdk(模型字符串:`claude-sonnet-4-6`)
- 数据:静态 JSON,不用数据库
- 任务队列:in-memory(无 Redis)
- 不写测试,不上线

## MVP 必做清单
- [x] 项目骨架(Next.js 14)
- [x] Skill Loader(扫描 `skills/public/`,读 yaml + prompt.md)
- [x] 6 个原子 Skill(yaml + prompt.md)
- [x] Atlas Engine + `data/ontology.json`(10 品类)
- [x] Prophet Engine(`llm.simulate` 包装)
- [x] Planner Agent + `/api/plan` 路由
- [x] DAG Runner + `/api/execute` 路由(SSE 流式)
- [x] 前端单页(意图框 + Plan 时间线 + 执行流 + 报告)
- [x] README.md

## 严禁触碰(Rule of Engagement)
- ❌ 用户系统 / 数据库 / 登录 / 付费
- ❌ 真实电商平台 OAuth(Amazon/Shopify/TikTok)
- ❌ 真实图像生成(Unsplash 占位)
- ❌ 多智能体强化学习(LLM persona 够用)
- ❌ 单元测试 / E2E 测试
- ❌ 部署上线
- ❌ BI 看板和策略建议(那是另一个项目的领地)
- ❌ Plan 可视化编辑器
- ❌ 完整 Reflexion 循环(只做单次 replan)
- ❌ 16 个原子全部实现(6 个够 Demo)

## 与另一个项目(BI + Agent)的边界
ProphetOS 通过两个 API 与上游对接,但 MVP **只暴露接口骨架**,不真的对接:
- `POST /api/intent` ← 接收上游意图
- `POST /webhook/result` → 回传执行报告

## 成功标准(3 小时后必须达成)
浏览器打开 http://localhost:3000:
1. 输入意图"帮我看户外咖啡机能不能爆,能爆就准备德国市场上架材料"
2. 点击 "Plan & Run"
3. 看到 Planner 生成的 8 步左右 DAG 时间线
4. 看到 step 一个一个执行(部分并行)
5. 看到最终报告(burst 概率 + 德语 Listing + 合规清单 + 关键词)

完成上述 5 步 = 任务成功。
