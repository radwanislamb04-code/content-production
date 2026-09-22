import { createFileRoute } from "@tanstack/react-router";
import { AutoPilot } from "@/components/aios/sections/AutoPilot";

export const Route = createFileRoute("/_app/autopilot")({
  head: () => ({
    meta: [
      { title: "Content OS — AutoPilot" },
      { name: "description", content: "Automate recurring content jobs end to end." },
      { property: "og:title", content: "Content OS — AutoPilot" },
      { property: "og:description", content: "Automate recurring content jobs end to end." },
    ],
  }),
  component: AutoPilotPage,
});

function AutoPilotPage() {
  return <AutoPilot />;
}
