import { getClient, MODEL } from '@/lib/anthropic';

// ── Input / Output Types ──────────────────────────────────────────────────────

export interface ProphetPredictInput {
  role_distribution?: string;
  target?: string;
  category?: string;
  market?: string;
  persona_template?: string;
  n?: number;
}

export interface AidaScores {
  awareness: number;
  interest: number;
  desire: number;
  purchase_intent: number;
  advocacy: number;
}

export interface RichPersona {
  id: string | number;
  name?: string;
  segment?: string;
  demographics?: {
    country?: string;
    region?: string;
    age?: number;
    gender?: string;
    income_band?: string;
    occupation?: string;
  };
  psychographics?: {
    lifestyle?: string;
    values?: string[];
    tech_savviness?: string;
  };
  shopping_behavior?: {
    primary_channels?: string[];
    price_sensitivity?: string;
    research_depth?: string;
    impulse_threshold_usd?: number;
  };
  cultural_anchors?: string[];
  scores?: AidaScores;
  score?: number; // legacy
  decision_journey?: {
    trigger?: string;
    research_path?: string[];
    deal_breakers?: string[];
    deal_makers?: string[];
    willingness_to_pay_usd?: number;
  };
  voice?: {
    first_reaction?: string;
    concerns?: string[];
    hot_buttons?: string[];
    would_buy_if?: string;
    would_not_buy_if?: string;
  };
  reason?: string;
  objection?: string;
}

export interface PersonaSegment {
  name: string;
  size_pct: number;
  intent: number;
  description: string;
  key_quote?: string;
}

export interface DriverBlocker {
  factor: string;
  weight: number;
  evidence?: string;
}

