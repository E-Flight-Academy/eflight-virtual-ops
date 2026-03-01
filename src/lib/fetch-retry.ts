/**
 * Fetch with exponential backoff retry for non-streaming API calls.
 * Only retries on network errors and 5xx responses, not on 4xx.
 */
export async function fetchRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  { retries = 2, baseDelay = 500 }: { retries?: number; baseDelay?: number } = {}
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      // Don't retry client errors (4xx), only server errors (5xx)
      if (res.ok || res.status < 500) return res;
      if (attempt < retries) {
        await delay(baseDelay * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await delay(baseDelay * 2 ** attempt);
        continue;
      }
    }
  }

  throw lastError ?? new Error("fetchRetry failed");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
