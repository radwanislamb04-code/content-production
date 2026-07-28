import {
  LayoutGrid,
  Lightbulb,
  Video,
  PenLine,
  LayoutPanelLeft,
  Film,
  Calendar,
  BarChart3,
  Star,
  MessageCircle,
  Bot,
  Settings as SettingsIcon,
} from "lucide-react";

export type SectionId =
  | "dashboard"
  | "discover"
  | "analyzer"
  | "script"
  | "storyboard"
  | "prompt"
  | "planner"
  | "analyst"
  | "score"
  | "dm"
  | "autopilot"
  | "settings";

const NAV: { id: SectionId; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutGrid },
  { id: "discover", label: "Discover", Icon: Lightbulb },
  { id: "analyzer", label: "Video Analyzer", Icon: Video },
  { id: "script", label: "Script + Hook", Icon: PenLine },
  { id: "storyboard", label: "Storyboard", Icon: LayoutPanelLeft },
  { id: "prompt", label: "Video Prompt", Icon: Film },
  { id: "planner", label: "Planner", Icon: Calendar },
  { id: "analyst", label: "Analyst", Icon: BarChart3 },
  { id: "score", label: "Content Score", Icon: Star },
  { id: "dm", label: "DM Manager", Icon: MessageCircle },
  { id: "autopilot", label: "AutoPilot", Icon: Bot },
];

export function Sidebar({
  active,
  onSelect,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-16 flex-col items-center justify-between border-r border-line bg-app2 py-4">
      <div className="flex flex-col items-center gap-1">
        <div className="mb-3 grid h-8 w-8 place-items-center rounded-md bg-lime shadow-[0_0_20px_rgba(82,255,46,0.4)]">
          <div className="h-3 w-3 rotate-45 bg-app" />
        </div>
        {NAV.map((n) => (
          <NavIcon
            key={n.id}
            {...n}
            isActive={active === n.id}
            onClick={() => onSelect(n.id)}
          />
        ))}
      </div>
      <div>
        <NavIcon
          id="settings"
          label="Settings"
          Icon={SettingsIcon}
          isActive={active === "settings"}
          onClick={() => onSelect("settings")}
        />
      </div>
    </aside>
  );
}

function NavIcon({
  label,
  Icon,
  isActive,
  onClick,
}: {
  id: SectionId;
  label: string;
  Icon: typeof LayoutGrid;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
          isActive
            ? "bg-[rgba(82,255,46,0.1)] text-lime"
            : "text-mute hover:text-fg2"
        }`}
        aria-label={label}
      >
        {isActive && (
          <span className="absolute left-[-8px] top-1/2 h-6 w-[2px] -translate-y-1/2 rounded bg-lime" />
        )}
        <Icon size={20} strokeWidth={1.8} />
      </button>
      <span className="pointer-events-none absolute left-14 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-cardhi px-2 py-1 text-xs text-fg opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}
