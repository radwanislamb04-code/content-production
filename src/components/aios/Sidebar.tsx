import { Link } from "@tanstack/react-router";
import { NAV_GROUPS, type NavEntry } from "@/lib/nav";
export type { SectionId } from "@/lib/nav";

export function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
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
        className={`fixed left-0 top-0 z-40 flex h-[100dvh] w-[80vw] max-w-[240px] flex-col overflow-y-auto border-r border-line bg-app2 pb-6 transition-transform duration-200 lg:w-[200px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-1 px-3">
          <Link
            to="/"
            onClick={() => onClose?.()}
            aria-label="Go to Dashboard"
            className="mb-2 flex items-center gap-2 rounded-md pb-4 pl-4 pr-4 pt-5 text-left transition-opacity hover:opacity-80"
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

          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mt-3 first:mt-0">
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
                {group.title}
              </div>
              {group.items.map((item) => (
                <NavItem key={item.path} item={item} onNavigate={onClose} />
              ))}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

function NavItem({
  item,
  onNavigate,
}: {
  item: NavEntry;
  onNavigate?: () => void;
}) {
  const { Icon, label, path } = item;
  return (
    <Link
      to={path}
      onClick={() => onNavigate?.()}
      activeOptions={{ exact: path === "/" }}
      className="flex h-11 w-full items-center gap-3 rounded-md border-l-2 border-transparent pl-2.5 pr-2 text-left text-mute transition-colors hover:bg-[rgba(255,255,255,0.03)] hover:text-fg2 data-[status=active]:border-lime data-[status=active]:bg-[rgba(82,255,46,0.08)] data-[status=active]:text-lime lg:h-10"
    >
      <Icon size={20} strokeWidth={1.8} className="shrink-0" />
      <span className="truncate text-[13px]">{label}</span>
    </Link>
  );
}
