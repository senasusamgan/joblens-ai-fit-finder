import { Link } from "@tanstack/react-router";
import { Sparkles, LayoutList } from "lucide-react";
import { AuthControl } from "@/components/AuthControl";

const linkBase =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/65 transition hover:bg-white/10 hover:text-white";

export function SiteNav() {
  return (
    <div className="border-b border-white/10">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 md:px-6"
      >
        <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-[13px] font-bold text-white"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          >
            J
          </span>
          <span>
            JobLens <span className="gradient-text">AI</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            to="/"
            className={linkBase}
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Analyze
          </Link>
          <Link
            to="/applications"
            className={linkBase}
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <LayoutList className="h-4 w-4" aria-hidden />
            <span className="hidden xs:inline sm:inline">Applications</span>
            <span className="sm:hidden xs:hidden">Apps</span>
          </Link>
          <AuthControl />
        </div>
      </nav>
    </div>
  );
}
