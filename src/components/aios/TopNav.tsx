import { Search, Moon, Bell } from "lucide-react";

export function TopNav({ title }: { title: string }) {
  return (
    <header className="fixed left-16 right-0 top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-[rgba(3,5,4,0.85)] px-6 backdrop-blur-md">
      <div className="text-base font-semibold text-fg">{title}</div>
      <div className="flex items-center gap-3">
        <IconBtn>
          <Search size={16} />
        </IconBtn>
        <IconBtn>
          <Moon size={16} />
        </IconBtn>
        <div className="relative">
          <IconBtn>
            <Bell size={16} />
          </IconBtn>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lime shadow-[0_0_6px_#52FF2E]" />
        </div>
        <div className="ml-1 grid h-9 w-9 place-items-center rounded-full border-2 border-lime bg-cardx text-xs font-semibold text-fg">
          EN
        </div>
      </div>
    </header>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="grid h-9 w-9 place-items-center rounded-md text-fg2 transition-colors hover:bg-cardx hover:text-fg">
      {children}
    </button>
  );
}
