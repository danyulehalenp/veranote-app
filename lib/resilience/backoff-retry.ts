export async function withBackoffRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    const delay = Math.pow(2, 3 - retries) * 100;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return withBackoffRetry(fn, retries - 1);
  }
}
