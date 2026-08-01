import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar, type SectionId } from "@/components/aios/Sidebar";
import { TopNav, type TabId } from "@/components/aios/TopNav";
import { Dashboard } from "@/components/aios/sections/Dashboard";
import { Discover } from "@/components/aios/sections/Discover";
import { VideoAnalyzer } from "@/components/aios/sections/VideoAnalyzer";
import { ScriptHook } from "@/components/aios/sections/ScriptHook";
import { Storyboard } from "@/components/aios/sections/Storyboard";
import { VideoPrompt } from "@/components/aios/sections/VideoPrompt";
import { Planner } from "@/components/aios/sections/Planner";
import { Analyst } from "@/components/aios/sections/Analyst";
import { ContentScore } from "@/components/aios/sections/ContentScore";
import { DMManager } from "@/components/aios/sections/DMManager";
import { AutoPilot } from "@/components/aios/sections/AutoPilot";
import { Settings } from "@/components/aios/sections/Settings";
import { Projects } from "@/components/aios/sections/Projects";
import { Templates } from "@/components/aios/sections/Templates";
import { Library } from "@/components/aios/sections/Library";
import { Resources } from "@/components/aios/sections/Resources";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Content OS — Plan, Script & Ship Content" },
      {
        name: "description",
        content:
          "A dark, keyboard-fast content operating system: ideate, analyze video, write scripts, storyboard shots, and plan releases in one workspace.",
      },
      { property: "og:title", content: "AI Content OS — Plan, Script & Ship Content" },
      {
        property: "og:description",
        content:
          "Ideate, analyze video, write scripts, storyboard shots, and plan releases in one dark, keyboard-fast workspace.",
      },
    ],
  }),
  component: App,
});

const TITLES: Record<SectionId, string> = {
  dashboard: "Dashboard",
  discover: "Ideator",
  analyzer: "Video Analyzer",
  script: "Script + Hook",
  storyboard: "Storyboard",
  prompt: "Video Prompt",
  planner: "Planner",
  analyst: "Analyst",
  score: "Content Score",
  dm: "DM Manager",
  autopilot: "AutoPilot",
  settings: "Settings",
};

function App() {
  const [section, setSection] = useState<SectionId>("dashboard");
  const [tab, setTab] = useState<TabId>("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (id: SectionId) => {
    setSection(id);
    setTab("Dashboard");
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-app text-fg">
      <Sidebar
        active={section}
        onSelect={navigate}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <TopNav
        title={tab === "Dashboard" ? TITLES[section] : tab}
        activeTab={tab}
        onTabChange={setTab}
        onMenu={() => setMenuOpen(true)}
      />
      <main className="min-h-screen pt-[105px] sm:pt-[97px] lg:ml-[200px]">
        <div className="p-4 sm:p-6">
          {tab === "Projects" && <Projects onNav={setSection} onTab={setTab} />}
          {tab === "Templates" && (
            <Templates onNav={setSection} onTab={setTab} />
          )}
          {tab === "Library" && <Library />}
          {tab === "Resources" && <Resources />}

          {tab === "Dashboard" && (
            <>
              {section === "dashboard" && (
                <Dashboard onNav={setSection} onTab={setTab} />
              )}
              {section === "discover" && <Discover />}
              {section === "analyzer" && <VideoAnalyzer onNav={navigate} />}
              {section === "script" && <ScriptHook />}
              {section === "storyboard" && <Storyboard />}
              {section === "prompt" && <VideoPrompt />}
              {section === "planner" && <Planner />}
              {section === "analyst" && <Analyst />}
              {section === "score" && <ContentScore />}
              {section === "dm" && <DMManager />}
              {section === "autopilot" && <AutoPilot />}
              {section === "settings" && <Settings />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
