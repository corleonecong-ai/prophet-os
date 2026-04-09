import { NextRequest, NextResponse } from 'next/server';
import { runPlanner } from '@/lib/planner';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { intent?: string };
    const intent = body?.intent?.trim();

    if (!intent) {
      return NextResponse.json({ error: 'intent is required' }, { status: 400 });
    }

    const result = await runPlanner(intent);

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Planner failed to generate a valid plan', detail: result.error, attempts: result.attempts },
        { status: 500 }
      );
    }

    return NextResponse.json({ plan: result.plan, attempts: result.attempts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
