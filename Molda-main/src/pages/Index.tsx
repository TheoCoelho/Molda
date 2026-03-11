import Header from "../components/Header";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

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
    </main>
  )
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
