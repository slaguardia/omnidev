import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function stripHopByHopHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    out.set(key, value);
  });
  return out;
}

function getMcpInternalBaseUrl(): string {
  // This is intentionally internal-only: the app proxies /mcp/* to this URL.
  // In Coolify you expose ONLY port 3000 and keep MCP private.
  return process.env.MCP_INTERNAL_URL ?? 'http://127.0.0.1:8931';
}

export function isMcpProxyEnabled(): boolean {
  // Default off: we keep the code for a future self-hosted MCP option,
  // but we don't want to expose a working proxy route by default.
  return process.env.MCP_PROXY_ENABLED === 'true';
}

function joinPath(basePath: string, segments: string[]): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (segments.length === 0) return base || '/';
  const suffix = segments.map((s) => encodeURIComponent(s)).join('/');
  return `${base || ''}/${suffix}`;
}

export async function proxyToMcp(request: NextRequest, pathSegments: string[]): Promise<Response> {
  try {
    if (!isMcpProxyEnabled()) {
      // 404 to avoid advertising this endpoint when it's disabled.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const sourceUrl = new URL(request.url);
    const upstreamBase = new URL(getMcpInternalBaseUrl());

    const upstreamUrl = new URL(upstreamBase.toString());
    upstreamUrl.pathname = joinPath(upstreamBase.pathname, pathSegments);
    upstreamUrl.search = sourceUrl.search;

    const requestHeaders = stripHopByHopHeaders(request.headers);
    requestHeaders.delete('host');

    const method = request.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';

    const upstreamRequestInit: RequestInit = {
      method,
      headers: requestHeaders,
      redirect: 'manual',
    };

    if (hasBody) {
      // Avoid Node/undici duplex stream edge cases: MCP payloads are small JSON.
      upstreamRequestInit.body = await request.arrayBuffer();
    }

    const upstreamResponse = await fetch(upstreamUrl, upstreamRequestInit);

    const responseHeaders = stripHopByHopHeaders(upstreamResponse.headers);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[MCP PROXY] Failed to proxy request:', error);
    return NextResponse.json(
      {
        error: 'Bad gateway',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
