export type User = {
  id: string;
  role: 'provider' | 'admin';
  email: string;
};

export type AuthContext = {
  user: User | null;
  isAuthenticated: boolean;
};

export type AuthenticatedRequestContext = AuthContext & {
  user: User;
  providerAccountId?: string;
  providerIdentityId?: string;
  tokenSource: 'session' | 'header' | 'cookie';
};
