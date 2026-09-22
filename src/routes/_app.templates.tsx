import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { Templates } from "@/components/aios/sections/Templates";

export const Route = createFileRoute("/_app/templates")({
  head: () => ({
    meta: [
      { title: "Content OS — Templates" },
      { name: "description", content: "Reusable content formats you can load in one click." },
      { property: "og:title", content: "Content OS — Templates" },
      { property: "og:description", content: "Reusable content formats you can load in one click." },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const onNav = useSectionNav();
  return <Templates onNav={onNav} />;
}
