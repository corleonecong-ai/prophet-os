export interface SkillParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  engine: 'prophet' | 'atlas' | 'claw' | 'llm';
  inputs: SkillParam[];
  outputs: SkillParam[];
  promptTemplate: string;
}

export type SkillRegistry = Map<string, SkillMeta>;
