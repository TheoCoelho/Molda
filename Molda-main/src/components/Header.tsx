import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Building2, Moon, Shield, Sun, User, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
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
  const { theme, toggleTheme } = useTheme();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const fallback = user?.user_metadata?.avatar_url ?? null;
    setAvatarUrl(fallback);

    if (!user?.id) {
      return () => {
        mounted = false;
      };
    }

    const loadAvatar = async () => {
      try {
        const profile = await getProfile();
        if (!mounted) return;
        setRole(profile?.role ?? null);
        if (profile?.avatar_path) {
          setAvatarUrl(profile.avatar_path);
          return;
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
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="relative mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-3 sm:px-4 lg:px-6 xl:px-10 2xl:px-14">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--brand-keppel))_100%)]" />
          <span className="text-sm font-semibold tracking-tight">Molda</span>
        </Link>

        <div className="absolute left-1/2 -translate-x-1/2 md:hidden">
          <SparkleButton to="/create" ariaLabel="Criar" className="sp-compact" >
            Criar
          </SparkleButton>
        </div>

        <nav className="hidden md:flex items-center gap-4 text-xs sm:text-sm">
          <SparkleButton to="/create" ariaLabel="Criar" className="text-sm" >
            Criar
          </SparkleButton>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            className="h-7 w-7 rounded-full"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>
          {loading ? (
            <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200" />
          ) : !user?.id ? (
            <>
              <Button
                variant="outline"
                onClick={() => navigate("/login")}
                className="h-7 rounded-full px-3 text-xs"
              >
                Login
              </Button>
              <Button
                variant="cta"
                onClick={() => navigate("/register")}
                className="h-7 rounded-full px-3 text-xs"
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
                  <Avatar className="h-8 w-8">
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
                {role === "factory" || role === "admin" ? (
                  <DropdownMenuItem onClick={() => navigate("/factory")}>
                    <Building2 className="mr-2 h-4 w-4" />
                    Painel da fábrica
                  </DropdownMenuItem>
                ) : null}
                {role === "admin" ? (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Shield className="mr-2 h-4 w-4" />
                    Administração
                  </DropdownMenuItem>
                ) : null}
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
