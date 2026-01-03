// src/components/ImageToolbar.tsx
import React from "react";
import {
  Crop,
  SlidersHorizontal,
  Sparkles,
  Move,
  Waves,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

type Props = {
  visible: boolean;
  /**
   * "top" e "bottom" seguem o mesmo padrão do TextToolbar.
   * "inline" deixa o pai controlar posicionamento.
   */
  position?: "top" | "bottom" | "inline";
};

function IconBtn({
  title,
  children,
  onClick,
}: React.PropsWithChildren<{ title: string; onClick?: () => void }>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
      onClick={onClick ?? (() => {})}
    >
      {children}
    </button>
  );
}

export default function ImageToolbar({ visible, position = "bottom" }: Props) {
  if (!visible) return null;

  const toolbar = (
    <div
      className={[
        "relative",
        "flex items-center gap-2 p-2 rounded-2xl border shadow-lg bg-background",
        "backdrop-blur supports-[backdrop-filter]:bg-background/90",
      ].join(" ")}
      role="toolbar"
      aria-label="Ferramentas de imagem"
    >
      <IconBtn title="Níveis">
        <SlidersHorizontal className="h-4 w-4" />
      </IconBtn>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Corte"
            aria-label="Corte"
            className="h-9 w-9 grid place-items-center rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 hover:bg-white hover:shadow transition"
          >
            <Crop className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="w-48">
          <DropdownMenuItem onSelect={() => {}}>Corte quadrado</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {}}>Laço</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {}}>Varinha mágica</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {}}>Por cor</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <IconBtn title="Efeitos">
        <Sparkles className="h-4 w-4" />
      </IconBtn>

      <IconBtn title="Transformação unificada">
        <Move className="h-4 w-4" />
      </IconBtn>

      <IconBtn title="Deformação">
        <Waves className="h-4 w-4" />
      </IconBtn>
    </div>
  );

  if (position === "top") {
    return <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[60]">{toolbar}</div>;
  }
  if (position === "bottom") {
    return (
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-[60]" style={{ maxWidth: "95%" }}>
        {toolbar}
      </div>
    );
  }
  return toolbar;
}
