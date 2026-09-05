import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { NAV_GROUPS, TOP_LINKS, BOTTOM_LINKS, type NavEntry } from "@/lib/nav";

export type { SectionId } from "@/lib/nav";

const STORAGE_KEY = "aios.sidebar.groups";

function defaultOpenState(): Record<string, boolean> {
  return Object.fromEntries(NAV_GROUPS.map((g) => [g.id, g.defaultOpen]));
}

function readStored(): Record<string, boolean> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [groups, setGroups] = useState<Record<string, boolean>>(
    defaultOpenState,
  );

  // Hydrate from localStorage once on the client.
  useEffect(() => {
    const stored = readStored();
    if (stored) setGroups({ ...defaultOpenState(), ...stored });
  }, []);

  // Auto-expand the group containing the current route; never collapse others.
  useEffect(() => {
    const path = pathname.replace(/(.)\/$/, "$1");
    const match = NAV_GROUPS.find((g) => g.items.some((i) => i.path === path));
    if (!match) return;
    setGroups((prev) => (prev[match.id] ? prev : { ...prev, [match.id]: true }));
  }, [pathname]);

  const toggle = (id: string) =>
    setGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — keep in-memory state only */
      }
      return next;
    });

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-[rgba(3,5,4,0.7)] backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-[100dvh] w-[80vw] max-w-[240px] flex-col border-r border-line bg-app2 pb-4 transition-transform duration-200 lg:w-[200px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="aios-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          <Link
            to="/"
            onClick={() => onClose?.()}
            aria-label="Go to Dashboard"
            className="mb-1 flex items-center gap-2 rounded-md pb-3 pl-4 pr-4 pt-4 text-left transition-opacity hover:opacity-80"
          >
            <img
              src="/jepy-logo.webp"
              alt="JepyLabs logo"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-lg"
            />
            <span className="truncate text-[15px] font-semibold text-fg">
              Jepy<span className="text-lime">Labs</span>
            </span>
          </Link>

          {TOP_LINKS.map((item) => (
            <NavItem key={item.path} item={item} onNavigate={onClose} />
          ))}

          <div className="my-2 h-px bg-line" aria-hidden="true" />

          {NAV_GROUPS.map((group) => {
            const isOpen = !!groups[group.id];
            const panelId = `nav-group-${group.id}`;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-mute transition-colors hover:text-fg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app2"
                >
                  <span>{group.title}</span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <div
                  id={panelId}
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-0.5 pb-1 pl-2">
                      {group.items.map((item) => (
                        <NavItem
                          key={item.path}
                          item={item}
                          onNavigate={onClose}
                          child
                          tabbable={isOpen}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-auto shrink-0 px-3 pt-2">
          <div className="mb-2 h-px bg-line" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            {BOTTOM_LINKS.map((item) => (
              <NavItem key={item.path} item={item} onNavigate={onClose} />
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function NavItem({
  item,
  onNavigate,
  child = false,
  tabbable = true,
}: {
  item: NavEntry;
  onNavigate?: () => void;
  child?: boolean;
  tabbable?: boolean;
}) {
  const { Icon, label, path } = item;
  return (
    <Link
      to={path}
      onClick={() => onNavigate?.()}
      tabIndex={tabbable ? undefined : -1}
      aria-hidden={tabbable ? undefined : true}
      activeOptions={{ exact: path === "/" }}
      className={`flex w-full items-center gap-2.5 rounded-md border-l-2 border-transparent pl-2.5 pr-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)] hover:text-fg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-1 focus-visible:ring-offset-app2 data-[status=active]:border-lime data-[status=active]:bg-[rgba(82,255,46,0.08)] data-[status=active]:text-lime ${
        child ? "h-8 text-mute" : "h-9 text-fg2"
      }`}
    >
      <Icon size={child ? 16 : 18} strokeWidth={1.8} className="shrink-0" />
      <span className={`truncate ${child ? "text-[12.5px]" : "text-[13px]"}`}>
        {label}
      </span>
    </Link>
  );
}