export interface ProphetPredictOutput {
  personas: RichPersona[];
  summary: string;
  score: number;
  burst_prob: number;
  aida?: AidaScores;
  segments?: PersonaSegment[];
  top_drivers?: DriverBlocker[];
  top_blockers?: DriverBlocker[];
  actionable_insights?: string[];
  confidence?: string;
  rationale?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToBurstProb(avgScore: number): number {
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

function aidaAvg(personas: RichPersona[]): AidaScores | undefined {
  const withScores = personas.filter(p => p.scores);
  if (withScores.length === 0) return undefined;
  const keys: (keyof AidaScores)[] = ['awareness', 'interest', 'desire', 'purchase_intent', 'advocacy'];
  const result = {} as AidaScores;
  for (const k of keys) {
    result[k] = Math.round(
      (withScores.reduce((sum, p) => sum + (p.scores?.[k] ?? 0), 0) / withScores.length) * 10
    ) / 10;
  }
  return result;
}

function getPersonaScore(p: RichPersona): number {
  if (typeof p.score === 'number') return p.score;
  if (p.scores) {
    const s = p.scores;
    return (s.awareness + s.interest + s.desire + s.purchase_intent + s.advocacy) / 5;
  }
  return 5;
}

// ── Persona Template Builder ──────────────────────────────────────────────────

function buildPersonaContext(input: ProphetPredictInput): string {
  const market = input.market ?? 'Germany (Amazon.de)';
  const category = input.category ?? input.target ?? input.role_distribution ?? 'cross-border product';

  // Pick template based on category keywords
  const isOutdoor = /outdoor|camping|hiking|backpack|咖啡|coffee|charger|solar|lantern|power/i.test(category);
  const isTech = /tech|electronic|gadget|wireless|earbuds|bluetooth|smart/i.test(category);
  const isPet = /pet|dog|cat|animal/i.test(category);
  const isDE = /de|german|germany|deutsch/i.test(market);

  if (isDE && isOutdoor) {
    return `
**Market: Germany Amazon.de — Outdoor / Lifestyle Shoppers**
Demographics distribution:
  - 25-35 yr (Millennials, eco-conscious, quality-first): 32%
  - 36-50 yr (Established buyers, safety + durability): 28%
  - 18-24 yr (Students, price-sensitive, trend-driven): 18%
  - 51+ yr (Brand-loyal, skeptical of new products): 22%
Cultural anchors pool: Decathlon shopper, REI/Globetrotter member, Stiftung Warentest reader,
  outdoor YouTube reviewer, Amazon Prime subscriber, eco-label seeker (EU Ecolabel, Blauer Engel),
  Lidl/Aldi-first buyer, weekend camper, commuter cyclist, Fridays For Future supporter.
Shopping behavior: Research-heavy (DE avg 3.2 sources pre-purchase), review-driven, CE/GS mark required,
  Stiftung Warentest score matters, price sensitivity HIGH above €80, German-language listing expected.`;
  }

  if (isTech) {
    return `
**Market: Tech Early Adopters + Mainstream**
Demographics distribution:
  - 22-35 yr (Tech enthusiasts, early adopters): 35%
  - 36-50 yr (Mainstream, value-driven): 30%
  - 18-21 yr (Gen Z, social-proof driven): 20%
  - 51+ yr (Late adopters, needs simplicity): 15%
Cultural anchors pool: Reddit r/gadgets user, Wirecutter subscriber, MKBHD viewer, Product Hunt backer,
  Amazon Vine reviewer, Hacker News reader, Discord community member, YouTube comparison watcher.
Shopping behavior: Spec-compare before buying, YouTube review minimum, price-performance ratio matters,
  upgradeability valued, quick deal-breaker if reviews mention quality issues.`;
  }

  // Default: general Amazon shopper
  return `
**Market: ${market} — General Amazon Shoppers**
Demographics distribution:
  - 25-35 yr (Value-seekers, research-driven): 28%
  - 36-50 yr (Quality-first, brand-aware): 25%
  - 18-24 yr (Budget-conscious, trend-driven): 20%
  - 51+ yr (Brand-loyal, conservative): 15%
  - Other: 12%
Cultural anchors pool: Amazon Prime member, price-comparison shopper, YouTube reviewer watcher,
  social media product discoverer, friends/family recommendation follower, sale hunter.
Shopping behavior: Reviews-first, price-sensitive below average category price,
  return policy matters, fast shipping expected, name-brand trust factor.`;
}

// ── Main predict() ────────────────────────────────────────────────────────────

export async function predict(input: ProphetPredictInput): Promise<ProphetPredictOutput> {
  const client = getClient();
  const n = Math.min(input.n ?? 15, 20); // Cap at 20 for speed; 15 default
  const targetDesc = input.target ?? input.category ?? input.role_distribution ?? 'the product';
  const personaContext = input.persona_template ?? buildPersonaContext(input);

  const prompt = `You are Prophet Engine — a virtual market simulation engine for cross-border e-commerce.
Your job: simulate ${n} REAL-FEELING buyer personas evaluating a product, then produce a structured market insight report.

## Product Under Evaluation
${targetDesc}

## Persona Market Recipe
${personaContext}

## Output Format — STRICT JSON, no markdown

Output ONE JSON object with this exact structure:

{
  "personas": [
    {
      "id": 1,
      "name": "Sarah M.",
      "demographics": { "country": "DE", "region": "Bavaria", "age": 32, "gender": "F", "income_band": "middle", "occupation": "teacher" },
      "psychographics": { "lifestyle": "outdoor_enthusiast", "values": ["quality", "sustainability"], "tech_savviness": "medium" },
      "shopping_behavior": { "primary_channels": ["amazon.de", "decathlon"], "price_sensitivity": "medium", "research_depth": "high", "impulse_threshold_usd": 60 },
      "cultural_anchors": ["Decathlon regular", "Stiftung Warentest reader", "owns Thermos flask"],
      "scores": { "awareness": 7, "interest": 8, "desire": 7, "purchase_intent": 5, "advocacy": 4 },
      "decision_journey": {
        "trigger": "saw it recommended in a camping Facebook group",
        "research_path": ["amazon reviews", "youtube demo"],
        "deal_breakers": ["no CE mark", "plastic build", "above €80"],
        "deal_makers": ["stainless steel", "compact size", "German manual included"],
        "willingness_to_pay_usd": 65
      },
      "voice": {
        "first_reaction": "Sieht praktisch aus, aber mal schauen ob es wirklich funktioniert.",
        "concerns": ["Hält die Wärme wirklich lange?", "Gibt es ein CE-Zeichen?"],
        "hot_buttons": ["Edelstahl ist gut — kein Plastikgeschmack", "Passt in meinen Rucksack"],
        "would_buy_if": "Wenn es Stiftung Warentest-ähnliche Bewertungen gibt",
        "would_not_buy_if": "Kein deutsches Handbuch oder kein CE-Zeichen"
      }
    }
    // ... repeat for all ${n} personas
  ],
  "market_insights": {
    "burst_score": {
      "overall": 72,
      "aida": { "awareness": 75, "interest": 78, "desire": 68, "purchase_intent": 62, "advocacy": 55 },
      "score": 7.1,
      "confidence": "medium-high",
      "rationale": "Strong awareness and interest but purchase intent drops — classic price-sensitive outdoor category"
    },
    "segments": [
      { "name": "🏕️ Weekend Campers", "size_pct": 35, "intent": 7.8, "description": "Quality-first, willing to pay for durability", "key_quote": "If it survives a hiking trip, I'm sold." },
      { "name": "☕ Urban Coffee Lovers", "size_pct": 25, "intent": 6.2, "description": "Skeptical about outdoor brew quality", "key_quote": "Can it really make decent espresso outside?" },
      { "name": "🎁 Gift Buyers", "size_pct": 20, "intent": 7.0, "description": "Packaging and giftability matter most", "key_quote": "Makes a perfect birthday gift for outdoor friends." }
    ],
    "top_drivers": [
      { "factor": "stainless steel / no plastic taste", "weight": 0.34, "evidence": "mentioned by 11 of 15 personas" },
      { "factor": "compact & packable design", "weight": 0.28, "evidence": "top desire trigger for camping segment" },
      { "factor": "USB-C charging", "weight": 0.18, "evidence": "deal-maker for tech-savvy segment" }
    ],
    "top_blockers": [
      { "factor": "price above €80", "weight": 0.42, "evidence": "21 personas set €80 as ceiling" },
      { "factor": "no CE/GS certification", "weight": 0.31, "evidence": "mandatory for German market trust" },
      { "factor": "brew quality doubt", "weight": 0.22, "evidence": "coffee snob segment unconvinced" }
    ],
    "actionable_insights": [
      "🎯 Lead with 'tested by real backpackers' — not influencer content",
      "🎯 Price anchor €65-79 — €80 is the psychological ceiling for DE market",
      "💡 Highlight stainless steel + CE mark + German manual in first bullet",
      "⚠️ Must obtain CE certification before DE listing — 31% deal-breaker",
      "🎁 Create gift-ready packaging — 20% of buyers are gift shoppers"
    ]
  }
}

## CRITICAL RULES — read before generating:

1. **Voice must sound like a REAL person texting**, not a survey. BAD: "I value sustainability and quality." GOOD: "I'd rather buy one €70 thing that lasts than three €20 things that break."
2. **Cultural anchors must be SPECIFIC**: BAD: "shops online frequently" GOOD: "Decathlon regular, Stiftung Warentest reader, owns a Thermos flask"
3. **Scores must be internally consistent**: if a persona's deal-breaker is "above €80" and product costs €90, their purchase_intent must be ≤ 3.
4. **No two personas use the same phrasing in voice fields** — vary tone, vocabulary, language (German personas can have German voice quotes).
5. **Distribution must roughly follow the market recipe** — do not over-represent any demographic.
6. **aida scores** are averages across all ${n} personas (1 decimal).
7. Output ONLY the JSON object — no markdown fences, no explanation, no preamble.

Generate ${n} personas + market_insights now.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';

  let parsed: {
    personas?: RichPersona[];
    market_insights?: {
      burst_score?: { overall?: number; aida?: AidaScores; score?: number; confidence?: string; rationale?: string };
      segments?: PersonaSegment[];
      top_drivers?: DriverBlocker[];
      top_blockers?: DriverBlocker[];
      actionable_insights?: string[];
    };
    // legacy flat structure
    summary?: string;
    score?: number;
  };

  try {
    parsed = JSON.parse(extractJSON(raw));
  } catch {
    parsed = { personas: [], summary: raw.slice(0, 400), score: 5.5 };
  }

  const personas = parsed.personas ?? [];
  const mi = parsed.market_insights;

  // Compute score: prefer market_insights.burst_score.score, then mean of personas
  let avgScore = mi?.burst_score?.score ?? parsed.score ?? null;
  if (avgScore === null) {
    avgScore = personas.length > 0
      ? personas.reduce((s, p) => s + getPersonaScore(p), 0) / personas.length
      : 5.5;
  }

  const overallPct = mi?.burst_score?.overall;
  const burst_prob = overallPct != null
    ? Math.round(overallPct) / 100
    : Math.round(scoreToBurstProb(avgScore) * 100) / 100;

  // Compute AIDA from personas if not in market_insights
  const aida: AidaScores | undefined = mi?.burst_score?.aida ?? aidaAvg(personas);

  const summary = mi
    ? `爆款概率 ${Math.round(burst_prob * 100)}%（${mi.burst_score?.confidence ?? ''}）· ${mi.burst_score?.rationale ?? ''}`
    : (parsed.summary ?? '');

  return {
    personas,
    summary,
    score: Math.round(avgScore * 10) / 10,
    burst_prob,
    aida,
    segments: mi?.segments,
    top_drivers: mi?.top_drivers,
    top_blockers: mi?.top_blockers,
    actionable_insights: mi?.actionable_insights,
    confidence: mi?.burst_score?.confidence,
    rationale: mi?.burst_score?.rationale,
  };
}
