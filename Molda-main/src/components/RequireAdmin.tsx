import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type Props = {
  children: ReactNode;
};

export default function RequireAdmin({ children }: Props) {
  const { user, loading, getProfile } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
        setIsAdmin(profile?.role === "admin");
      } catch {
        if (mounted) setIsAdmin(false);
      } finally {
        if (mounted) setChecking(false);
      }
    };

    checkRole();
    return () => {
      mounted = false;
    };
  }, [getProfile, loading, user]);

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

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
