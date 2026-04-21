import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/duplicates-exact", label: "Exact duplicates" },
  { to: "/misplaced", label: "Misplaced by date" },
  { to: "/zero-byte", label: "Zero-byte" },
  { to: "/apply", label: "Apply" },
  { to: "/sessions", label: "Sessions" },
];

export function Sidebar(): JSX.Element {
  return (
    <nav className="w-56 border-r border-border p-4 flex flex-col gap-1">
      <div className="text-sm font-semibold tracking-tight mb-4">Curator</div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/"}
          className={({ isActive }) =>
            cn(
              "px-3 py-2 rounded-md text-sm transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
