import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { LoginPage } from "./components/LoginPage";
import { AppLayout } from "./components/layout/AppLayout";
import { RequireRole } from "./components/RequireRole";
import { ToastProvider } from "./components/ToastProvider";
import { DashboardPage } from "./pages/DashboardPage";
import { MyTasksPage } from "./pages/MyTasksPage";
import { AllTasksPage } from "./pages/AllTasksPage";
import { TeamPage } from "./pages/TeamPage";
import { UsersPage } from "./pages/UsersPage";
import { RolesPage } from "./pages/RolesPage";
import { ToolRegistryPage } from "./pages/ToolRegistryPage";
import { ActivityLogPage } from "./pages/ActivityLogPage";
import { ReportsPage } from "./pages/ReportsPage";
import {
  canManageRoles,
  canManageTasks,
  canManageToolRegistry,
  canManageUsers,
  canViewActivityLog,
  canViewReports,
  canViewUsers,
} from "./lib/permissions";

function AppRoutes() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route
          path="tasks"
          element={
            <RequireRole allow={canManageTasks}>
              <AllTasksPage />
            </RequireRole>
          }
        />
        <Route
          path="team"
          element={
            <RequireRole allow={canViewUsers}>
              <TeamPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireRole allow={canManageUsers}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/roles"
          element={
            <RequireRole allow={canManageRoles}>
              <RolesPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/tools"
          element={
            <RequireRole allow={canManageToolRegistry}>
              <ToolRegistryPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/activity"
          element={
            <RequireRole allow={canViewActivityLog}>
              <ActivityLogPage />
            </RequireRole>
          }
        />
        <Route
          path="reports"
          element={
            <RequireRole allow={canViewReports}>
              <ReportsPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
