import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isMcpProxyEnabled, proxyToMcp } from './proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, []);
}

export async function POST(request: NextRequest) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, []);
}

export async function PUT(request: NextRequest) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, []);
}

export async function PATCH(request: NextRequest) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, []);
}

export async function DELETE(request: NextRequest) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, []);
}

export async function OPTIONS(request: NextRequest) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, []);
}
