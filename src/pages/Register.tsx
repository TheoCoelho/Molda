// src/pages/Register.tsx
import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";

const Register: React.FC = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    setLoading(true);

    const { error } = await signUp({
      email,
      password,
      full_name: fullName,
      username,
    });

    setLoading(false);

    if (error) {
      setErrMsg(error.message ?? "Falha ao registrar");
      return;
    }

    // Se exigir confirmação de e-mail, avisamos o usuário.
    // Caso contrário, ele já estará logado e pode ser redirecionado.
    navigate("/login", { replace: true });
  };

  return (
    <div className="max-w-md mx-auto py-10">
      <h1 className="text-2xl font-semibold mb-6">Criar conta</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {errMsg && <div className="text-red-600 text-sm">{errMsg}</div>}

        <div>
          <label className="block text-sm mb-1">Nome completo</label>
          <input
            className="w-full border rounded p-2"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="Ex.: Maria Souza"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Username</label>
          <input
            className="w-full border rounded p-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="Ex.: maria.souza"
          />
        </div>

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
          {loading ? "Criando..." : "Criar conta"}
        </button>

        <p className="text-sm text-gray-600">
          Já tem conta? <Link to="/login" className="underline">Entrar</Link>
        </p>
      </form>
    </div>
  );
};

export default Register;
