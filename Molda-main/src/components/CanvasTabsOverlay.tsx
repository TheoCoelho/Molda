import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type CanvasTab = { id: string; name: string; type: "2d" | "3d" };

interface Props {
  tabs: CanvasTab[];
  activeId: string;
  onChange: (id: string) => void;
  onAdd2D: () => void;
}

export default function CanvasTabsOverlay({ tabs, activeId, onChange, onAdd2D }: Props) {
  return (
    <div className="absolute left-4 top-4 z-20 glass rounded-xl border p-1 shadow-md max-w-[calc(100%-2rem)] overflow-x-auto overflow-y-hidden">
      <div className="flex flex-nowrap items-center gap-1 min-w-0 whitespace-nowrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 px-3 h-8 rounded-md text-sm transition ${
              activeId === tab.id ? "glass-strong" : "hover:bg-white/20"
            }`}
            aria-pressed={activeId === tab.id}
            title={tab.name}
          >
            <span className="inline-block max-w-[12rem] truncate align-middle">{tab.name}</span>
          </button>
        ))}
        <Button onClick={onAdd2D} size="icon" variant="ghost" className="shrink-0 h-8 w-8">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
