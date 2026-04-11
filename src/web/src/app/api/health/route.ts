import { NextResponse } from 'next/server';
import { dbGetWorkerHealth } from '@/lib/managers/ralph-task-db';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const now = new Date().toISOString();

  let worker: {
    status: 'active' | 'idle' | 'stale';
    pendingJobs: number;
    runningJobs: number;
    lastHeartbeat: string | null;
  };

  try {
    const health = await dbGetWorkerHealth();
    let status: 'active' | 'idle' | 'stale' = 'idle';

    if (health.runningJobs > 0) {
      const lastBeat = health.lastHeartbeat ? new Date(health.lastHeartbeat).getTime() : 0;
      status = Date.now() - lastBeat > STALE_THRESHOLD_MS ? 'stale' : 'active';
    }

    worker = { status, ...health };
  } catch {
    worker = { status: 'idle', pendingJobs: 0, runningJobs: 0, lastHeartbeat: null };
  }

  return NextResponse.json(
    {
      ok: true,
      timestamp: now,
      worker,
    },
    { status: 200 }
  );
}
