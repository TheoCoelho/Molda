export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const DEFAULT_BACKEND_URL = "http://localhost:3000";

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getBackendBaseUrl = () => {
  const fromEnv = import.meta.env.VITE_BACKEND_URL?.trim();
  if (!fromEnv) return DEFAULT_BACKEND_URL;
  return stripTrailingSlash(fromEnv);
};

const buildUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
};

const isNetworkFailure = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  return /fetch|network|failed to fetch|connection/i.test(error.message);
};

const tryParseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;

  if (typeof payload === "object") {
    const asRecord = payload as Record<string, unknown>;
    const message = asRecord.message;

    if (Array.isArray(message)) {
      return message.map((item) => String(item)).join("; ");
    }

    if (typeof message === "string" && message.trim().length) {
      return message;
    }

    if (typeof asRecord.error === "string" && asRecord.error.trim().length) {
      return asRecord.error;
    }
  }

  return fallback;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", token, body, headers = {}, signal } = options;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    if (!finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      method,
      headers: finalHeaders,
      body: payload,
      signal,
    });
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new ApiError(`Servidor indisponivel em ${getBackendBaseUrl()}`, 0, error);
    }

    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const parsed = await tryParseJson(response);

  if (!response.ok) {
    const fallback = `Erro HTTP ${response.status}`;
    const message = extractErrorMessage(parsed, fallback);
    throw new ApiError(message, response.status, parsed);
  }

  return parsed as T;
}
