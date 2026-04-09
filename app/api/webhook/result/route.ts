import { NextRequest, NextResponse } from 'next/server';

// Result webhook stub — called when execution completes, relays to upstream
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  console.log('[Webhook] Result received:', JSON.stringify(body).slice(0, 200));
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
