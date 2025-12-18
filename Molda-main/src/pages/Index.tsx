import Header from "../components/Header";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export default function Index() {
  return (
    <main className="relative">
      <Header />

      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-16">
        {/* blobs decorativos */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-10 -left-8 h-56 w-56 rounded-full blur-3xl opacity-70"
               style={{ background: "radial-gradient(circle, rgba(78,65,135,0.35) 0%, transparent 60%)" }} />
          <div className="absolute -top-8 right-0 h-72 w-72 rounded-full blur-3xl opacity-70"
               style={{ background: "radial-gradient(circle, rgba(46,191,165,0.30) 0%, transparent 60%)" }} />
        </div>

        <div className="grid gap-8 md:grid-cols-[1.2fr,0.8fr] items-center">
          <div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Personalize suas roupas <span className="text-[hsl(var(--primary))]">do seu jeito</span> —{" "}
              <span className="bg-[hsl(var(--muted))] px-2 rounded-lg">criativo e divertido</span>.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Desenhe no 2D, visualize em 3D e publique sua criação.
              Elementos abstratos, ferramentas familiares e um fluxo simples — a arte é sua, o palco é nosso.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/create">
                <Button variant="cta" size="lg" rounded="full" className="shadow-[0_12px_28px_rgba(48,131,220,0.35)]">
                  ✨ Criar agora
                </Button>
              </Link>
              <Link to="/creation">
                <Button variant="outline" size="lg" rounded="full">
                  Abrir projeto recente
                </Button>
              </Link>
            </div>

            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-green))]"></span>
              Sem travar: salvamento de rascunho automático e exportação PNG do canvas.
            </div>
          </div>

          {/* Card de destaque */}
          <div className="section-soft p-5 md:p-6 border shadow-sm">
            <h3 className="text-xl font-semibold">Como funciona?</h3>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
              <li>Escolha a peça e o modelo.</li>
              <li>Brinque com formas, pincéis e cores (2D).</li>
              <li>Veja o resultado aplicado em 3D.</li>
              <li>Exporte ou salve o rascunho para continuar depois.</li>
            </ol>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="h-16 rounded-lg bg-white border flex items-center justify-center">
                <span className="text-xs">Formas</span>
              </div>
              <div className="h-16 rounded-lg bg-white border flex items-center justify-center">
                <span className="text-xs">Pincéis</span>
              </div>
              <div className="h-16 rounded-lg bg-white border flex items-center justify-center">
                <span className="text-xs">3D</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-6 pb-28">
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
    </main>
  )
}

function Feature({
  title,
  desc,
  color
}: {
  title: string
  desc: string
  color: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-white p-6">
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full blur-2xl opacity-50 bg-gradient-to-br ${color}`}
      />
      <h4 className="text-lg font-semibold">{title}</h4>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4">
        <Button variant="ghost" rounded="full" className="gap-1">
          Explorar
          <span aria-hidden>→</span>
        </Button>
      </div>
    </div>
  )
}
