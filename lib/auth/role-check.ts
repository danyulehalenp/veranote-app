import type { User } from '@/lib/auth/auth-types';

export function requireRole(user: User | null | undefined, role: User['role']) {
  if (!user || user.role !== role) {
    throw new Error(`Forbidden: requires ${role} role.`);
  }

  return true;
}
