/**
 * Utility functions for backend services.
 */

/**
 * Executes a promise-returning function with a timeout and retry logic using exponential backoff.
 * 
 * @param fn The asynchronous function to execute.
 * @param retries Maximum number of retry attempts.
 * @param baseDelayMs Initial delay before retrying, in milliseconds.
 * @param timeoutMs Timeout limit for the function execution, in milliseconds.
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 1000,
  timeoutMs = 15000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    // Create a timeout promise
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Request timed out"));
      }, timeoutMs);
    });

    try {
      // Race the actual function with the timeout
      const result = await Promise.race([
        fn().then((res) => {
          if (timeoutId) clearTimeout(timeoutId);
          return res;
        }),
        timeoutPromise,
      ]);
      return result;
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      
      // If we've reached the max retries, throw the final error
      if (attempt === retries) {
        console.error(`Execution failed after ${retries} attempts:`, err);
        throw err;
      }

      // Detect rate-limit / quota exhaustion errors and use extended backoff
      const errorMsg = (err.message || err.toString()).toLowerCase();
      const isRateLimit = 
        errorMsg.includes("429") ||
        errorMsg.includes("resource_exhausted") ||
        errorMsg.includes("quota") ||
        errorMsg.includes("rate limit") ||
        errorMsg.includes("too many requests") ||
        err.status === 429;

      if (isRateLimit) {
        const rateLimitDelay = 20000; // 20 seconds — allows RPM window to partially reset
        console.warn(`[RateLimit] Gemini quota exceeded on attempt ${attempt}/${retries}. Backing off for ${rateLimitDelay / 1000}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
      } else {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`Attempt ${attempt} failed: ${err.message || err}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error("Execution failed after maximum retries");
}
