import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_BUCKET } from "@/lib/constants/storage";

export default function Index() {
  return (
    <main className="relative">
      <Header />

      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pt-20 pb-16">
        {/* blobs decorativos removidos pelo design minimalista */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" />

        <div className="grid gap-8 md:grid-cols-[1.2fr,0.8fr] items-center">
          <div>
            <h1 className="text-4xl md:text-6xl font-brandHeading tracking-tight leading-[1.05]">
              Personalize suas roupas <span className="text-[hsl(var(--foreground))] text-black">do seu jeito</span> —{" "}
              <span className="bg-foreground text-background px-2 py-0.5 rounded-none uppercase tracking-widest text-lg md:text-3xl">criativo e direto</span>.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Desenhe no 2D, visualize em 3D e publique sua criação.
              Elementos abstratos, ferramentas familiares e um fluxo simples — a arte é sua, o palco é nosso.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/create">
                <Button size="lg" className="rounded-none uppercase tracking-widest h-12 px-8">
                  Criar Agora
                </Button>
              </Link>
              <Link to="/creation">
                <Button variant="outline" size="lg" className="rounded-none uppercase tracking-widest h-12 px-8">
                  Abrir Projeto
                </Button>
              </Link>
            </div>

            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground uppercase tracking-widest text-xs">
              <span className="inline-block h-2 w-2 rounded-none bg-foreground border border-border"></span>
              Sem travar: salvamento automático e exportação PNG.
            </div>
          </div>

          {/* Card de destaque */}
          <div className="border border-border bg-background p-5 md:p-6 shadow-none">
            <h3 className="text-xl font-brandHeading uppercase tracking-widest">Como funciona?</h3>
            <ol className="mt-4 space-y-3 text-sm text-muted-foreground list-decimal pl-5">
              <li>Escolha a peça e o modelo.</li>
              <li>Brinque com formas, pincéis e cores.</li>
              <li>Veja o resultado no 3D.</li>
              <li>Exporte ou salve o projeto para mais tarde.</li>
            </ol>
            <div className="mt-6 grid grid-cols-3 gap-0 border border-border">
              <div className="h-16 bg-background border-r border-border flex items-center justify-center">
                <span className="text-xs uppercase tracking-widest">Formas</span>
              </div>
              <div className="h-16 bg-background border-r border-border flex items-center justify-center">
                <span className="text-xs uppercase tracking-widest">Pincéis</span>
              </div>
              <div className="h-16 bg-background flex items-center justify-center">
                <span className="text-xs uppercase tracking-widest">3D</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pb-28">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            title="Pincéis divertidos"
            desc="Traço livre, marcador, spray, caligrafia — com suavidade e controle de opacidade."
            color="from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-keppel))]"
          />
          <Feature
            title="Formas e linha reta"
            desc="Retângulos, triângulos, elipses e reta com precisão. Fácil selecionar e editar."
            color="from-[hsl(var(--brand-keppel))] to-[hsl(var(--brand-green))]"
          />
          <Feature
            title="Pré-visualização 3D"
            desc="Veja sua arte aplicada no modelo 3D em tempo real. Gire, aproxime, explore."
            color="from-[hsl(var(--brand-uv))] to-[hsl(var(--brand-blue))]"
          />
        </div>
      </section>

      <SocialDiscoverySection />
    </main>
  )
}

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  username: string | null;
  nickname: string | null;
  avatar_path: string | null;
  designs_count: number | null;
  pieces_count: number | null;
};

type SocialResult = {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string;
  score: number;
  designsCount: number;
  piecesCount: number;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^@+/, "");
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array(b.length + 1).fill(0);
  const curr = new Array(b.length + 1).fill(0);

  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function usernameScore(row: ProfileRow, searchTerm: string) {
  if (!searchTerm) return 1;

  const username = normalizeText(row.username || "");
  const nickname = normalizeText(row.nickname || "");
  if (!username) return 0;

  if (username === searchTerm) return 1000;

  let score = 0;

  if (username.startsWith(searchTerm)) {
    score = Math.max(score, 820 - Math.abs(username.length - searchTerm.length));
  }

  if (username.includes(searchTerm)) {
    score = Math.max(score, 680 - username.indexOf(searchTerm) * 8);
  }

  if (nickname.includes(searchTerm)) {
    score = Math.max(score, 520 - nickname.indexOf(searchTerm) * 6);
  }

  const distance = levenshteinDistance(username, searchTerm);
  const maxDistance = Math.max(2, Math.floor(searchTerm.length * 0.45));
  if (distance <= maxDistance) {
    score = Math.max(score, 420 - distance * 28);
  }

  return score;
}

