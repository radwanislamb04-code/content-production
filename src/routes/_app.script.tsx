import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { ScriptHook } from "@/components/aios/sections/ScriptHook";

export const Route = createFileRoute("/_app/script")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Script & Hook" },
      { name: "description", content: "Write scroll-stopping hooks and full shooting scripts." },
      { property: "og:title", content: "JepyLabs — Script & Hook" },
      { property: "og:description", content: "Write scroll-stopping hooks and full shooting scripts." },
    ],
  }),
  component: ScriptHookPage,
});

function ScriptHookPage() {
  const onNav = useSectionNav();
  return <ScriptHook onNav={onNav} />;
}
