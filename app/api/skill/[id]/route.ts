import { NextRequest, NextResponse } from 'next/server';
import { getSkillRegistry } from '@/lib/skills/loader';
import { executeSkill } from '@/lib/skills/executor';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json() as { inputs?: Record<string, unknown> };
    const inputs = body?.inputs ?? {};

    const registry = getSkillRegistry();
    const skill = registry.get(id);

    if (!skill) {
      return NextResponse.json(
        { error: `Skill "${id}" not found`, available: Array.from(registry.keys()) },
        { status: 404 }
      );
    }

    const output = await executeSkill(skill, inputs);
    return NextResponse.json({ skillId: id, output });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
