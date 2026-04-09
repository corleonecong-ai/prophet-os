import { getClient, MODEL } from '@/lib/anthropic';
import { getSkillRegistry, buildSkillCatalog } from '@/lib/skills/loader';
import { buildPlannerSystemPrompt } from './prompt';
import { parsePlan } from './parse';
import type { Plan } from './parse';

const MAX_RETRIES = 2;

export interface PlannerResult {
  ok: boolean;
  plan?: Plan;
  error?: string;
  attempts: number;
}

export async function runPlanner(intent: string): Promise<PlannerResult> {
  const client = getClient();
  const registry = getSkillRegistry();
  const skillCatalog = buildSkillCatalog(registry);
  const systemPrompt = buildPlannerSystemPrompt(skillCatalog);

  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const userContent =
      attempt === 1
        ? intent
        : `${intent}\n\nIMPORTANT: Your previous output failed validation: ${lastError}. Output ONLY valid JSON matching the schema exactly. No markdown fences, no explanation.`;

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text : '';
      const result = parsePlan(raw);

      if (result.ok && result.plan) {
        return { ok: true, plan: result.plan, attempts: attempt };
      }

      lastError = result.error ?? 'Unknown parse error';
      console.warn(`[Planner] Attempt ${attempt} failed: ${lastError}`);
    } catch (e) {
      lastError = (e as Error).message;
      console.warn(`[Planner] Attempt ${attempt} API error: ${lastError}`);
    }
  }

  return { ok: false, error: lastError, attempts: MAX_RETRIES };
}
