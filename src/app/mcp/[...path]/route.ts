import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isMcpProxyEnabled, proxyToMcp } from '../proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ path?: string[] }>;
};

async function getPathSegments(ctx: RouteParams): Promise<string[]> {
  const params = await ctx.params;
  return Array.isArray(params.path) ? params.path : [];
}

export async function GET(request: NextRequest, ctx: RouteParams) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, await getPathSegments(ctx));
}

export async function POST(request: NextRequest, ctx: RouteParams) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, await getPathSegments(ctx));
}

export async function PUT(request: NextRequest, ctx: RouteParams) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, await getPathSegments(ctx));
}

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, await getPathSegments(ctx));
}

export async function DELETE(request: NextRequest, ctx: RouteParams) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, await getPathSegments(ctx));
}

export async function OPTIONS(request: NextRequest, ctx: RouteParams) {
  if (!isMcpProxyEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return proxyToMcp(request, await getPathSegments(ctx));
}
