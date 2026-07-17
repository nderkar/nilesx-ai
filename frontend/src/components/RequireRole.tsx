import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function RequireRole({
  allow,
  children,
}: {
  allow: (role: string) => boolean;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !allow(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
