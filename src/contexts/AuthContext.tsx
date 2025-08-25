import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  nickname: string; // renomeado de nickname
  username: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null; // yyyy-mm-dd
  cpf?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  avatar_path?: string | null;
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

// Persistência de seed entre registro -> confirmação de e-mail -> primeiro login
const SEED_KEY = "cc_register_seed";

function saveSeed(seed: Partial<Profile>) {
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(seed));
  } catch {}
}
function readSeed(): Partial<Profile> | null {
  try {
    const raw = localStorage.getItem(SEED_KEY);
    return raw ? (JSON.parse(raw) as Partial<Profile>) : null;
  } catch {
    return null;
  }
}
function clearSeed() {
  try {
    localStorage.removeItem(SEED_KEY);
  } catch {}
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const ensureProfile = async (seed?: Partial<Profile>) => {
    const { data: sessData } = await supabase.auth.getSession();
    const currentUser = sessData.session?.user;
    if (!currentUser) return;

    const uid = currentUser.id as string;

    // 1) Já existe?
    const { data: prof, error: selErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (selErr && selErr.code !== "PGRST116") {
      console.error("Falha ao consultar profiles:", selErr);
      return;
    }
    if (prof) return; // nada a fazer

    // 2) Montar dados a partir de seed / metadados
    const lsSeed = readSeed() || undefined;

    const fromSeed = {
      nickname: seed?.nickname?.trim() ?? lsSeed?.nickname?.trim(),
      username: seed?.username?.trim() ?? lsSeed?.username?.trim(),
      email: seed?.email ?? lsSeed?.email ?? currentUser.email ?? null,
      phone: seed?.phone?.toString().trim() ?? lsSeed?.phone?.toString().trim(),
      birth_date: seed?.birth_date?.toString().trim() ?? lsSeed?.birth_date?.toString().trim(),
      cpf: seed?.cpf?.toString().trim() ?? lsSeed?.cpf?.toString().trim(),
    };

    const fromMeta = {
      nickname: currentUser.user_metadata?.nickname,
      username: currentUser.user_metadata?.username,
      phone: currentUser.user_metadata?.phone,
      birth_date: currentUser.user_metadata?.birth_date,
      cpf: currentUser.user_metadata?.cpf,
    };

    const setNickname = fromSeed.nickname || fromMeta.nickname || "Usuário";
    const baseUsername = fromSeed.username || fromMeta.username || `user_${uid.slice(0, 8)}`;
    const safeEmail = fromSeed.email;
    const safePhone = fromSeed.phone || fromMeta.phone;
    const safeBirthDate = fromSeed.birth_date || fromMeta.birth_date;
    const safeCpf = fromSeed.cpf || fromMeta.cpf;

    if (!safePhone || !safeBirthDate || !safeCpf) {
      console.error("Campos obrigatórios ausentes para criar profile");
      return;
    }

    const newProfile: Profile = {
      id: uid,
      nickname: setNickname,
      username: baseUsername,
      email: safeEmail ?? null,
      phone: safePhone,
      birth_date: safeBirthDate,
      cpf: safeCpf,
      avatar_path: null, // 👈 começa vazio
    };

    let insErr = (await supabase.from("profiles").insert(newProfile)).error;
    if (insErr && String(insErr.code) === "23505") {
      const fallback = `${baseUsername}_${uid.slice(0, 6)}`;
      const { error: retryErr } = await supabase
        .from("profiles")
        .insert({ ...newProfile, username: fallback });
      insErr = retryErr || null;
    }

    if (insErr) {
      console.error("Falha ao inserir profile:", insErr);
    } else {
      clearSeed();
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (event === "SIGNED_IN") {
        ensureProfile().catch(console.error);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
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
    saveSeed({ email, nickname, username, phone, birth_date, cpf });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nickname, username, phone, birth_date, cpf },
      },
    });

    if (error) return { error };
    if (data.session?.user) {
      ensureProfile({ email, nickname, username, phone, birth_date, cpf }).catch(console.error);
    }
    return { error: null };
  };

  const signIn: AuthContextType["signIn"] = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    ensureProfile().catch(console.error);
    return { error: null };
  };

  const signOut: AuthContextType["signOut"] = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const getProfile = async (): Promise<Profile | null> => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.error("Falha ao obter profile:", error);
      return null;
    }
    return (data as Profile) ?? null;
  };

  const updateOwnProfile: AuthContextType["updateOwnProfile"] = async (payload) => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return { error: new Error("Sem sessão") };
    const { error } = await supabase.from("profiles").update(payload).eq("id", uid);
    return { error };
  };

  const value = useMemo<AuthContextType>(
    () => ({ user, session, loading, signUp, signIn, signOut, getProfile, updateOwnProfile }),
    [user, session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
