import { createFileRoute } from "@tanstack/react-router";
import { AutoPilot } from "@/components/aios/sections/AutoPilot";

export const Route = createFileRoute("/_app/autopilot")({
  head: () => ({
    meta: [
      { title: "AutoPilot — Jepy Labs" },
      { name: "description", content: "Automate recurring content jobs end to end." },
      { property: "og:title", content: "AutoPilot — Jepy Labs" },
      { property: "og:description", content: "Automate recurring content jobs end to end." },
    ],
  }),
  component: AutoPilotPage,
});

function AutoPilotPage() {
  return <AutoPilot />;
}
