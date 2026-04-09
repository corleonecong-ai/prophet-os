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

  const prompt = `You are Prophet Engine — the virtual market simulation core of ProphetOS, a cross-border e-commerce intelligence platform.

MISSION: Simulate ${n} hyper-realistic buyer personas evaluating the product below, then synthesize a market insight report that a seller could act on TODAY.

═══════════════════════════════════════════
PRODUCT UNDER EVALUATION
═══════════════════════════════════════════
${targetDesc}

═══════════════════════════════════════════
PERSONA MARKET RECIPE
═══════════════════════════════════════════
${personaContext}

═══════════════════════════════════════════
OUTPUT — pure JSON, no markdown, no preamble
═══════════════════════════════════════════

{
  "personas": [
    {
      "id": 1,
      "name": "Lena K.",
      "demographics": {
        "country": "DE", "region": "Baden-Württemberg",
        "age": 34, "gender": "F",
        "income_band": "upper_middle",
        "occupation": "Projektmanagerin"
      },
      "psychographics": {
        "lifestyle": "Wochenend-Wanderin, minimalistisch, zero-waste-orientiert",
        "values": ["Qualität vor Quantität", "Nachhaltigkeit", "Funktionalität"],
        "tech_savviness": "medium-high"
      },
      "shopping_behavior": {
        "primary_channels": ["amazon.de", "Globetrotter", "Decathlon"],
        "price_sensitivity": "medium",
        "research_depth": "very high — liest mindestens 50 Bewertungen",
        "impulse_threshold_usd": 55
      },
      "cultural_anchors": [
        "Globetrotter-Stammkundin seit 2019",
        "Stiftung Warentest abonniert",
        "besitzt Stanley Thermobecher",
        "Mitglied im DAV (Deutscher Alpenverein)",
        "schaut GearLab-Videos auf YouTube"
      ],
      "scores": {
        "awareness": 8, "interest": 9, "desire": 8,
        "purchase_intent": 6, "advocacy": 5
      },
      "decision_journey": {
        "trigger": "Freundin hat dasselbe Produkt beim Bergsteigen benutzt — sah beeindruckend aus",
        "research_path": ["Amazon Bewertungen (min. 4★)", "YouTube Praxistest", "Stiftung Warentest Archiv", "DAV-Forum"],
        "deal_breakers": ["kein CE-Zeichen", "Plastikteile die Kaffeegeschmack beeinflussen", "Preis über 85€"],
        "deal_makers": ["Edelstahl-Innenraum", "passt in 1L-Rucksackfach", "USB-C Ladeanschluss", "deutschsprachige Anleitung"],
        "willingness_to_pay_usd": 72
      },
      "voice": {
        "first_reaction": "Oh, das sieht tatsächlich praktisch aus. Aber ob das wirklich auf 2.000m Höhe funktioniert?",
        "concerns": [
          "Schmeckt der Kaffee wirklich gut? Ich bin da sehr empfindlich.",
          "Wie lange hält der Akku bei Kälte — Lithium verliert ja schnell Kapazität?"
        ],
        "hot_buttons": [
          "Kein Plastik, der in den Kaffee ausgast — das ist für mich ein Kaufargument.",
          "Passt in meine Osprey-Tasche? Wenn ja, nehme ich ihn beim nächsten Alpenüberquerung mit."
        ],
        "would_buy_if": "Wenn es einen echten Praxistest von einem Bergsteiger gibt — keine Instagram-Influencer.",
        "would_not_buy_if": "Kein CE-Zeichen oder Bewertungen unter 4,2 Sterne mit mehr als 200 Rezensionen."
      }
    }
  ],
  "market_insights": {
    "burst_score": {
      "overall": 74,
      "aida": {
        "awareness": 81, "interest": 83, "desire": 74,
        "purchase_intent": 65, "advocacy": 58
      },
      "score": 7.3,
      "confidence": "medium-high",
      "rationale": "Starke Awareness und Interest durch klare Produktkategorie — Desire-to-Purchase Drop von 9 Punkten zeigt typisches Preissensitivitätsmuster im deutschen Outdoor-Markt. CE-Zertifizierung ist kritischer Vertrauensfaktor."
    },
    "segments": [
      {
        "name": "🏔️ DAV-Mitglieder & Alpinisten",
        "size_pct": 28,
        "intent": 8.4,
        "description": "Hohe Zahlungsbereitschaft, priorisieren Qualität und Praxistauglichkeit über Preis. Hauptentscheidungsquelle: Community-Empfehlungen und echte Bergsteiger-Tests.",
        "key_quote": "Wenn es auf der Zugspitze funktioniert, kaufe ich es sofort."
      },
      {
        "name": "☕ Kaffeequalitätsbewusste",
        "size_pct": 22,
        "intent": 6.1,
        "description": "Zweifeln an Brühqualität in der Natur. Schwer zu überzeugen ohne Blindtest-Bewertung von anerkanntem Kaffeeexperten.",
        "key_quote": "Espresso outdoor? Das glaube ich erst wenn ich ihn getrunken habe."
      },
      {
        "name": "🎒 Wochenend-Wanderer",
        "size_pct": 31,
        "intent": 7.6,
        "description": "Preissensitiver, aber bereit für Qualität zu zahlen wenn Nutzen klar ist. Entscheidet nach Amazon-Bewertungen und YouTube-Videos.",
        "key_quote": "Für 70€ nehme ich das Risiko — wenn es schlecht ist, geht es zurück."
      },
      {
        "name": "🎁 Geschenkekäufer",
        "size_pct": 19,
        "intent": 7.2,
        "description": "Kaufentscheidung auf Basis von Verpackungsqualität und Geschenkbarkeit. Preis weniger relevant als Präsentation.",
        "key_quote": "Das ist das perfekte Weihnachtsgeschenk für meinen Outdoor-verrückten Bruder."
      }
    ],
    "top_drivers": [
      { "factor": "Edelstahl-Innenraum ohne Plastikgeschmack", "weight": 0.38, "evidence": "${n} von ${n} Personas nannten Materialqualität als Primärkriterium" },
      { "factor": "Kompakte Größe (Rucksack-kompatibel)", "weight": 0.31, "evidence": "Ausschlaggebend für Alpin- und Wanderer-Segment" },
      { "factor": "USB-C Schnellladung", "weight": 0.21, "evidence": "Deal-Maker für tech-affines Segment, besonders 25-35 Jahre" },
      { "factor": "Deutschsprachige Bedienungsanleitung", "weight": 0.14, "evidence": "Vertrauenssignal für deutschen Markt — fehlt bei vielen Konkurrenten" }
    ],
    "top_blockers": [
      { "factor": "Preis über 85€", "weight": 0.44, "evidence": "Psychologische Kaufschwelle für Massenmarkt-Segment" },
      { "factor": "Fehlendes CE-Zeichen / GS-Prüfzeichen", "weight": 0.36, "evidence": "Absoluter Dealbreaker für informierten deutschen Käufer" },
      { "factor": "Brühqualitätszweifel (kein Blindtest)", "weight": 0.26, "evidence": "Coffee-Snob-Segment (22%) bleibt skeptisch ohne externe Validierung" },
      { "factor": "Unbekannte Marke ohne Bewertungshistorie", "weight": 0.19, "evidence": "Deutsche Käufer vertrauen Marken mit 200+ Amazon-Bewertungen" }
    ],
    "actionable_insights": [
      "🎯 Headline-Botschaft: 'Von echten Bergsteigern getestet' — kein Influencer-Content, keine Stock-Fotos",
      "💰 Preisanker: €69-79 ist das Sweet Spot — €80 ist die psychologische Todeszone für DE-Markt",
      "🏅 CE-Zertifizierung vor Launch beschaffen — 36% Deal-Breaker-Rate ist inakzeptabel",
      "📝 Bullet 1 muss enthalten: Edelstahl + CE-Zeichen + Deutsche Anleitung (drei Vertrauensanker)",
      "🎁 Gift-Variante mit Premiumverpackung entwickeln — 19% der Käufer sind Geschenke-Segment",
      "⭐ Amazon-Bewertungsaufbau priorisieren — deutsche Käufer warten auf 200+ Rezensionen"
    ]
  }
}

═══════════════════════════════════════════
EXECUTION RULES — non-negotiable
═══════════════════════════════════════════

AUTHENTICITY (most important):
• Voice must sound like WhatsApp message to a friend, NOT a marketing survey
  ✗ BAD: "Ich schätze Qualität und Nachhaltigkeit sehr."
  ✓ GOOD: "Lieber einmal 75€ ausgeben als dreimal 25€ für Schrott."
• Cultural anchors: hyper-specific real brands/communities
  ✗ BAD: "kauft gerne online"
  ✓ GOOD: "Globetrotter-Stammkunde, DAV-Mitglied, hat Stanley-Thermos"
• Mix German and English in voice quotes naturally (how bilingual shoppers actually think)

CONSISTENCY (enforced):
• If deal_breaker = "above €80" and product = €85 → purchase_intent ≤ 3, PERIOD
• If persona values "eco" → they check material + packaging before price
• Skeptical personas (score ≤ 5) must have specific, credible objections

DISTRIBUTION:
• Follow market recipe demographics roughly
• ~20% score 1-5 (skeptics), ~45% score 5-7 (interested), ~35% score 7-10 (enthusiasts)
• Vary age 22-65, gender balanced, regions across DE/AT/CH

AGGREGATION:
• aida scores = precise averages across all ${n} personas (1 decimal)
• evidence strings cite specific numbers: "X von ${n} Personas..."
• actionable_insights are executable TODAY — no vague advice

OUTPUT: Pure JSON only. No markdown. No explanation. Start with { and end with }.`;

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
