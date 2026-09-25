import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/aios/Sidebar";
import { TopNav } from "@/components/aios/TopNav";
import { PipelineProvider } from "@/components/aios/pipeline";
import { TITLE_BY_PATH, groupForPath } from "@/lib/nav";
import { hydrateAppearance, loadAppearance } from "@/lib/appearance";
import { useSidebarOpen } from "@/lib/sidebar";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen();
  const path = pathname.replace(/(.)\/$/, "$1");
  const title = TITLE_BY_PATH[path] ?? "Dashboard";

  // Ctrl/⌘+B is what every editor uses for this, so it costs nothing to support.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, setSidebarOpen]);

  // A phone gets a drawer, and a drawer has to close: navigating, pressing Escape, or a
  // back gesture. Only the scrim and the links did it, so the drawer stayed open.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Apply the stored appearance before the shell paints: the localStorage
  // mirror first (no dark flash), then the account copy.
  useEffect(() => {
    hydrateAppearance();
    loadAppearance();
  }, []);

  return (
    <PipelineProvider>
      <div className="min-h-dvh overflow-x-hidden bg-app text-fg" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <TopNav title={title} onMenu={() => setMenuOpen(true)} />

        {/* The way back once the sidebar is hidden — a thin tab on the left edge,
            so the whole menu comes back without hunting for a button. */}
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Show the sidebar"
            title="Show the sidebar (Ctrl+B)"
            className="fixed left-0 top-1/2 z-40 hidden h-14 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-line bg-cardx text-mute shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition-colors hover:border-lime hover:text-lime lg:flex"
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        )}

        <main
          className={`min-h-dvh pt-[57px] ${
            sidebarOpen ? "lg:ml-[200px]" : "lg:ml-0"
          }`}
        >
          <SiblingTabs path={path} />
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </PipelineProvider>
  );
}

/**
 * Same focus ring the shared <Tabs> component uses. Duplicated locally so
 * SubTabs can render an identically-styled tab button without importing
 * the un-exported constant from the ui module.
 */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app";

/** Permanent quick links shown on the right side of the second header row. */
const QUICK_LINKS: { id: string; label: string }[] = [
  { id: "/calendar", label: "Calendar" },
  { id: "/board", label: "Board" },
  { id: "/templates", label: "Templates" },
  { id: "/resources", label: "Resources" },
  { id: "/performance", label: "Performance" },
];

/**
 * Tab buttons that mirror the look of the shared <Tabs> component but stay
 * on a single line (no flex-wrap), so the parent row keeps a constant height.
 */
function SubTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex shrink-0 items-center gap-2">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`h-9 rounded-full px-4 text-sm ${FOCUS_RING} ${
              selected
                ? "bg-lime font-bold text-app"
                : "border border-line text-fg2 hover:border-lime hover:text-lime"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function SiblingTabs({ path }: { path: string }) {
  const navigate = useNavigate();
  const group = groupForPath(path);

  const leftTabs = group
    ? group.items.map((i) => ({ id: i.path, label: i.label }))
    : [];
  const leftIds = new Set(leftTabs.map((t) => t.id));
  const rightTabs = QUICK_LINKS.filter((q) => !leftIds.has(q.id));

  const handleChange = (id: string) => navigate({ to: id });
  const showDivider = leftTabs.length > 0 && rightTabs.length > 0;

  return (
    <div className="border-b border-line bg-app2">
      <div className="aios-scroll flex h-[52px] items-center gap-3 overflow-x-auto px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-3">
          {leftTabs.length > 0 && (
            <SubTabs tabs={leftTabs} active={path} onChange={handleChange} />
          )}
          {showDivider && (
            <div
              className="h-6 w-px shrink-0 bg-line2"
              aria-hidden="true"
            />
          )}
        </div>
        {rightTabs.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SubTabs tabs={rightTabs} active={path} onChange={handleChange} />
          </div>
        )}
      </div>
    </div>
  );
}
