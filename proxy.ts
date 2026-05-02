import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { normalizeSafeCallbackPath } from '@/lib/veranote/auth-redirect';

const protectedPrefixes = ['/', '/dashboard'];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => (
    prefix === '/'
      ? pathname === '/'
      : pathname.startsWith(prefix)
  ));
}

function mockAuthAllowed() {
  return process.env.NODE_ENV !== 'production'
    || process.env.VERANOTE_ALLOW_MOCK_AUTH === 'true';
}

function hasMockProviderToken(request: { cookies: { get: (name: string) => { value: string } | undefined } }) {
  if (!mockAuthAllowed()) {
    return false;
  }

  const token = request.cookies.get('veranote-auth')?.value;
  return token === 'veranote-provider-token' || token === process.env.VERANOTE_PROVIDER_TOKEN;
}

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isAuthenticated = !!request.auth || hasMockProviderToken(request);
  const isSignInPage = pathname.startsWith('/sign-in');

  if (!isAuthenticated && isProtectedPath(pathname)) {
    const signInUrl = new URL('/sign-in', request.nextUrl.origin);
    const callbackPath = normalizeSafeCallbackPath(`${pathname}${request.nextUrl.search}`);
    signInUrl.searchParams.set('callbackUrl', callbackPath);
    return NextResponse.redirect(signInUrl);
  }

  if (isAuthenticated && isSignInPage) {
    return NextResponse.redirect(new URL('/', request.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/', '/dashboard/:path*', '/sign-in'],
};
