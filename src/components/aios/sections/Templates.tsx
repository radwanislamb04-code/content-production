import { useState } from "react";
import { Card, Pill, OutlineBtn } from "../ui";
import type { SectionId } from "../Sidebar";
import type { TabId } from "../TopNav";
import {
  Lightbulb,
  PenLine,
  LayoutPanelLeft,
  Film,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

const MODULE_ICONS = {
  Ideator: Lightbulb,
  Script: PenLine,
  Storyboard: LayoutPanelLeft,
  "Video Prompt": Film,
  "Trend Spy": TrendingUp,
} as const;

type ModuleName = keyof typeof MODULE_ICONS;

const TEMPLATES: {
  name: string;
  category: "Reel" | "Carousel" | "Story";
  description: string;
  modules: ModuleName[];
}[] = [
  {
    name: "Faceless Reel",
    category: "Reel",
    description: "A voiceover-led reel with AI visuals, no face required.",
    modules: ["Ideator", "Script", "Storyboard", "Video Prompt"],
  },
  {
    name: "Product Review",
    category: "Reel",
    description: "Break down a product with hooks, comparisons, and a CTA.",
    modules: ["Script", "Storyboard"],
  },
  {
    name: "Tutorial Video",
    category: "Reel",
    description: "Step-by-step educational content with clear structure.",
    modules: ["Ideator", "Script", "Storyboard", "Video Prompt"],
  },
  {
    name: "Carousel Breakdown",
    category: "Carousel",
    description: "Multi-slide educational carousel with strong opening slide.",
    modules: ["Ideator", "Script"],
  },
  {
    name: "Story Series",
    category: "Story",
    description: "A 3-part story sequence with consistent character and arc.",
    modules: ["Script", "Storyboard"],
  },
  {
    name: "Trend Reaction",
    category: "Reel",
    description: "React to a trending topic fast, with a prepared structure.",
    modules: ["Trend Spy", "Script"],
  },
];

const CATEGORIES = ["All", "Reels", "Carousels", "Stories"] as const;

const CATEGORY_MATCH: Record<string, string> = {
  Reels: "Reel",
  Carousels: "Carousel",
  Stories: "Story",
};

export function Templates({
  onNav,
  onTab,
}: {
  onNav: (id: SectionId) => void;
  onTab: (t: TabId) => void;
}) {
  const [cat, setCat] = useState<string>("All");
  const list =
    cat === "All"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === CATEGORY_MATCH[cat]);

  const use = () => {
    onTab("Dashboard");
    onNav("analyzer");
    toast("Template loaded — customize your idea");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold text-fg">Templates</h1>
        <p className="mt-1 text-sm text-fg2">
          Start with a proven content structure
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCat(c)}>
            <Pill active={cat === c}>{c}</Pill>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => (
          <Card key={t.name} className="flex flex-col p-5">
            <div>
              <Pill
                variant={
                  t.category === "Reel"
                    ? "accent"
                    : t.category === "Carousel"
                      ? "warn"
                      : "default"
                }
              >
                {t.category}
              </Pill>
            </div>
            <div className="mt-3 text-base font-semibold text-fg">{t.name}</div>
            <p className="mt-1 line-clamp-2 text-[13px] text-fg2">
              {t.description}
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              {t.modules.map((m) => {
                const Icon = MODULE_ICONS[m];
                return (
                  <span key={m} title={m} className="text-mute">
                    <Icon size={14} />
                  </span>
                );
              })}
            </div>
            <div className="mt-4">
              <OutlineBtn onClick={use}>Use Template →</OutlineBtn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
