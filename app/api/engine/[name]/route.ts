import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/lib/engines/index';

export async function POST(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const { name } = params;
    const body = await req.json() as { method?: string; inputs?: Record<string, unknown> };
    const method = body?.method ?? 'lookup';
    const inputs = body?.inputs ?? {};

    const engine = getEngine(name);

    if (!engine[method]) {
      return NextResponse.json(
        { error: `Engine "${name}" has no method "${method}"` },
        { status: 404 }
      );
    }

    const output = await engine[method](inputs);
    return NextResponse.json({ engine: name, method, output });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
