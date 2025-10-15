// src/pages/Login.tsx
import React, { useState } from "react";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Lock } from "lucide-react";

const Login: React.FC = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    setLoading(true);

    try {
      const { error } = await signIn({ email: email.trim(), password });
      if (error) {
        const msg = error.message || "Falha no login";
        if (/email.*not.*confirmed/i.test(msg) || /Email not confirmed/i.test(msg)) {
          setErrMsg("E-mail não confirmado. Verifique sua caixa de entrada e confirme o cadastro.");
        } else if (/invalid login credentials/i.test(msg)) {
          setErrMsg("Credenciais inválidas. Verifique e tente novamente.");
        } else {
          setErrMsg(msg);
        }
        return;
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      setErrMsg(err?.message ?? "Erro inesperado ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24">
        <div className="container mx-auto px-6">
          <div className="max-w-md mx-auto">
            <Card className="shadow-lg border border-gray-200/60">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-gray-800">Entrar</CardTitle>
                <CardDescription className="text-gray-600">
                  Acesse sua conta para continuar criando suas peças
                </CardDescription>
              </CardHeader>

              <CardContent>
                {errMsg && (
                  <div className="mb-4 text-sm text-red-600 border border-red-200 bg-red-50 p-2 rounded">
                    {errMsg}
                  </div>
                )}

                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="voce@exemplo.com"
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-9"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium transition-all duration-300"
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>

                  <p className="text-sm text-gray-600 text-center">
                    Ainda não tem conta?{" "}
                    <Link to="/register" className="underline decoration-purple-400 hover:text-purple-600">
                      Criar conta
                    </Link>
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
