import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Create from "./pages/Create";
import Creation from "./pages/Creation";
import Finalize from "./pages/Finalize";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Register from "./pages/Register";
// ⬇️ FUNDO ANIMADO
import ShaderBackground from "@/components/ShaderBackground";
// ⬇️ Barra de progresso no topo
import TopProgressBar from "@/components/TopProgressBar";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        {/* Canvas do fundo (fixo e atrás de tudo) */}
        <ShaderBackground />

        {/* Conteúdo do app acima do fundo */}
        <div className="relative z-10 min-h-screen is-glassy">
          <BrowserRouter>
            <TopProgressBar />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/create" element={<Create />} />
              <Route path="/creation" element={<Creation />} />
              <Route path="/finalize" element={<Finalize />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>

          {/* Toasters mantidos normalmente */}
          <Toaster />
          <Sonner />
        </div>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
