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
        {tabs.map((tab) => {
          const is3D = tab.type === "3d";
          const isActive = activeId === tab.id;

          const baseClasses = is3D
            ? "shrink-0 px-5 h-10 rounded-lg text-sm font-bold transition-all duration-200"
            : "shrink-0 px-3 h-8 rounded-md text-sm transition";

          const stateClasses = is3D
            ? isActive
              ? "bg-gradient-to-r from-violet-600 to-purple-500 text-white shadow-lg shadow-violet-500/30"
              : "hover:bg-violet-500/20 text-violet-200"
            : isActive
              ? "glass-strong"
              : "hover:bg-white/20";

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`${baseClasses} ${stateClasses}`}
              aria-pressed={isActive}
              title={tab.name}
            >
              <span className="inline-block max-w-[12rem] truncate align-middle">{tab.name}</span>
            </button>
          );
        })}
        <Button onClick={onAdd2D} size="icon" variant="ghost" className="shrink-0 h-8 w-8">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
