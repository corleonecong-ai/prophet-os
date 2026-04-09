import { getClient, MODEL } from '@/lib/anthropic';
import type { SkillMeta } from './types';

function injectInputs(template: string, inputs: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = inputs[key];
    if (val === undefined) return `{{${key}}}`;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}

function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) return raw.slice(first, last + 1);
  // Try array extraction
  const firstArr = raw.indexOf('[');
  const lastArr = raw.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) return raw.slice(firstArr, lastArr + 1);
  return raw.trim();
}

function parseOutput(raw: string): unknown {
  const extracted = extractJSON(raw);
  try {
    return JSON.parse(extracted);
  } catch {
    // Return as plain text if not JSON
    return { text: raw.trim() };
  }
}

export async function executeSkill(
  skill: SkillMeta,
  inputs: Record<string, unknown>
): Promise<unknown> {
  // kb.lookup is handled by Atlas engine directly — delegate
  if (skill.id === 'kb.lookup') {
    const { lookup } = await import('@/lib/engines/atlas');
    const result = await lookup(inputs as unknown as Parameters<typeof lookup>[0]);
    return result;
  }

  // llm.simulate is handled by Prophet engine — delegate for better persona logic
  if (skill.id === 'llm.simulate') {
    const { predict } = await import('@/lib/engines/prophet');
    return predict(inputs as unknown as Parameters<typeof predict>[0]);
  }

  // All other skills: inject prompt template and call Claude
  const client = getClient();
  const prompt = injectInputs(skill.promptTemplate, inputs);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const output = parseOutput(raw);

  // Post-process llm.reason: extract burst_prob from text if LLM didn't output structured JSON
  if (skill.id === 'llm.reason' && typeof output === 'object' && output !== null) {
    const o = output as Record<string, unknown>;
    if (o.burst_prob === undefined) {
      // Try to extract a number between 0 and 1 from the raw text
      const probMatch = raw.match(/burst_prob["\s:]+([01]?\.\d+)/);
      if (probMatch) {
        o.burst_prob = parseFloat(probMatch[1]);
      } else {
        // Extract any probability-looking number from the text (0.XX pattern)
        const anyProbMatch = raw.match(/\b(0\.\d{1,2})\b/);
        o.burst_prob = anyProbMatch ? parseFloat(anyProbMatch[1]) : 0.5;
      }
    }
  }

  return output;
}
