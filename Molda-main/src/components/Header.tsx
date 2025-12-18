import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { User, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { supabase } from "../integrations/supabase/client";
import { AVATAR_BUCKET } from "../lib/constants/storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import SparkleButton from "./SparkleButton";

const Header = () => {
  const { user, signOut, loading, getProfile } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const fallback = user?.user_metadata?.avatar_url ?? null;
    setAvatarUrl(fallback);

    if (!user) {
      return () => {
        mounted = false;
      };
    }

    const loadAvatar = async () => {
      try {
        const profile = await getProfile();
        if (!mounted) return;
        if (profile?.avatar_path) {
          const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatar_path);
          if (data?.publicUrl) {
            setAvatarUrl(data.publicUrl);
            return;
          }
        }
      } catch {
        /* silently ignore */
      }
      if (mounted) {
        setAvatarUrl(fallback);
      }
    };

    loadAvatar();

    return () => {
      mounted = false;
    };
  }, [user, getProfile]);

  const getUserInitials = () => {
    const parts = (user?.user_metadata?.full_name || "U S").split(" ");
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Você saiu da sua conta.");
      navigate("/");
    } catch {
      toast.error("Erro ao sair da conta.");
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b glass-strong">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--brand-keppel))_100%)]" />
          <span className="font-semibold tracking-tight">Molda</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <SparkleButton to="/create" ariaLabel="Criar" className="text-sm" >
            Criar
          </SparkleButton>
        </nav>

        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-8 h-8 animate-pulse bg-gray-200 rounded-full" />
          ) : !user ? (
            <>
              <Button
                variant="outline"
                onClick={() => navigate("/login")}
                className="rounded-full px-6"
              >
                Login
              </Button>
              <Button
                variant="cta"
                onClick={() => navigate("/register")}
                className="rounded-full px-6"
              >
                Registrar
              </Button>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="rounded-full p-0 hover:bg-[hsl(var(--muted))]"
                >
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-keppel))] text-white">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
