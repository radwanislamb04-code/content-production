import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar, type SectionId } from "@/components/aios/Sidebar";
import { TopNav } from "@/components/aios/TopNav";
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

export const Route = createFileRoute("/")({
  component: App,
});

const TITLES: Record<SectionId, string> = {
  dashboard: "Dashboard",
  discover: "Discover",
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

  return (
    <div className="min-h-screen bg-app text-fg">
      <Sidebar active={section} onSelect={setSection} />
      <TopNav title={TITLES[section]} />
      <main className="ml-16 pt-14 min-h-screen">
        <div className="p-6">
          {section === "dashboard" && <Dashboard onNav={setSection} />}
          {section === "discover" && <Discover />}
          {section === "analyzer" && <VideoAnalyzer />}
          {section === "script" && <ScriptHook />}
          {section === "storyboard" && <Storyboard />}
          {section === "prompt" && <VideoPrompt />}
          {section === "planner" && <Planner />}
          {section === "analyst" && <Analyst />}
          {section === "score" && <ContentScore />}
          {section === "dm" && <DMManager />}
          {section === "autopilot" && <AutoPilot />}
          {section === "settings" && <Settings />}
        </div>
      </main>
    </div>
  );
}
