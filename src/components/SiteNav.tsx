import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  LayoutDashboard,
  LayoutList,
  Target,
} from "lucide-react";
import { AuthControl } from "@/components/AuthControl";

const linkBase =
  "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-white/65 transition hover:bg-white/10 hover:text-white md:px-3 md:py-1.5 md:text-sm";

export function SiteNav() {
  return (
    <div className="border-b border-white/10">
      <nav
        aria-label="Main"
        className="mx-auto grid max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-2 px-4 py-3 md:px-6"
      >
        <Link
          to="/"
          className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight text-white"
        >
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-bold text-white"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          >
            J
          </span>
          <span className="whitespace-nowrap">
            JobLens <span className="gradient-text">AI</span>
          </span>
        </Link>

        <div className="col-span-3 row-start-2 grid grid-cols-4 gap-1 rounded-xl bg-white/[0.03] p-1 md:col-span-1 md:col-start-2 md:row-start-1 md:flex md:justify-self-end md:bg-transparent md:p-0">
          <Link
            to="/"
            className={linkBase}
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span>Analyze</span>
          </Link>

          <Link
            to="/dashboard"
            className={linkBase}
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/goals"
            className={linkBase}
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <Target className="h-4 w-4 shrink-0" aria-hidden />
            <span>Goals</span>
          </Link>

          <Link
            to="/applications"
            className={linkBase}
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <LayoutList className="h-4 w-4 shrink-0" aria-hidden />
            <span>Applications</span>
          </Link>
        </div>

        <div className="col-start-3 row-start-1 min-w-0 justify-self-end">
          <AuthControl />
        </div>
      </nav>
    </div>
  );
}
