import type { SupabaseClient } from "@supabase/supabase-js";

const authRetryDelaysMs = [300, 900];
const transientErrorCodes = new Set([
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isTransientErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("connection reset")
  );
}

function isTransientAuthFailure(error: unknown) {
  let currentError = error;

  for (let depth = 0; depth < 5 && currentError; depth += 1) {
    if (
      currentError instanceof Error &&
      isTransientErrorMessage(currentError.message)
    ) {
      return true;
    }

    if (typeof currentError !== "object") {
      break;
    }

    const errorRecord = currentError as {
      cause?: unknown;
      code?: unknown;
      message?: unknown;
    };

    if (
      typeof errorRecord.code === "string" &&
      transientErrorCodes.has(errorRecord.code.toUpperCase())
    ) {
      return true;
    }

    if (
      typeof errorRecord.message === "string" &&
      isTransientErrorMessage(errorRecord.message)
    ) {
      return true;
    }

    currentError = errorRecord.cause;
  }

  return false;
}

function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function getSupabaseUserWithRetry(supabase: SupabaseClient) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await supabase.auth.getUser();
      const retryDelay = authRetryDelaysMs[attempt];

      if (
        !response.error ||
        retryDelay === undefined ||
        !isTransientAuthFailure(response.error)
      ) {
        return response;
      }

      await waitForRetry(retryDelay);
    } catch (error) {
      const retryDelay = authRetryDelaysMs[attempt];

      if (retryDelay === undefined || !isTransientAuthFailure(error)) {
        throw error;
      }

      await waitForRetry(retryDelay);
    }
  }
}
