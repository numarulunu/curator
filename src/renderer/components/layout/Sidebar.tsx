import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";

interface NavItem {
  to: string;
  label: string;
  group: "analysis" | "execution" | "history";
  icon: React.ReactNode;
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d={d} />
  </svg>
);

const nav: NavItem[] = [
  { to: "/", label: "Dashboard", group: "analysis", icon: icon("M3 12l9-9 9 9M5 10v10h14V10") },
  { to: "/duplicates-exact", label: "Duplicates", group: "analysis", icon: icon("M8 3h10a2 2 0 012 2v10M16 21H6a2 2 0 01-2-2V9a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2z") },
  { to: "/misplaced", label: "Misplaced", group: "analysis", icon: icon("M3 7h6l2 2h10v10a2 2 0 01-2 2H3V7zM12 13v4M10 15h4") },
  { to: "/zero-byte", label: "Zero-byte", group: "analysis", icon: icon("M4 4h10l6 6v10a2 2 0 01-2 2H4V4zM14 4v6h6M8 14h8M8 18h8") },
  { to: "/apply", label: "Apply", group: "execution", icon: icon("M5 12l5 5L20 7") },
  { to: "/sessions", label: "Sessions", group: "history", icon: icon("M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z") },
];

const groupLabel: Record<NavItem["group"], string> = {
  analysis: "Analysis",
  execution: "Execution",
  history: "History",
};

export const Sidebar: React.FC = () => {
  const groups: NavItem["group"][] = ["analysis", "execution", "history"];

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-neutral-900 bg-neutral-950">
      <div className="flex h-14 items-center gap-2.5 border-b border-neutral-900 px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-sm border border-neutral-700 bg-neutral-900">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-neutral-300">
            <path d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-semibold tracking-tight text-neutral-100">Curator</span>
          <span className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-neutral-600">Archive Workstation</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {groups.map((group) => (
          <div key={group} className="mb-5 last:mb-0">
            <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">{groupLabel[group]}</div>
            <ul className="flex flex-col gap-0.5">
              {nav.filter((item) => item.group === group).map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-2.5 rounded px-2 py-1.5 text-[12.5px] transition-colors",
                        isActive ? "bg-neutral-900 text-neutral-100" : "text-neutral-500 hover:bg-neutral-900/60 hover:text-neutral-200",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center", isActive ? "text-neutral-200" : "text-neutral-600 group-hover:text-neutral-300")}>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-neutral-900 px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600">v0.1.0</div>
      </div>
    </aside>
  );
};
