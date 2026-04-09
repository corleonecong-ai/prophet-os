import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { SkillMeta, SkillRegistry } from './types';

const SKILLS_DIR = path.join(process.cwd(), 'skills', 'public');

export function loadSkills(): SkillRegistry {
  const registry: SkillRegistry = new Map();

  if (!fs.existsSync(SKILLS_DIR)) return registry;

  const skillDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of skillDirs) {
    const yamlPath = path.join(SKILLS_DIR, dir, 'skill.yaml');
    const promptPath = path.join(SKILLS_DIR, dir, 'prompt.md');

    if (!fs.existsSync(yamlPath) || !fs.existsSync(promptPath)) continue;

    try {
      const raw = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as Omit<SkillMeta, 'promptTemplate'>;
      const promptTemplate = fs.readFileSync(promptPath, 'utf8');
      registry.set(raw.id, { ...raw, promptTemplate });
    } catch (e) {
      console.warn(`[SkillLoader] Failed to load skill "${dir}":`, e);
    }
  }

  return registry;
}

// Singleton — loaded once, reused across requests
let _registry: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!_registry) _registry = loadSkills();
  return _registry;
}

export function buildSkillCatalog(registry: SkillRegistry): string {
  return Array.from(registry.values())
    .map(
      (s) =>
        `- ${s.id}: ${s.description}\n  inputs: ${s.inputs.map((p) => `${p.name}(${p.type})`).join(', ')}\n  outputs: ${s.outputs.map((p) => `${p.name}(${p.type})`).join(', ')}`
    )
    .join('\n');
}
