import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar } from "@/components/aios/Sidebar";
import { TopNav } from "@/components/aios/TopNav";
import { PipelineProvider } from "@/components/aios/pipeline";
import { TITLE_BY_PATH, groupForPath } from "@/lib/nav";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const path = pathname.replace(/(.)\/$/, "$1");
  const title = TITLE_BY_PATH[path] ?? "Dashboard";

  return (
    <PipelineProvider>
      <div className="min-h-screen overflow-x-hidden bg-app text-fg">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <TopNav title={title} onMenu={() => setMenuOpen(true)} />
        <main className="min-h-screen pt-[57px] lg:ml-[200px]">
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
