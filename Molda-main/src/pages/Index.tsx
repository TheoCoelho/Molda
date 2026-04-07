import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import SocialFeed from "../components/SocialFeed";
import { Input } from "../components/ui/input";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  username: string | null;
  nickname: string | null;
};

type Suggestion = {
  id: string;
  username: string;
  nickname: string;
  score: number;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^@+/, "");
}

function getSearchScore(username: string, nickname: string, search: string) {
  if (!search) return 0;
  if (username === search) return 1000;
  if (username.startsWith(search)) return 900;
  if (username.includes(search)) return 700;
  if (nickname.includes(search)) return 500;
  return 0;
}

export default function Index() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query]);

  const normalizedSearch = useMemo(() => normalizeText(debouncedQuery), [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;

    const fetchSuggestions = async () => {
      if (normalizedSearch.length < 2) {
        setSuggestions([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc("search_social_profiles", {
          search_term: normalizedSearch,
          limit_count: 80,
        });

        if (rpcError) throw rpcError;

        const rows = (data ?? []) as ProfileRow[];

        const ranked = rows
          .map((row) => {
            const id = row.id ?? row.user_id ?? "";
            const username = normalizeText(row.username || "");
            const nickname = normalizeText(row.nickname || "");

            return {
              id,
              usernameRaw: row.username || "usuário",
              nicknameRaw: row.nickname || "",
              score: getSearchScore(username, nickname, normalizedSearch),
            };
          })
          .filter((entry) => Boolean(entry.id) && entry.score > 0)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.usernameRaw.localeCompare(b.usernameRaw);
          })
          .slice(0, 8)
          .map((entry) => ({
            id: entry.id,
            username: entry.usernameRaw,
            nickname: entry.nicknameRaw,
            score: entry.score,
          }));

        if (!cancelled) setSuggestions(ranked);
      } catch (err) {
        if (!cancelled) {
          console.error("Erro ao buscar sugestões:", err);
          setError("Não foi possível buscar os nomes agora.");
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [normalizedSearch]);

  const showSuggestions = normalizedSearch.length >= 2;

  return (
    <main className="relative">
      <Header />

      {/* Search Bar */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pt-6 pb-10">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar usuários"
            className="pl-9 rounded-none"
            autoComplete="off"
            aria-label="Pesquisar"
          />

          {showSuggestions ? (
            <div className="absolute top-full left-0 right-0 mt-1 border border-border bg-background z-20">
              {loading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Buscando nomes...</div>
              ) : error ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">{error}</div>
              ) : suggestions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum nome relacionado.</div>
              ) : (
                suggestions.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="w-full text-left px-3 py-2 border-b last:border-b-0 border-border hover:bg-muted/40 transition-colors"
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set("user", person.id);
                      if (person.username) params.set("username", person.username);
                      navigate(`/profile?${params.toString()}`);
                    }}
                  >
                    <p className="text-sm font-semibold truncate">
                      {person.nickname || "Sem nickname"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">@{person.username}</p>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* Social Feed */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pb-16">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Feed Social</h2>
          <p className="text-muted-foreground">Veja os designs e peças públicas dos criadores da comunidade</p>
        </div>
        <SocialFeed limit={100} />
      </section>
    </main>
  )
}
