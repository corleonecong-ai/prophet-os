import fs from 'fs';
import path from 'path';

type OntologyEntry = Record<string, unknown>;
type Ontology = Record<string, OntologyEntry>;

let _ontology: Ontology | null = null;

function getOntology(): Ontology {
  if (!_ontology) {
    const filePath = path.join(process.cwd(), 'data', 'ontology.json');
    _ontology = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Ontology;
  }
  return _ontology;
}

function normalizeKey(entity: string): string {
  return entity.toLowerCase().replace(/[\s-]+/g, '_');
}

export interface AtlasLookupInput {
  entity: string;
  domain: string;
  market?: string;
}

export interface AtlasLookupOutput {
  entry: unknown;
  source: 'ontology' | 'fallback';
}

export async function lookup(input: AtlasLookupInput): Promise<AtlasLookupOutput> {
  const ontology = getOntology();
  const key = normalizeKey(input.entity);
  const entry = ontology[key];

  if (!entry) {
    // Entity not found — return a minimal structured fallback
    return {
      entry: {
        entity: input.entity,
        domain: input.domain,
        market: input.market ?? 'DE',
        note: 'Entity not in ontology. Using inferred data.',
        compliance: { DE: { certifications_required: ['CE'], regulations: [], restrictions: [], labeling_requirements: ['CE marking', 'German manual'] } },
        keywords: { DE: { primary: [], long_tail: [] } },
        attributes: [],
        price_range: { min: 0, max: 0, currency: 'EUR' },
      },
      source: 'fallback',
    };
  }

  // Domain-specific extraction
  if (input.domain === 'compliance' && input.market) {
    const compliance = (entry.compliance as Record<string, unknown>)?.[input.market];
    return { entry: compliance ?? entry.compliance, source: 'ontology' };
  }

  if (input.domain === 'keywords' && input.market) {
    const keywords = (entry.keywords as Record<string, unknown>)?.[input.market];
    return { entry: keywords ?? entry.keywords, source: 'ontology' };
  }

  if (input.domain === 'price_range') {
    return { entry: entry.price_range, source: 'ontology' };
  }

  if (input.domain === 'competitors') {
    return { entry: entry.top_competitors, source: 'ontology' };
  }

  // Default: return full entry
  return { entry, source: 'ontology' };
}
