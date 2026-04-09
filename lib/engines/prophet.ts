import { getClient, MODEL } from '@/lib/anthropic';

export interface ProphetPredictInput {
  role_distribution: string;
  target: string;
  n?: number;
}

export interface Persona {
  id: string;
  segment: string;
  score: number;
  reason: string;
  objection: string;
}

export interface ProphetPredictOutput {
  personas: Persona[];
  summary: string;
  score: number;
  burst_prob: number;
}

function scoreToBurstProb(avgScore: number): number {
  // Map average score (1-10) to burst probability (0-1)
  // Score 7+ → high probability; score <5 → low
  return Math.min(1, Math.max(0, (avgScore - 3) / 6));
}

function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) return raw.slice(first, last + 1);
  return raw.trim();
}

export async function predict(input: ProphetPredictInput): Promise<ProphetPredictOutput> {
  const client = getClient();
  const n = Math.min(input.n ?? 50, 50);

  const prompt = `You are a consumer persona simulation engine.

Simulate ${n} distinct consumer personas from the given role distribution, each independently evaluating the target product.

Role Distribution: ${input.role_distribution}
Target: ${input.target}
Number of Personas: ${n}

Output ONLY valid JSON in this exact structure:
{
  "personas": [
    {
      "id": "p1",
      "segment": "segment label",
      "score": 7,
      "reason": "one sentence why this score",
      "objection": "one sentence main concern"
    }
  ],
  "summary": "3-4 sentence narrative of collective reactions, key themes, purchase drivers",
  "score": 6.8
}

Score distribution MUST be realistic: ~20% score 1-4, ~50% score 5-7, ~30% score 8-10.
Output ONLY the JSON — no markdown, no preamble.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';

  let parsed: { personas: Persona[]; summary: string; score: number };
  try {
    parsed = JSON.parse(extractJSON(raw));
  } catch {
    // Fallback if JSON parse fails
    parsed = {
      personas: [],
      summary: raw.slice(0, 500),
      score: 5.5,
    };
  }

  const avgScore = parsed.score ?? 5.5;
  const burst_prob = scoreToBurstProb(avgScore);

  return {
    personas: parsed.personas ?? [],
    summary: parsed.summary ?? '',
    score: avgScore,
    burst_prob: Math.round(burst_prob * 100) / 100,
  };
}
