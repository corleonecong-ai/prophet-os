import { NextRequest, NextResponse } from 'next/server';

// Upstream intent ingestion stub — receives intent from external systems
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { intent?: string };
  console.log('[Intent] Received:', body?.intent ?? '(empty)');
  return NextResponse.json({ status: 'accepted', message: 'Intent queued' }, { status: 202 });
}
