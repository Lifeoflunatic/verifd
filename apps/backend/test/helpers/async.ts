/**
 * Utility to flush microtasks and ensure async operations complete
 */
export async function tick(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to become true
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 1000,
  interval: number = 10
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await tick(interval);
  }
}