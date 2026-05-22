import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import bcrypt from "bcryptjs";
import { apiRequest, ApiError } from "@/api/backend";
import {
  clearStoredAuth,
  ensureBackendAccessToken,
  readStoredAuth,
  type BackendUser,
  writeStoredAuth,
} from "@/lib/backendAuth";

export type Profile = {
  id: string;
  nickname: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  cpf?: string | null;
  role?: "admin" | "editor" | "viewer" | "factory" | null;
  created_at?: string | null;
  updated_at?: string | null;
  avatar_path?: string | null;
  bio?: string | null;
  is_public?: boolean;
};


type SignUpParams = {
  email: string;
  password: string;
  nickname: string;
  username: string;
  phone: string;
  birth_date: string; // yyyy-mm-dd
  cpf: string;
};

type AuthContextType = {
  user: any;
  session: any;
  loading: boolean;
  signUp: (params: SignUpParams) => Promise<{ error: any }>;
  signIn: (params: { email: string; password: string }) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  getProfile: () => Promise<Profile | null>;
  updateOwnProfile: (data: Partial<Omit<Profile, "id">>) => Promise<{ error: any }>;
};

const AuthContext = createContext<AuthContextType>({} as any);

const toLegacyUser = (user: BackendUser, profile?: Profile | null) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  created_at: user.createdAt,
  updated_at: user.updatedAt,
  user_metadata: {
    full_name: profile?.nickname || user.username || user.email,
    username: profile?.username || user.username || null,
    avatar_url: profile?.avatar_path || null,
  },
});

const createLocalProfile = (input: {
  id: string;
  nickname: string;
  username: string;
  email: string;
  phone: string;
  birth_date: string;
  cpf: string;
}): Profile => ({
  id: input.id,
  nickname: input.nickname,
  username: input.username,
  email: input.email,
  phone: input.phone,
  birth_date: input.birth_date,
  cpf: input.cpf,
  role: "viewer",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  avatar_path: null,
  bio: null,
  is_public: false,
});

