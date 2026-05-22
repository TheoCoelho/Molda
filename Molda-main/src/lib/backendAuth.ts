import { apiRequest } from "@/api/backend";

export type BackendUser = {
  id: string;
  email: string;
  username?: string | null;
  role?: "admin" | "editor" | "viewer" | "factory" | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type StoredAuth = {
  accessToken: string;
  refreshToken: string;
  user: BackendUser;
  mode?: "backend" | "local";
  passwordHash?: string;
  profile?: Record<string, unknown>;
};

const STORAGE_KEY = "molda.backend.auth.v1";

let inflightRefresh: Promise<{ token: string; user: BackendUser } | null> | null = null;

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const isTokenExpired = (token: string, skewSeconds = 30) => {
  const payload = parseJwtPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp <= nowSec + skewSeconds;
};

const normalizeTokenResponse = (
  data: unknown,
  fallbackUser: BackendUser,
  fallbackRefreshToken: string,
): StoredAuth | null => {
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const accessTokenRaw = record.accessToken ?? record.access_token ?? record.token;
  const refreshTokenRaw = record.refreshToken ?? record.refresh_token;
  const userRaw = record.user;

  if (typeof accessTokenRaw !== "string" || accessTokenRaw.length === 0) return null;

  const user =
    userRaw && typeof userRaw === "object"
      ? ({
          ...fallbackUser,
          ...(userRaw as Record<string, unknown>),
        } as BackendUser)
      : fallbackUser;

  return {
    accessToken: accessTokenRaw,
    refreshToken:
      typeof refreshTokenRaw === "string" && refreshTokenRaw.length > 0
        ? refreshTokenRaw
        : fallbackRefreshToken,
    user,
  };
};

export const readStoredAuth = (): StoredAuth | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (
      !parsed ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      !parsed.user ||
      typeof parsed.user !== "object" ||
      typeof (parsed.user as BackendUser).id !== "string" ||
      typeof (parsed.user as BackendUser).email !== "string"
    ) {
      return null;
    }
    return parsed as StoredAuth;
  } catch {
    return null;
  }
};

export const writeStoredAuth = (auth: StoredAuth) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
};

export const clearStoredAuth = () => {
  localStorage.removeItem(STORAGE_KEY);
};

const refreshAccessToken = async (): Promise<{ token: string; user: BackendUser } | null> => {
  const stored = readStoredAuth();
  if (!stored?.refreshToken) {
    clearStoredAuth();
    return null;
  }

  if (stored.mode === "local") {
    return null;
  }

  try {
    const response = await apiRequest<unknown>("/auth/refresh", {
      method: "POST",
      body: { refreshToken: stored.refreshToken },
    });

    const normalized = normalizeTokenResponse(response, stored.user, stored.refreshToken);
    if (!normalized) {
      clearStoredAuth();
      return null;
    }

    writeStoredAuth(normalized);

    return {
      token: normalized.accessToken,
      user: normalized.user,
    };
  } catch {
    clearStoredAuth();
    return null;
  }
};

export const ensureBackendAccessToken = async (): Promise<{ token: string; user: BackendUser } | null> => {
  const stored = readStoredAuth();
  if (!stored) return null;

  if (stored.accessToken && !isTokenExpired(stored.accessToken)) {
    return {
      token: stored.accessToken,
      user: stored.user,
    };
  }

  if (!inflightRefresh) {
    inflightRefresh = refreshAccessToken().finally(() => {
      inflightRefresh = null;
    });
  }

  return inflightRefresh;
};
