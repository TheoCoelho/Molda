// src/pages/Register.tsx
import React, { useState } from "react";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Mail, Phone, Calendar, IdCard, Lock, UserCircle2 } from "lucide-react";

function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}
function clamp11(v: string) {
  return onlyDigits(v).slice(0, 11); // CPF e celular (DDD + número)
}

const Register: React.FC = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState(""); // yyyy-mm-dd
  const [cpf, setCpf] = useState("");

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // disponibilidade
  const [emailTaken, setEmailTaken] = useState<boolean | null>(null);
  const [cpfTaken, setCpfTaken] = useState<boolean | null>(null);
  const [phoneTaken, setPhoneTaken] = useState<boolean | null>(null);
  const [usernameTaken, setUsernameTaken] = useState<boolean | null>(null);

  async function checkAvailability({
    checkEmail,
    checkCpf,
    checkPhone,
    checkUsername,
  }: {
    checkEmail?: boolean;
    checkCpf?: boolean;
    checkPhone?: boolean;
    checkUsername?: boolean;
  }) {
    if (!checkEmail && !checkCpf && !checkPhone && !checkUsername) return;

    const { data, error } = await supabase.rpc("check_availability", {
      p_email:    checkEmail    ? email.trim()    : null,
      p_cpf:      checkCpf      ? clamp11(cpf)    : null,
      p_phone:    checkPhone    ? clamp11(phone)  : null,
      p_username: checkUsername ? username.trim() : null,
    });

    if (error) {
      console.error("Falha ao checar disponibilidade:", error);
      return;
    }

    const d = (data as any) || {};
    if (checkEmail)    setEmailTaken(Boolean(d.email_taken));
    if (checkCpf)      setCpfTaken(Boolean(d.cpf_taken));
    if (checkPhone)    setPhoneTaken(Boolean(d.phone_taken));
    if (checkUsername) setUsernameTaken(Boolean(d.username_taken));
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);

    if (password !== confirm) {
      setErrMsg("As senhas não conferem.");
      return;
    }

    const normalizedPhone = clamp11(phone);
    const normalizedCpf = clamp11(cpf);

    if (!normalizedPhone || normalizedPhone.length !== 11) {
      setErrMsg("Telefone é obrigatório e deve ter 11 dígitos (DDD + número).");
      return;
    }
    if (!birthDate) {
      setErrMsg("Data de nascimento é obrigatória.");
      return;
    }
    if (!normalizedCpf || normalizedCpf.length !== 11) {
      setErrMsg("CPF é obrigatório e deve ter 11 dígitos.");
      return;
    }

    // Checagem final
    {
      const { data, error } = await supabase.rpc("check_availability", {
        p_email: email.trim(),
        p_cpf: normalizedCpf,
        p_phone: normalizedPhone,
        p_username: username.trim(),
      });

      if (error) {
        setErrMsg("Erro ao verificar disponibilidade. Tente novamente.");
        return;
      }

      const { email_taken, cpf_taken, phone_taken, username_taken } = (data as any) || {};
      setEmailTaken(Boolean(email_taken));
      setCpfTaken(Boolean(cpf_taken));
      setPhoneTaken(Boolean(phone_taken));
      setUsernameTaken(Boolean(username_taken));

      if (email_taken)    { setErrMsg("Este e-mail já está cadastrado."); return; }
      if (cpf_taken)      { setErrMsg("Este CPF já está cadastrado."); return; }
      if (phone_taken)    { setErrMsg("Este número de celular já está sendo usado."); return; }
      if (username_taken) { setErrMsg("Este nome de usuário já está em uso."); return; }
    }

    setLoading(true);

