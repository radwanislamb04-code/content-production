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
import { Tabs } from "@/components/aios/ui";
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

function SiblingTabs({ path }: { path: string }) {
  const navigate = useNavigate();
  const group = groupForPath(path);
  if (!group) return null;

  const tabs = group.items.map((i) => ({ id: i.path, label: i.label }));

  return (
    <div className="aios-scroll overflow-x-auto border-b border-line bg-app2 px-4 py-2 sm:px-6">
      <div className="w-max">
        <Tabs
          tabs={tabs}
          active={path}
          onChange={(id) => navigate({ to: id })}
        />
      </div>
    </div>
  );
}
