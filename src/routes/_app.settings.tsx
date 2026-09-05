import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "@/components/aios/sections/Settings";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Settings" },
      { name: "description", content: "API keys, integrations, schedule and appearance." },
      { property: "og:title", content: "JepyLabs — Settings" },
      { property: "og:description", content: "API keys, integrations, schedule and appearance." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return <Settings />;
}
