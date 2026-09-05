import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar } from "@/components/aios/Sidebar";
import { TopNav } from "@/components/aios/TopNav";
import { PipelineProvider } from "@/components/aios/pipeline";
import { TITLE_BY_PATH } from "@/lib/nav";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const title = TITLE_BY_PATH[pathname.replace(/(.)\/$/, "$1")] ?? "Dashboard";

  return (
    <PipelineProvider>
      <div className="min-h-screen overflow-x-hidden bg-app text-fg">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <TopNav title={title} onMenu={() => setMenuOpen(true)} />
        <main className="min-h-screen pt-[57px] lg:ml-[200px]">
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </PipelineProvider>
  );
}
