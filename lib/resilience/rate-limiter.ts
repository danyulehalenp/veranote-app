import { checkDistributedRateLimit } from '@/lib/resilience/distributed-rate-limiter';

const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const LIMIT = 60;

export async function checkRateLimit(userId: string) {
  let usedDistributed = false;

  try {
    usedDistributed = await checkDistributedRateLimit(userId);
  } catch (error) {
    if (error instanceof Error && error.message === 'Rate limit exceeded') {
      throw error;
    }
  }

  if (!usedDistributed) {
    const now = Date.now();
    const userRequests = requests.get(userId) || [];
    const recentRequests = userRequests.filter((timestamp) => now - timestamp < WINDOW_MS);

    if (recentRequests.length >= LIMIT) {
      throw new Error('Rate limit exceeded');
    }

    requests.set(userId, [...recentRequests, now]);
  }
}
