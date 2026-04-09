import { NextRequest } from 'next/server';
import { runDAG } from '@/lib/claw/dag-runner';
import type { RunEvent } from '@/lib/claw/dag-runner';
import type { Plan } from '@/lib/planner/parse';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json() as { plan: Plan };
  const { plan } = body;

  if (!plan || !plan.steps) {
    return new Response(JSON.stringify({ error: 'plan is required' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller may be closed if client disconnected
        }
      };

      try {
        await runDAG(plan, send);
      } catch (e) {
        send({ type: 'plan_error', error: (e as Error).message, timestamp: Date.now() });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
