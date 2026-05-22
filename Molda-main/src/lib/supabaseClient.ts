// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type AnyEnv = Record<string, any>;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);
const REQUEST_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;
const TIMEOUT_ABORT_REASON = "supabase-fetch-timeout";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown) {
  const err = error as any;
  return err?.name === "AbortError" || String(err?.code ?? "") === "20";
}

function isTimeoutAbort(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return message.includes(TIMEOUT_ABORT_REASON) || message.includes("timeout");
}

function shouldRetry(error: unknown, response?: Response | null) {
  if (response) {
    return RETRYABLE_STATUS_CODES.has(response.status);
  }

  if (isTimeoutAbort(error)) {
    return true;
  }

  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("timeout") ||
    message.includes("authretryablefetcherror") ||
    message.includes("522")
  );
}

function withTimeoutSignal(existingSignal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") {
    return { signal: existingSignal, didTimeout: () => false, cleanup: () => {} };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(TIMEOUT_ABORT_REASON, "AbortError"));
  }, timeoutMs);

  const onAbort = () => controller.abort(existingSignal?.reason);
  if (existingSignal) {
    if (existingSignal.aborted) {
      controller.abort(existingSignal.reason);
    } else {
      existingSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      if (existingSignal) {
        existingSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let attempt = 0;
  let lastError: unknown;
  const callerSignal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);

  while (attempt <= MAX_RETRIES) {
    if (callerSignal?.aborted) {
      throw new DOMException("Request aborted by caller", "AbortError");
    }

    const { signal, didTimeout, cleanup } = withTimeoutSignal(callerSignal);

    const requestInput =
      attempt > 0 && typeof Request !== "undefined" && input instanceof Request
        ? input.clone()
        : input;

    try {
      const response = await fetch(requestInput, { ...init, signal });
      cleanup();

      if (!shouldRetry(undefined, response) || attempt === MAX_RETRIES) {
        return response;
      }
    } catch (error) {
      cleanup();
      lastError = error;

      if (isAbortError(error) && !didTimeout()) {
        throw error;
      }

      if (!shouldRetry(error) || attempt === MAX_RETRIES) {
        throw error;
      }
    }

    attempt += 1;
    await delay(300 * attempt);
  }

  throw lastError instanceof Error ? lastError : new Error("Supabase request failed");
}

function readEnv() {
  const im: AnyEnv = (typeof import.meta !== "undefined" && (import.meta as any).env) || {};
  const pe: AnyEnv = (typeof process !== "undefined" && (process as any).env) || {};
  const gt: AnyEnv = (typeof globalThis !== "undefined" ? (globalThis as any) : {}) || {};

  const url =
    im.VITE_SUPABASE_URL ||
    pe.NEXT_PUBLIC_SUPABASE_URL ||
    pe.VITE_SUPABASE_URL ||
    gt.VITE_SUPABASE_URL ||
    "";

  const key =
    im.VITE_SUPABASE_ANON_KEY ||
    pe.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    pe.VITE_SUPABASE_ANON_KEY ||
    gt.VITE_SUPABASE_ANON_KEY ||
    "";

  return { url, key };
}

const GLOBAL_KEY = "__molda_supabase_client__";
const GLOBAL_PUBLIC_KEY = "__molda_supabase_public_client__";

let _client: SupabaseClient | null = null;
let _publicClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  const globalClient = typeof globalThis !== "undefined" ? ((globalThis as any)[GLOBAL_KEY] as SupabaseClient | undefined) : undefined;
  if (globalClient) {
    _client = globalClient;
    return _client;
  }

  const { url, key } = readEnv();
  if (!url || !key) {
    console.warn(
      "[supabaseClient] Variáveis do Supabase ausentes. " +
        "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_* em Next.js) " +
        "no .env da *raiz do app frontend* e reinicie o dev server."
    );
    return null;
  }

  _client = createClient(url, key, {
    global: {
      fetch: resilientFetch,
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  if (typeof globalThis !== "undefined") {
    (globalThis as any)[GLOBAL_KEY] = _client;
  }

  return _client;
}

export function getPublicSupabase(): SupabaseClient | null {
  if (_publicClient) return _publicClient;

  const globalClient =
    typeof globalThis !== "undefined"
      ? ((globalThis as any)[GLOBAL_PUBLIC_KEY] as SupabaseClient | undefined)
      : undefined;
  if (globalClient) {
    _publicClient = globalClient;
    return _publicClient;
  }

  const { url, key } = readEnv();
  if (!url || !key) {
    return null;
  }

  _publicClient = createClient(url, key, {
    global: {
      fetch: resilientFetch,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  if (typeof globalThis !== "undefined") {
    (globalThis as any)[GLOBAL_PUBLIC_KEY] = _publicClient;
  }

  return _publicClient;
}

export const STORAGE_BUCKET = "user-uploads";
