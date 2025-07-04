// app/api/generate-key/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { saveApiKey } from '@/lib/config/api-key-store';

// This API route only requires next-auth authentication
export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = await saveApiKey(session.user.name); // or session.user.id
  return NextResponse.json({ apiKey });
}