const { error } = await signUp({
  email: email.trim(),
  password,
  nickname: fullName.trim(),         // << TROCAR nickname -> nickname
  username: username.trim(),
  phone: normalizedPhone,
  birth_date: birthDate,             // ou birthISO, mantenha o que você já usa
  cpf: normalizedCpf,
});


    setLoading(false);

    if (error) {
      const msg = error.message || "Falha ao criar conta";
      if (/User already registered/i.test(msg)) {
        setEmailTaken(true);
        setErrMsg("Este e-mail já está cadastrado.");
      } else if (/duplicate key value/i.test(msg) && /cpf/i.test(msg)) {
        setCpfTaken(true);
        setErrMsg("Este CPF já está cadastrado.");
      } else if (/duplicate key value/i.test(msg) && /username/i.test(msg)) {
        setUsernameTaken(true);
        setErrMsg("Este nome de usuário já está em uso.");
      } else {
        setErrMsg(msg);
      }
      return;
    }

    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen ">
      <Header />
      <main className="pt-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24">
          <div className="max-w-xl mx-auto">
            <Card className="shadow-lg border border-gray-200/60">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-gray-800">Criar conta</CardTitle>
                <CardDescription className="text-gray-600">
                  Junte-se à StyleCraft e personalize suas roupas do seu jeito
                </CardDescription>
              </CardHeader>

              <CardContent>
                {errMsg && (
                  <div className="mb-4 text-sm text-red-600 border border-red-200 bg-red-50 p-2 rounded">
                    {errMsg}
                  </div>
                )}

                <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Apelido */}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="nickname">Apelido </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="nickname"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder=""
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>

                  {/* Username */}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="username">Usuário</Label>
                    <div className="relative">
                      <UserCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => { setUsername(e.target.value); setUsernameTaken(null); }}
                        onBlur={() => checkAvailability({ checkUsername: true })}
                        placeholder="seu_usuario"
                        className={[
                          "pl-9",
                          usernameTaken === true ? "border-red-400" : "",
                          usernameTaken === false && username ? "border-green-500" : "",
                        ].join(" ")}
                        required
                      />
                    </div>
                    {usernameTaken === true && (
                      <p className="text-xs text-red-600">Este nome de usuário já está em uso.</p>
                    )}
                    {usernameTaken === false && username && (
                      <p className="text-xs text-green-600">Nome de usuário disponível.</p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setEmailTaken(null); }}
                        onBlur={() => checkAvailability({ checkEmail: true })}
                        placeholder="voce@exemplo.com"
                        className={["pl-9", emailTaken ? "border-red-400" : ""].join(" ")}
                        required
                      />
                    </div>
                    {emailTaken === true && (
                      <p className="text-xs text-red-600">Este e-mail já está cadastrado.</p>
                    )}
                  </div>

                  {/* Senha */}
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

                  {/* Confirmar senha */}
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirmar senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="confirm"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="••••••••"
                        className="pl-9"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  {/* Telefone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone (11 dígitos)</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => { const v = clamp11(e.target.value); setPhone(v); setPhoneTaken(null); }}
                        onBlur={() => checkAvailability({ checkPhone: true })}
                        placeholder="(DDD) + número — apenas dígitos"
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={11}
                        className={["pl-9", phoneTaken ? "border-red-400" : ""].join(" ")}
                        required
                      />
                    </div>
                    {phoneTaken === true && (
                      <p className="text-xs text-red-600">Este número de celular já está sendo usado.</p>
                    )}
                  </div>

                  {/* Data de nascimento */}
                  <div className="space-y-2">
                    <Label htmlFor="birth">Data de nascimento</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="birth"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>

                  {/* CPF */}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="cpf">CPF (11 dígitos)</Label>
                    <div className="relative">
                      <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                      <Input
                        id="cpf"
                        value={cpf}
                        onChange={(e) => { const v = clamp11(e.target.value); setCpf(v); setCpfTaken(null); }}
                        onBlur={() => checkAvailability({ checkCpf: true })}
                        placeholder="Apenas dígitos"
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={11}
                        className={["pl-9", cpfTaken ? "border-red-400" : ""].join(" ")}
                        required
                      />
                    </div>
                    {cpfTaken === true && (
                      <p className="text-xs text-red-600">Este CPF já está cadastrado.</p>
                    )}
                  </div>

                  {/* Submit */}
                  <div className="md:col-span-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium transition-all duration-300"
                    >
                      {loading ? "Criando..." : "Criar conta"}
                    </Button>
                  </div>

                  <p className="md:col-span-2 text-sm text-gray-600 text-center">
                    Já tem conta?{" "}
                    <Link to="/login" className="underline decoration-purple-400 hover:text-purple-600">
                      Entrar
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

export default Register;
