import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { roleLabel } from "../../lib/permissions";
import { IconLogOut, IconMenu, IconMoon, IconSun } from "../icons";
import { NotificationBell } from "../NotificationBell";

export function Header({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { user, logout } = useAuth();
  const { mode, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = user?.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <button
        onClick={onOpenMobileMenu}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        aria-label="Open menu"
      >
        <IconMenu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <button
        onClick={toggle}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Toggle theme"
        title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {mode === "dark" ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
      </button>

      <NotificationBell />

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium leading-tight text-slate-900 dark:text-white">
              {user?.name}
            </p>
            <p className="text-xs leading-tight text-slate-500 dark:text-slate-400">
              {roleLabel(user?.role ?? "")}
            </p>
          </div>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{user?.email}</div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <IconLogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