function SocialDiscoverySection() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SocialResult[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const normalizedSearch = useMemo(() => normalizeText(debouncedQuery), [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc("search_social_profiles", {
          search_term: normalizedSearch || null,
          limit_count: 120,
        });

        if (rpcError) throw rpcError;

        const rows = (data ?? []) as ProfileRow[];

        const scored = rows
          .map((row) => ({
            row,
            score: usernameScore(row, normalizedSearch),
          }))
          .filter((entry) => (!normalizedSearch ? true : entry.score > 0))
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (a.row.username || "").localeCompare(b.row.username || "");
          })
          .slice(0, 12);

        const nextResults = scored.map(({ row, score }) => {
          const id = row.id ?? row.user_id ?? "";
          const username = row.username || "usuário";
          const avatarUrl = row.avatar_path
            ? supabase.storage.from(AVATAR_BUCKET).getPublicUrl(row.avatar_path).data.publicUrl || ""
            : "";

          return {
            id,
            username,
            nickname: row.nickname || "",
            avatarUrl,
            score,
            designsCount: Number(row.designs_count ?? 0),
            piecesCount: Number(row.pieces_count ?? 0),
          } satisfies SocialResult;
        }).filter((entry) => Boolean(entry.id));

        if (!cancelled) setResults(nextResults);
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("Erro ao buscar usuários:", err);
          const message = String((err as { message?: string } | null)?.message || "");
          const missingRpc =
            message.includes("search_social_profiles") ||
            message.includes("PGRST202") ||
            message.includes("Could not find the function");

          setError(
            missingRpc
              ? "Busca social não configurada no banco. Execute o arquivo supabase/social_search_profiles.sql."
              : "Não foi possível carregar os usuários agora.",
          );
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [normalizedSearch]);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 pb-28">
      <div className="border border-border bg-background p-5 md:p-6">
        <h3 className="text-xl font-brandHeading uppercase tracking-widest">Comunidade</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Procure por username para encontrar pessoas, abrir perfis e ver seus designs e peças.
        </p>

        <div className="mt-5 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar por username"
            className="pl-9 rounded-none"
            autoComplete="off"
          />
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="border border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando usuários...
            </div>
          ) : error ? (
            <div className="border border-border p-4 text-sm text-muted-foreground">{error}</div>
          ) : results.length === 0 ? (
            <div className="border border-border p-4 text-sm text-muted-foreground">
              Nenhum usuário encontrado para “{debouncedQuery || query}”.
            </div>
          ) : (
            results.map((person) => (
              <div
                key={person.id}
                className="border border-border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 rounded-none border border-border">
                    <AvatarImage src={person.avatarUrl} alt={person.username} />
                    <AvatarFallback className="rounded-none uppercase">
                      {person.username.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">@{person.username}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {person.nickname || "Sem nickname"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {person.designsCount} design(s) público(s) • {person.piecesCount} peça(s)
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="rounded-none uppercase tracking-widest text-xs"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("user", person.id);
                    if (person.username) params.set("username", person.username);
                    navigate(`/profile?${params.toString()}`);
                  }}
                >
                  Ver perfil
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Feature({
  title,
  desc,
}: {
  title: string
  desc: string
  color: string
}) {
  return (
    <div className="relative overflow-hidden rounded-none border border-border bg-background p-6">
      <h4 className="text-lg font-brandHeading uppercase tracking-widest">{title}</h4>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-6">
        <Button variant="outline" className="gap-1 rounded-none uppercase tracking-widest text-xs h-8">
          Explorar
          <span aria-hidden>→</span>
        </Button>
      </div>
    </div>
  )
}
