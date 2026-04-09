# 🔮 ProphetOS

> **Intent-driven AI OS for cross-border e-commerce sellers.**
> Say one sentence → Planner Agent generates a DAG plan → auto-executes → returns a structured report.

## What Makes It Different

| Tool | Paradigm |
|---|---|
| JS/H10 | Toolset — user does everything |
| Accio Work | Skill packs — user picks skills |
| Coze / Dify | Workflow — user builds flows |
| **ProphetOS** ⭐ | **Intent-driven — user only expresses what they want** |

## Architecture

```
L4  Intent Interface          ← natural language input
L3.5 Planner Agent ⭐         ← sees intent → generates DAG plan (the core)
L3  Workflow Layer (DAG)      ← executes the plan step by step
L2  Atomic Skill Layer        ← 6 skills: llm.{transform,generate,reason,simulate,expand}, kb.lookup
L1  Three Engines             ← 🔮 Prophet | 🗺️ Atlas | ⚡ Claw
```

## Quick Start (3 steps)

```bash
# 1. Clone and install
git clone <repo>
cd prophet-os
npm install

# 2. Set your Anthropic API key
cp .env.local.example .env.local
# Edit .env.local and add: ANTHROPIC_API_KEY=sk-ant-xxxxx

# 3. Run
npm run dev
# Open http://localhost:3000
```

## Demo Intent

Paste this into the input box and click **Plan & Run**:

```
帮我看户外咖啡机能不能爆，能爆就准备德国市场上架材料
```

Expected flow:
1. Planner generates an 8-step DAG in ~3 seconds
2. Steps execute in parallel where possible (s1 + s2 run together, etc.)
3. Final report shows: burst probability % + German listing + compliance checklist + SEO keywords

## The 6 Atomic Skills

| Skill ID | Purpose | Input | Output |
|---|---|---|---|
| `llm.transform` | Text transformation | text, instruction | text |
| `llm.generate` | Structured JSON generation | schema, context | json |
| `llm.reason` | Step-by-step reasoning | facts, question | answer + steps + burst_prob |
| `llm.simulate` ⭐ | 50-persona crowd simulation | role_distribution, target, n | personas + summary + score |
| `llm.expand` | List expansion | seed, n, criteria | items[] |
| `kb.lookup` | Knowledge base lookup | entity, domain, market | entry |

## The Three Engines

- **🔮 Prophet** — Crowd intelligence prediction via persona simulation
- **🗺️ Atlas** — Product ontology with 10 categories, compliance data, and SEO keywords for DE/US/UK
- **⚡ Claw** — DAG runner: topological sort → parallel execution → SSE streaming

## API Endpoints

```
POST /api/plan           # intent → DAG plan JSON
POST /api/execute        # plan → SSE execution stream
POST /api/skill/:id      # call a single skill directly (debug)
POST /api/engine/:name   # call an engine directly (debug)
POST /api/intent         # upstream intent ingestion stub (202)
POST /api/webhook/result # result callback stub (200)
```

## Tech Stack

- **Next.js 14** App Router + TypeScript strict
- **Tailwind CSS** (dark theme)
- **@anthropic-ai/sdk** — model: `claude-sonnet-4-6`
- **zod** — plan schema validation
- **js-yaml** — skill manifest parsing
- No database, no Redis, no auth, no deployment

## Project Constraints (by design)

- ❌ No user auth / database / payments
- ❌ No real e-commerce OAuth
- ❌ No tests, no deployment
- ✅ 100% local, runs in 3 minutes
