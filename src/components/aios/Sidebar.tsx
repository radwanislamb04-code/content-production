import {
  LayoutDashboard,
  Lightbulb,
  Video,
  PenLine,
  LayoutPanelLeft,
  Film,
  Calendar,
  BarChart2,
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

const NAV: { id: SectionId; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "discover", label: "Ideator", Icon: Lightbulb },
  { id: "analyzer", label: "Video Analyzer", Icon: Video },
  { id: "script", label: "Script & Hook", Icon: PenLine },
  { id: "storyboard", label: "Storyboard", Icon: LayoutPanelLeft },
  { id: "prompt", label: "Video Prompt", Icon: Film },
  { id: "planner", label: "Planner", Icon: Calendar },
  { id: "analyst", label: "Analyst", Icon: BarChart2 },
  { id: "score", label: "Content Score", Icon: Star },
  { id: "dm", label: "DM Manager", Icon: MessageCircle },
  { id: "autopilot", label: "AutoPilot", Icon: Bot },
];

export function Sidebar({
  active,
  onSelect,
  open = false,
  onClose,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  open?: boolean;
  onClose?: () => void;
}) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-[rgba(3,5,4,0.7)] backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-[100dvh] w-[80vw] max-w-[240px] flex-col justify-between overflow-y-auto border-r border-line bg-app2 pb-4 transition-transform duration-200 lg:w-[200px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="flex flex-col gap-1 px-3">
        <div className="mb-2 flex items-center gap-2 pb-4 pl-4 pr-4 pt-5">
          <img
            src={jepyLogo.url}
            alt="Jepy Labs logo"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          <span className="truncate text-[15px] font-semibold text-fg">
            Jepy<span className="text-lime">Labs</span>
          </span>
        </div>

        {NAV.map((n) => (
          <NavItem
            key={n.id}
            {...n}
            isActive={active === n.id}
            onClick={() => onSelect(n.id)}
          />
        ))}
      </div>
      <div className="px-3">
        <NavItem
          id="settings"
          label="Settings"
          Icon={SettingsIcon}
          isActive={active === "settings"}
          onClick={() => onSelect("settings")}
        />
      </div>
      </aside>
    </>
  );
}

function NavItem({
  label,
  Icon,
  isActive,
  onClick,
}: {
  id: SectionId;
  label: string;
  Icon: typeof LayoutDashboard;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`flex h-11 w-full items-center lg:h-10 gap-3 rounded-md border-l-2 pl-2.5 pr-2 text-left transition-colors ${
        isActive
          ? "border-lime bg-[rgba(82,255,46,0.08)] text-lime"
          : "border-transparent text-mute hover:bg-[rgba(255,255,255,0.03)] hover:text-fg2"
      }`}
    >
      <Icon size={20} strokeWidth={1.8} className="shrink-0" />
      <span className="truncate text-[13px]">{label}</span>
    </button>
  );
}
