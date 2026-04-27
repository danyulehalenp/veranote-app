import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { headers } from 'next/headers';
import { z } from 'zod';
import { authenticateProviderCredentials } from '@/lib/veranote/provider-auth';
import { normalizeSafeCallbackPath } from '@/lib/veranote/auth-redirect';
import { getRuntimeAuthBaseUrl } from '@/lib/veranote/domain-config';
import { assertSafeBetaRuntimeConfig } from '@/lib/veranote/runtime-config';

assertSafeBetaRuntimeConfig();

const credentialsSchema = z.object({
  email: z.string().email(),
  accessCode: z.string().min(1),
});

const authSecret = process.env.AUTH_SECRET
  || process.env.NEXTAUTH_SECRET
  || (process.env.NODE_ENV === 'production' ? undefined : 'veranote-beta-dev-secret');

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authSecret,
  trustHost: true,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/sign-in',
  },
  providers: [
    Credentials({
      name: 'Veranote Beta Access',
      credentials: {
        email: { label: 'Email', type: 'email' },
        accessCode: { label: 'Access code', type: 'password' },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        return authenticateProviderCredentials(parsed.data.email, parsed.data.accessCode);
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      const runtimeBaseUrl = getRuntimeAuthBaseUrl({
        baseUrl,
        headersLike: await headers(),
      });

      if (url.startsWith(runtimeBaseUrl)) {
        const relativeUrl = url.slice(runtimeBaseUrl.length) || '/';
        return `${runtimeBaseUrl}${normalizeSafeCallbackPath(relativeUrl)}`;
      }

      if (url.startsWith(baseUrl)) {
        const relativeUrl = url.slice(baseUrl.length) || '/';
        return `${runtimeBaseUrl}${normalizeSafeCallbackPath(relativeUrl)}`;
      }

      return `${runtimeBaseUrl}${normalizeSafeCallbackPath(url)}`;
    },
    async jwt({ token, user }) {
      if (user) {
        token.providerAccountId = user.providerAccountId;
        token.providerIdentityId = user.providerIdentityId;
        token.organizationName = user.organizationName;
        token.roleLabel = user.roleLabel;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || session.user.id;
        session.user.providerAccountId = typeof token.providerAccountId === 'string' ? token.providerAccountId : '';
        session.user.providerIdentityId = typeof token.providerIdentityId === 'string' ? token.providerIdentityId : '';
        session.user.organizationName = typeof token.organizationName === 'string' ? token.organizationName : '';
        session.user.roleLabel = typeof token.roleLabel === 'string' ? token.roleLabel : '';
      }

      return session;
    },
  },
});
