// middleware.ts
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const protectedPaths = [
    '/dashboard',
    '/dashboard/',
    '/dashboard/:path*',
    '/settings',
    '/settings/:path*',
    '/api/user/:path*',
    // Dashboard-only API routes (defense in depth; route handlers also enforce session)
    '/api/claude-md',
  ];

  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPaths.some((path) =>
    new RegExp(`^${path.replace(/:\w+\*/g, '.*')}$`).test(pathname)
  );

  try {
    // Get the token with proper configuration
    const tokenParams: { req: NextRequest; secret?: string } = { req: request };
    if (process.env.NEXTAUTH_SECRET) {
      tokenParams.secret = process.env.NEXTAUTH_SECRET;
    }

    const token = await getToken(tokenParams);

    const isAuthenticated = !!token;

    if (isProtected && !isAuthenticated) {
      console.log('[MIDDLEWARE] Redirecting to signin from:', pathname);
      const signInUrl = new URL('/signin', request.url);
      return NextResponse.redirect(signInUrl);
    }

    // If user is authenticated and trying to access signin page, redirect to dashboard
    if (isAuthenticated && pathname === '/signin') {
      console.log('[MIDDLEWARE] Authenticated user accessing signin, redirecting to dashboard');
      const dashboardUrl = new URL('/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }

    return NextResponse.next();
  } catch (error) {
    console.error('[MIDDLEWARE] Error:', error);
    // Fail closed for protected paths to avoid accidental auth bypass.
    if (isProtected) {
      const signInUrl = new URL('/signin', request.url);
      return NextResponse.redirect(signInUrl);
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next|favicon.ico).*)', // exclude auth and public paths, but include signin
  ],
};
