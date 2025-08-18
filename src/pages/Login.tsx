// src/pages/Login.tsx
import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useLocation } from "react-router-dom";

const Login: React.FC = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    setLoading(true);

    const { error } = await signIn({ email, password });

    setLoading(false);

    if (error) {
      setErrMsg(error.message ?? "Falha no login");
      return;
    }

    navigate(from, { replace: true });
  };

  return (
    <div className="max-w-md mx-auto py-10">
      <h1 className="text-2xl font-semibold mb-6">Entrar</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {errMsg && <div className="text-red-600 text-sm">{errMsg}</div>}

        <div>
          <label className="block text-sm mb-1">E-mail</label>
          <input
            type="email"
            className="w-full border rounded p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="voce@exemplo.com"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Senha</label>
          <input
            type="password"
            className="w-full border rounded p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black text-white py-2"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-sm text-gray-600">
          Não tem conta? <Link to="/register" className="underline">Criar conta</Link>
        </p>
      </form>
    </div>
  );
};

export default Login;
