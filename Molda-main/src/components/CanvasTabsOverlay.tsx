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
    <div className="absolute left-4 top-4 z-20 glass rounded-xl border p-1 shadow-md">
      <div className="flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-3 h-8 rounded-md text-sm transition ${
              activeId === tab.id ? "glass-strong" : "hover:bg-white/20"
            }`}
            aria-pressed={activeId === tab.id}
          >
            {tab.name}
          </button>
        ))}
        <Button onClick={onAdd2D} size="icon" variant="ghost" className="h-8 w-8">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
