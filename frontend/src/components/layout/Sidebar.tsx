import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import {
  IconActivity,
  IconBarChart,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutDashboard,
  IconListChecks,
  IconChecklist,
  IconShield,
  IconTool,
  IconUsers,
  IconX,
} from "../icons";
import {
  canManageRoles,
  canManageTasks,
  canManageToolRegistry,
  canManageUsers,
  canViewActivityLog,
  canViewReports,
  canViewUsers,
} from "../../lib/permissions";

interface NavItem {
  to: string;
  label: string;
  icon: (props: { className?: string }) => ReactElement;
  visible: (role: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: IconLayoutDashboard, visible: () => true },
  { to: "/my-tasks", label: "My Tasks", icon: IconChecklist, visible: () => true },
  { to: "/tasks", label: "All Tasks", icon: IconListChecks, visible: canManageTasks },
  { to: "/team", label: "Team", icon: IconUsers, visible: canViewUsers },
  { to: "/reports", label: "Reports", icon: IconBarChart, visible: canViewReports },
  { to: "/admin/users", label: "Manage Users", icon: IconUsers, visible: canManageUsers },
  { to: "/admin/roles", label: "Manage Roles", icon: IconShield, visible: canManageRoles },
  { to: "/admin/tools", label: "Tool Registry", icon: IconTool, visible: canManageToolRegistry },
  { to: "/admin/activity", label: "Activity Log", icon: IconActivity, visible: canViewActivityLog },
];

interface SidebarProps {
  role: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ role, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const items = NAV_ITEMS.filter((item) => item.visible(role));

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          TP
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            Task Platform
          </span>
        )}
        <button
          onClick={onCloseMobile}
          className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
          aria-label="Close menu"
        >
          <IconX className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onCloseMobile}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "",
                isActive
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
              ].join(" ")
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={onToggleCollapsed}
        className="hidden items-center justify-center gap-2 border-t border-slate-200 py-3 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 md:flex"
      >
        {collapsed ? <IconChevronsRight className="h-4 w-4" /> : <IconChevronsLeft className="h-4 w-4" />}
        {!collapsed && "Collapse"}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={[
          "hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 md:block",
          collapsed ? "w-16" : "w-64",
        ].join(" ")}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      <div
        className={[
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
      >
        <div
          onClick={onCloseMobile}
          className={[
            "absolute inset-0 bg-slate-900/50 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
        <aside
          className={[
            "absolute inset-y-0 left-0 w-64 bg-white shadow-xl transition-transform duration-200 dark:bg-slate-900",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          {content}
        </aside>
      </div>
    </>
  );
}
