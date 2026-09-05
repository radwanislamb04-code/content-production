import {
  LayoutDashboard,
  Sun,
  History,
  Calendar,
  FolderKanban,
  Lightbulb,
  Video,
  PenLine,
  LayoutPanelLeft,
  Film,
  Image,
  Library as LibraryIcon,
  LayoutGrid,
  Globe,
  Users,
  BarChart2,
  Star,
  ListOrdered,
  Layers,
  Database,
  Bot,
  Settings as SettingsIcon,
} from "lucide-react";

export type NavEntry = {
  path: string;
  label: string;
  Icon: typeof LayoutDashboard;
};

export type NavGroup = { title: string; items: NavEntry[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Daily",
    items: [
      { path: "/", label: "Dashboard", Icon: LayoutDashboard },
      { path: "/daily-brief", label: "Daily Brief", Icon: Sun },
      { path: "/brief-history", label: "Brief History", Icon: History },
      { path: "/calendar", label: "Calendar", Icon: Calendar },
      { path: "/projects", label: "Projects", Icon: FolderKanban },
    ],
  },
  {
    title: "Create",
    items: [
      { path: "/ideator", label: "Ideator", Icon: Lightbulb },
      { path: "/video-analyzer", label: "Video Analyzer", Icon: Video },
      { path: "/script", label: "Script & Hook", Icon: PenLine },
      { path: "/storyboard", label: "Storyboard", Icon: LayoutPanelLeft },
      { path: "/video-prompt", label: "Video Prompt", Icon: Film },
      { path: "/thumbnail-studio", label: "Thumbnail Studio", Icon: Image },
    ],
  },
  {
    title: "Library",
    items: [
      { path: "/library", label: "Library", Icon: LibraryIcon },
      { path: "/templates", label: "Templates", Icon: LayoutGrid },
      { path: "/resources", label: "Resources", Icon: Globe },
      { path: "/characters", label: "Characters", Icon: Users },
    ],
  },
  {
    title: "Insights",
    items: [
      { path: "/performance", label: "Performance", Icon: BarChart2 },
      { path: "/content-score", label: "Content Score", Icon: Star },
      { path: "/hook-scoreboard", label: "Hook Scoreboard", Icon: ListOrdered },
      { path: "/series", label: "Series", Icon: Layers },
    ],
  },
  {
    title: "System",
    items: [
      { path: "/sources", label: "Sources", Icon: Database },
      { path: "/autopilot", label: "AutoPilot", Icon: Bot },
      { path: "/settings", label: "Settings", Icon: SettingsIcon },
    ],
  },
];

/** Legacy in-app navigation ids mapped to their new URL paths. */
export const SECTION_PATH = {
  dashboard: "/",
  discover: "/ideator",
  analyzer: "/video-analyzer",
  script: "/script",
  storyboard: "/storyboard",
  prompt: "/video-prompt",
  planner: "/calendar",
  analyst: "/performance",
  score: "/content-score",
  autopilot: "/autopilot",
  settings: "/settings",
  projects: "/projects",
  templates: "/templates",
  library: "/library",
  resources: "/resources",
} as const;

export type SectionId = keyof typeof SECTION_PATH;

export const TITLE_BY_PATH: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.path, i.label]),
);
