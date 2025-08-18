// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name: string;
  username: string;
  phone?: string | null;
  birth_date?: string | null; // yyyy-mm-dd
  cpf?: string | null;
  created_at?: string;
  updated_at?: string;
};

type AuthContextType = {
  user: any;
  session: any;
  loading: boolean;
  signUp: (params: {
    email: string;
    password: string;
    full_name: string;
    username: string;
  }) => Promise<{ error: any }>;
  signIn: (params: { email: string; password: string }) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  getProfile: () => Promise<Profile | null>;
  updateOwnProfile: (data: Partial<Omit<Profile, "id">>) => Promise<{ error: any }>;
};

const AuthContext = createContext<AuthContextType>({} as any);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Garante que só vamos tocar em "profiles" quando houver sessão válida
  const ensureProfile = async (seed?: Partial<Profile>) => {
    const { data: sessData } = await supabase.auth.getSession();
    const currentSession = sessData.session;
    const currentUser = currentSession?.user;

    if (!currentUser) {
      // Sem sessão => sem auth.uid() => qualquer INSERT/UPDATE será bloqueado pela RLS
      return;
    }

    const uid = currentUser.id as string;

    // 1) Tentar obter o profile
    const { data: prof, error: selErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (selErr && selErr.code !== "PGRST116") {
      // PGRST116 = no rows
      console.error("Falha ao consultar profiles:", selErr);
      return;
    }

    if (!prof) {
      // 2) Inserir novo profile (id = auth.uid())
      const newProfile: Profile = {
        id: uid,
        full_name: (seed?.full_name?.trim() || currentUser.user_metadata?.full_name || "Usuário") as string,
        username:
          (seed?.username?.trim() ||
            currentUser.user_metadata?.username ||
            `user_${uid.slice(0, 8)}`) as string,
        phone: (seed?.phone ?? currentUser.user_metadata?.phone ?? null) as any,
        birth_date: (seed?.birth_date ?? currentUser.user_metadata?.birth_date ?? null) as any,
        cpf: (seed?.cpf ?? currentUser.user_metadata?.cpf ?? null) as any,
      };

      const { error: insErr } = await supabase.from("profiles").insert(newProfile);
      if (insErr) {
        // Se cair aqui com RLS, é porque perdemos a sessão (expirou) ou tentaram sem id = uid
        console.error("Falha ao inserir profile:", insErr);
      }
    } else {
      // 3) Opcional: atualizar campos derivados do metadata se vieram no registro
      if (seed && (seed.full_name || seed.username || seed.phone || seed.birth_date || seed.cpf)) {
        const patch: Partial<Profile> = {};
        if (seed.full_name) patch.full_name = seed.full_name;
        if (seed.username) patch.username = seed.username;
        if (seed.phone !== undefined) patch.phone = seed.phone;
        if (seed.birth_date !== undefined) patch.birth_date = seed.birth_date as any;
        if (seed.cpf !== undefined) patch.cpf = seed.cpf;

        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await supabase.from("profiles").update(patch).eq("id", uid);
          if (upErr) console.error("Falha ao atualizar profile:", upErr);
        }
      }
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

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);

      // Só garantimos profile quando realmente assinou
      if (event === "SIGNED_IN") {
        await ensureProfile(); // sem seed — no login normal criamos username padrão se precisar
      }
      if (event === "SIGNED_OUT") {
        // nada a fazer
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp: AuthContextType["signUp"] = async ({ email, password, full_name, username }) => {
    // Registro: preferimos mandar metadados junto, para reaproveitar mais tarde
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          username,
        },
      },
    });

    if (error) return { error };

    // Se o projeto **NÃO** exige confirmação de e-mail, já teremos sessão aqui
    // e podemos criar o profile imediatamente
    if (data.session?.user) {
      await ensureProfile({ full_name, username });
    }
    // Se exige confirmação, `data.session` será null.
    // Nesse caso, o profile será criado assim que o usuário fizer SIGNED_IN
    // (via onAuthStateChange no primeiro login após confirmar o e-mail).

    return { error: null };
  };

  const signIn: AuthContextType["signIn"] = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error };

    // Agora temos sessão => podemos garantir o profile
    await ensureProfile();

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

    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) {
      console.error("getProfile error:", error);
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
