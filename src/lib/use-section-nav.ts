import { useNavigate } from "@tanstack/react-router";
import { SECTION_PATH, type SectionId } from "./nav";

/** Bridges the legacy in-app section ids used by section components to real URLs. */
export function useSectionNav() {
  const navigate = useNavigate();
  return (id: SectionId) => {
    navigate({ to: SECTION_PATH[id] });
  };
}
