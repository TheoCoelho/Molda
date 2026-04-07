import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type RequireRoleProps = {
  children: ReactNode;
  allowedRoles: Array<"admin" | "factory" | "editor" | "viewer">;
};

export default function RequireRole({ children, allowedRoles }: RequireRoleProps) {
  const { user, loading, getProfile } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkRole = async () => {
      if (loading) return;
      if (!user) {
        if (mounted) setChecking(false);
        return;
      }

      try {
        const profile = await getProfile();
        if (!mounted) return;
        setHasAccess(Boolean(profile?.role && allowedRoles.includes(profile.role)));
      } catch {
        if (mounted) setHasAccess(false);
      } finally {
        if (mounted) setChecking(false);
      }
    };

    void checkRole();
    return () => {
      mounted = false;
    };
  }, [allowedRoles, getProfile, loading, user]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Validando acesso...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}