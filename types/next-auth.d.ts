import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      providerAccountId: string;
      providerIdentityId: string;
      organizationName: string;
      roleLabel: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    providerAccountId: string;
    providerIdentityId: string;
    organizationName: string;
    roleLabel: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    providerAccountId?: string;
    providerIdentityId?: string;
    organizationName?: string;
    roleLabel?: string;
  }
}