const createLocalAuthRecord = async (params: SignUpParams) => {
  const id = globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`;
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(params.password, 10);
  const user: BackendUser = {
    id,
    email: params.email,
    username: params.username,
    role: "viewer",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const profile = createLocalProfile({
    id,
    nickname: params.nickname,
    username: params.username,
    email: params.email,
    phone: params.phone,
    birth_date: params.birth_date,
    cpf: params.cpf,
  });

  return {
    accessToken: `local-access-${id}`,
    refreshToken: `local-refresh-${id}`,
    passwordHash,
    user,
    profile,
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const fetchOwnProfile = async (): Promise<Profile | null> => {
    const stored = readStoredAuth();
    if (stored?.mode === "local") {
      const nextProfile = (stored.profile as Profile | undefined) || {
        id: stored.user.id,
        nickname: stored.user.username || stored.user.email,
        username: stored.user.username || stored.user.email,
        email: stored.user.email,
        phone: null,
        birth_date: null,
        cpf: null,
        role: stored.user.role ?? "viewer",
        created_at: stored.user.createdAt ?? null,
        updated_at: stored.user.updatedAt ?? null,
        avatar_path: null,
        bio: null,
        is_public: false,
      };
      setProfile(nextProfile);
      return nextProfile;
    }

    const auth = await ensureBackendAccessToken();
    if (!auth?.token) return null;

    try {
      const me = await apiRequest<Profile>("/profiles/me", {
        token: auth.token,
      });
      setProfile(me);
      return me;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearStoredAuth();
      }
      return null;
    }
  };

  useEffect(() => {
    const stored = readStoredAuth();
    if (!stored) {
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    if (stored.mode === "local") {
      const nextProfile = (stored.profile as Profile | undefined) || {
        id: stored.user.id,
        nickname: stored.user.username || stored.user.email,
        username: stored.user.username || stored.user.email,
        email: stored.user.email,
        phone: null,
        birth_date: null,
        cpf: null,
        role: stored.user.role ?? "viewer",
        created_at: stored.user.createdAt ?? null,
        updated_at: stored.user.updatedAt ?? null,
        avatar_path: null,
        bio: null,
        is_public: false,
      };

      setSession({
        access_token: stored.accessToken,
        refresh_token: stored.refreshToken,
      });
      setUser(toLegacyUser(stored.user, nextProfile));
      setProfile(nextProfile);
      setLoading(false);
      return;
    }

    const sync = async () => {
      const auth = await ensureBackendAccessToken();
      if (!auth?.token) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const nextProfile = await fetchOwnProfile();
      const latestStored = readStoredAuth();
      if (!latestStored) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession({
        access_token: latestStored.accessToken,
        refresh_token: latestStored.refreshToken,
      });
      setUser(toLegacyUser(latestStored.user, nextProfile));
      setLoading(false);
    };

    void sync();
  }, []);

  const signUp: AuthContextType["signUp"] = async ({
    email,
    password,
    nickname,
    username,
    phone,
    birth_date,
    cpf,
  }) => {
    try {
      const response = await apiRequest<{
        user: BackendUser;
        accessToken: string;
        refreshToken: string;
      }>("/auth/sign-up", {
        method: "POST",
        body: {
          email,
          password,
          nickname,
          username,
          phone,
          birth_date,
          cpf,
        },
      });

      writeStoredAuth({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
        mode: "backend",
      });

      const nextProfile = await fetchOwnProfile();
      setSession({ access_token: response.accessToken, refresh_token: response.refreshToken });
      setUser(toLegacyUser(response.user, nextProfile));

      return { error: null };
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 0) {
        try {
          const localAuth = await createLocalAuthRecord({
            email,
            password,
            nickname,
            username,
            phone,
            birth_date,
            cpf,
          });

          writeStoredAuth({
            accessToken: localAuth.accessToken,
            refreshToken: localAuth.refreshToken,
            user: localAuth.user,
            mode: "local",
            passwordHash: localAuth.passwordHash,
            profile: localAuth.profile,
          });

          setSession({
            access_token: localAuth.accessToken,
            refresh_token: localAuth.refreshToken,
          });
          setUser(toLegacyUser(localAuth.user, localAuth.profile));
          setProfile(localAuth.profile);

          return { error: null };
        } catch (localError: any) {
          return { error: localError };
        }
      }

      return { error };
    }
  };

  const signIn: AuthContextType["signIn"] = async ({ email, password }) => {
    try {
      const response = await apiRequest<{
        user: BackendUser;
        accessToken: string;
        refreshToken: string;
      }>("/auth/sign-in", {
        method: "POST",
        body: {
          email,
          password,
        },
      });

      writeStoredAuth({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
        mode: "backend",
      });

      const nextProfile = await fetchOwnProfile();
      setSession({ access_token: response.accessToken, refresh_token: response.refreshToken });
      setUser(toLegacyUser(response.user, nextProfile));

      return { error: null };
    } catch (error: any) {
      const stored = readStoredAuth();
      if (stored?.mode === "local") {
        const passwordHash = stored.passwordHash;
        if (
          stored.user.email.toLowerCase() === email.toLowerCase() &&
          typeof passwordHash === "string" &&
          bcrypt.compareSync(password, passwordHash)
        ) {
          const nextProfile = (stored.profile as Profile | undefined) || {
            id: stored.user.id,
            nickname: stored.user.username || stored.user.email,
            username: stored.user.username || stored.user.email,
            email: stored.user.email,
            phone: null,
            birth_date: null,
            cpf: null,
            role: stored.user.role ?? "viewer",
            created_at: stored.user.createdAt ?? null,
            updated_at: stored.user.updatedAt ?? null,
            avatar_path: null,
            bio: null,
            is_public: false,
          };

          setSession({
            access_token: stored.accessToken,
            refresh_token: stored.refreshToken,
          });
          setUser(toLegacyUser(stored.user, nextProfile));
          setProfile(nextProfile);

          return { error: null };
        }

        return { error: new Error("Credenciais invalidas.") };
      }

      return { error };
    }
  };

  const signOut: AuthContextType["signOut"] = async () => {
    try {
      const stored = readStoredAuth();
      if (stored && stored.mode !== "local") {
        await apiRequest("/auth/sign-out", {
          method: "POST",
          token: stored.accessToken,
          body: {
            refreshToken: stored.refreshToken,
          },
        });
      }
      clearStoredAuth();
      setSession(null);
      setUser(null);
      setProfile(null);
      return { error: null };
    } catch (error: any) {
      clearStoredAuth();
      setSession(null);
      setUser(null);
      setProfile(null);
      return { error };
    }
  };

  const getProfile = async (): Promise<Profile | null> => {
    if (profile) return profile;
    return fetchOwnProfile();
  };

  const updateOwnProfile: AuthContextType["updateOwnProfile"] = async (payload) => {
    try {
      const stored = readStoredAuth();
      if (stored?.mode === "local") {
        const nextProfile: Profile = {
          id: stored.user.id,
          nickname: String((payload as Partial<Profile>).nickname ?? stored.profile?.nickname ?? stored.user.username ?? stored.user.email),
          username: String((payload as Partial<Profile>).username ?? stored.profile?.username ?? stored.user.username ?? stored.user.email),
          email: stored.user.email,
          phone: (payload as Partial<Profile>).phone ?? (stored.profile?.phone as string | null | undefined) ?? null,
          birth_date: (payload as Partial<Profile>).birth_date ?? (stored.profile?.birth_date as string | null | undefined) ?? null,
          cpf: (payload as Partial<Profile>).cpf ?? (stored.profile?.cpf as string | null | undefined) ?? null,
          role: (payload as Partial<Profile>).role ?? (stored.profile?.role as Profile["role"]) ?? stored.user.role ?? "viewer",
          created_at: (stored.profile?.created_at as string | null | undefined) ?? stored.user.createdAt ?? null,
          updated_at: new Date().toISOString(),
          avatar_path: (payload as Partial<Profile>).avatar_path ?? (stored.profile?.avatar_path as string | null | undefined) ?? null,
          bio: (payload as Partial<Profile>).bio ?? (stored.profile?.bio as string | null | undefined) ?? null,
          is_public: (payload as Partial<Profile>).is_public ?? Boolean(stored.profile?.is_public),
        };

        writeStoredAuth({
          ...stored,
          profile: nextProfile,
        });
        setProfile(nextProfile);
        setUser(toLegacyUser(stored.user, nextProfile));
        return { error: null };
      }

      const auth = await ensureBackendAccessToken();
      if (!auth?.token) {
        return { error: new Error("Sem sessão") };
      }

      const updated = await apiRequest<Profile>("/profiles/me", {
        method: "PATCH",
        token: auth.token,
        body: payload,
      });

      setProfile(updated);
      const latestStored = readStoredAuth();
      if (latestStored) {
        setUser(toLegacyUser(latestStored.user, updated));
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({ user, session, loading, signUp, signIn, signOut, getProfile, updateOwnProfile }),
    [user, session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
