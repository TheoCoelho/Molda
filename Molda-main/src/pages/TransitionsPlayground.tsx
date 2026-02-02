import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";

const effects = [
  { id: "fade-scale-in", label: "Fade + Scale In" },
  { id: "fade-scale-out", label: "Fade + Scale Out" },
  { id: "slide-in-right", label: "Slide In Right" },
  { id: "slide-out-left", label: "Slide Out Left" },
  { id: "slide-in-left", label: "Slide In Left" },
  { id: "slide-out-right", label: "Slide Out Right" },
  { id: "flip-in", label: "Flip In 3D" },
  { id: "flip-out", label: "Flip Out 3D" },
  { id: "pulse-in", label: "Pulse In" },
  { id: "bounce-in", label: "Bounce In" },
  { id: "shimmer-in", label: "Shimmer In" },
  { id: "carousel-item-enter", label: "Carousel Enter" },
  { id: "carousel-item-exit", label: "Carousel Exit" },
];

const TransitionsPlayground = () => {
  const [activeEffect, setActiveEffect] = useState<string>("fade-scale-in");
  const [version, setVersion] = useState(0);

  const previewClassName = useMemo(() => {
    return `transition-preview ${activeEffect}`;
  }, [activeEffect]);

  const triggerEffect = (effectId: string) => {
    setActiveEffect(effectId);
    setVersion((v) => v + 1);
  };

  return (
    <div className="min-h-screen overflow-hidden">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <section className="glass rounded-2xl border shadow-xl p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold">Testes de Transições</h1>
              <p className="text-sm text-muted-foreground">
                Página temporária para testar todos os efeitos. Pode ser removida
                após escolher o estilo desejado.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => triggerEffect(activeEffect)}
                >
                  Repetir efeito atual
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
              <div className="glass rounded-xl border p-4">
                <h2 className="text-sm font-semibold mb-3">Efeitos</h2>
                <div className="flex flex-col gap-2">
                  {effects.map((effect) => (
                    <button
                      key={effect.id}
                      type="button"
                      onClick={() => triggerEffect(effect.id)}
                      className={`text-left rounded-lg px-3 py-2 text-sm transition-all ${
                        activeEffect === effect.id
                          ? "glass-strong shadow-md"
                          : "hover:bg-white/10"
                      }`}
                    >
                      {effect.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="glass rounded-xl border p-6 min-h-[360px] flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Pré-visualização</h2>
                  <span className="text-xs text-muted-foreground">
                    Classe: {activeEffect}
                  </span>
                </div>

                <div className="flex-1 flex items-center justify-center">
                  <div
                    key={version}
                    className={previewClassName}
                  >
                    <div className="text-sm font-medium">Molda Transitions</div>
                    <div className="text-xs text-muted-foreground">
                      {effects.find((effect) => effect.id === activeEffect)?.label}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Dica: clique em outro efeito ou em “Repetir efeito atual” para
                  reexecutar a animação.
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default TransitionsPlayground;
