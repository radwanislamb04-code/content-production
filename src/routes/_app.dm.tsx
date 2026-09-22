import { createFileRoute } from "@tanstack/react-router";
import { DMManager } from "@/components/aios/sections/DMManager";

export const Route = createFileRoute("/_app/dm")({
  head: () => ({
    meta: [
      { title: "Content OS — DM Manager" },
      {
        name: "description",
        content:
          "Comment keyword and DM automations for Instagram: rules, public replies, private DMs and the inbox they fill.",
      },
      { property: "og:title", content: "Content OS — DM Manager" },
      {
        property: "og:description",
        content: "Comment keyword and DM automations for Instagram.",
      },
    ],
  }),
  component: DMPage,
});

function DMPage() {
  return <DMManager />;
}
