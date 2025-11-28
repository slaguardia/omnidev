// app/api/generate-key/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { saveApiKey } from '@/lib/config/api-key-store';

// This API route only requires next-auth authentication
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = await saveApiKey(session.user.name); // or session.user.id
  return NextResponse.json({ apiKey });
}
