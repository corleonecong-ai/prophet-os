# ProphetOS — AI Worker Context

## One-liner
Cross-border seller AI OS: user says one sentence → Planner Agent generates DAG plan → auto-executes → returns structured report.

## Stack
- Next.js 14 App Router + TypeScript strict
- Tailwind CSS (no shadcn/ui components — plain Tailwind)
- @anthropic-ai/sdk, model: `claude-sonnet-4-6`
- No database, no Redis — static JSON + in-memory state
- No tests, no deployment

## Critical Rules
- Model string is ALWAYS `claude-sonnet-4-6` — never use other model names
- All paths use `@/` alias (maps to project root)
- Server-only code (engines, skills) lives in `lib/` — never import in client components
- DAG steps use IDs like `s1`, `s2`, `s3`
- Skill IDs: `llm.transform`, `llm.generate`, `llm.reason`, `llm.simulate`, `llm.expand`, `kb.lookup`
- Engine methods: `atlas.lookup`, `prophet.predict`, `claw.execute`

## Architecture
```
L4 Intent → L3.5 Planner Agent (⭐ core) → L3 DAG Runner → L2 Skills → L1 Engines
```

## Key Files
- `lib/planner/prompt.ts` — Planner system prompt builder
- `lib/planner/parse.ts` — DAG JSON parser + validator
- `lib/claw/dag-runner.ts` — Kahn topo sort + parallel execution + SSE events
- `lib/skills/loader.ts` — scans `skills/public/`, loads yaml + prompt.md
- `data/ontology.json` — 10 product categories for Atlas engine
- `app/api/plan/route.ts` — POST: intent → DAG plan
- `app/api/execute/route.ts` — POST: plan → SSE execution stream

## DO NOT
- Add database / auth / login
- Use any model other than `claude-sonnet-4-6`
- Add tests
- Create more than 6 skills
