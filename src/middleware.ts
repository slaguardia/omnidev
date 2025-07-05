// middleware.ts
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  try {
    // Get the token with proper configuration
    const tokenParams: { req: NextRequest; secret?: string } = { req: request };
    if (process.env.NEXTAUTH_SECRET) {
      tokenParams.secret = process.env.NEXTAUTH_SECRET;
    }
    
    const token = await getToken(tokenParams);
    
    const isAuthenticated = !!token;
    const pathname = request.nextUrl.pathname;

    // Add debug logging to track authentication state
    console.log('[MIDDLEWARE] Processing:', pathname);
    console.log('[MIDDLEWARE] Token present:', !!token);
    console.log('[MIDDLEWARE] Is authenticated:', isAuthenticated);
    
    // Debug cookies to see what's being sent
    const cookies = request.cookies.getAll();
    const authCookies = cookies.filter(cookie => 
      cookie.name.includes('next-auth') || cookie.name.includes('session')
    );
    console.log('[MIDDLEWARE] Auth-related cookies:', authCookies.map(c => ({ name: c.name, hasValue: !!c.value })));
    
    if (token) {
      console.log('[MIDDLEWARE] Token details:', { id: token.id, name: token.name });
    }

    const protectedPaths = [
      // '/dashboard',
      // '/dashboard/',
      // '/dashboard/:path*',
      '/settings',
      '/settings/:path*',
      '/api/user/:path*',
    ];

    const isProtected = protectedPaths.some((path) =>
      new RegExp(`^${path.replace(/:\w+\*/g, '.*')}$`).test(pathname)
    );

    console.log('[MIDDLEWARE] Is protected path:', isProtected);

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

    console.log('[MIDDLEWARE] Allowing request to proceed to:', pathname);
    return NextResponse.next();
  } catch (error) {
    console.error('[MIDDLEWARE] Error:', error);
    // On error, allow the request to continue to avoid blocking the app
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next|favicon.ico).*)', // exclude auth and public paths, but include signin
  ],
};
