// src/pages/Profile.tsx
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type ViewUser = {
  id?: string;
  name: string;
  username?: string;
  email?: string;
  avatar?: string;       // URL pronta para exibição
  createdAt?: string;
};

const BUCKET = "avatars";

const Profile = () => {
  const { user: authUser, session, getProfile } = useAuth();

  const [user, setUser] = useState<ViewUser>({
    name: "Usuário",
    username: "",
    email: "",
    avatar: "",
    createdAt: "Janeiro 2024",
  });

  // Estado do upload (mantido)
  const [openUpload, setOpenUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Dados mock das seções (restaurados)
  const [creations] = useState([
    { id: 1, title: "Camiseta Street", date: "10/01/2024", status: "finalizada" as const, thumbnail: "/api/placeholder/200/120" },
    { id: 2, title: "Moletom Minimal", date: "05/01/2024", status: "rascunho" as const,   thumbnail: "/api/placeholder/200/120" },
    { id: 3, title: "Jaqueta Retrô",   date: "28/12/2023", status: "producao" as const,   thumbnail: "/api/placeholder/200/120" },
  ]);

  const [savedElements] = useState([
    { id: 1, type: "image", name: "Logo Empresa", preview: "/api/placeholder/100/100" },
    { id: 2, type: "text",  name: "Frase Motivacional", content: "Seja a mudança" },
    { id: 3, type: "drawing", name: "Desenho Abstrato", preview: "/api/placeholder/100/100" },
    { id: 4, type: "pattern", name: "Padrão Geométrico", preview: "/api/placeholder/100/100" },
  ]);

  // Carrega profile e converte avatar_path -> publicUrl (mantido)
  useEffect(() => {
    const load = async () => {
      const createdAtStr = session?.user?.created_at
        ? new Date(session.user.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
        : "";

      let display: ViewUser = {
        id: authUser?.id,
        name:
          (authUser?.user_metadata as any)?.full_name ||
          (authUser?.user_metadata as any)?.name ||
          "Usuário",
        username: (authUser?.user_metadata as any)?.username || "",
        email: authUser?.email || "",
        avatar: "",
        createdAt: createdAtStr || "Janeiro 2024",
      };

      try {
        const prof = await getProfile();
        if (prof) {
          let avatarUrl = "";
          if (prof.avatar_path) {
            const { data } = supabase.storage.from(BUCKET).getPublicUrl(prof.avatar_path);
            avatarUrl = data.publicUrl;
          }

          display = {
            ...display,
            name: prof.full_name || display.name,
            username: prof.username || display.username,
            email: prof.email ?? display.email,
            avatar: avatarUrl,
          };
        }
      } catch {
        /* silencioso */
      }

      setUser(display);
    };
    load();
  }, [authUser, session, getProfile]);

  const getStatusBadge = (status: "finalizada" | "rascunho" | "producao") => {
    switch (status) {
      case "finalizada":
        return <Badge className="bg-green-100 text-green-800">Finalizada</Badge>;
      case "rascunho":
        return <Badge variant="secondary">Rascunho</Badge>;
      case "producao":
        return <Badge className="bg-blue-100 text-blue-800">Em produção</Badge>;
    }
  };

  const getAvatarFallback = (name: string) => {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (name[0] || "U").toUpperCase();
  };

  // ===== Upload (mantido) =====
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setSelectedFile(f || null);
    setPreviewUrl(f ? URL.createObjectURL(f) : "");
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    if (!authUser?.id) throw new Error("Usuário não autenticado");

    const path = `${authUser.id}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (upErr) throw upErr;

    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("id", authUser.id);
    if (updErr) throw updErr;

    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleSaveAvatar = async () => {
    if (!selectedFile) return;
    if (selectedFile.size > 5 * 1024 * 1024) {
      alert("Tamanho máximo 5MB");
      return;
    }
    setSaving(true);
    try {
      const url = await uploadAvatar(selectedFile);
      setUser((prev) => ({ ...prev, avatar: url })); // mantém atualização imediata
      setOpenUpload(false);
      setSelectedFile(null);
      setPreviewUrl("");
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar avatar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
<div className="h-20" /> {/* Espaçador para compensar o header fixo */}
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Banner de perfil */}
        <Card className="mb-6">
          <CardHeader className="py-6">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                {/* Avatar com hover + caneta (mantido) */}
                <div className="relative group">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback>{getAvatarFallback(user.name)}</AvatarFallback>
                  </Avatar>
                  <button
                    aria-label="Editar foto de perfil"
                    onClick={() => setOpenUpload(true)}
                    className="hidden group-hover:flex absolute inset-0 items-center justify-center rounded-full bg-black/40"
                    title="Editar foto"
                  >
                    <Pencil className="w-5 h-5 text-white" />
                  </button>
                </div>

                <div>
                  <h1 className="text-2xl font-semibold">{user.name}</h1>
                  <p className="text-gray-600 mb-1">{user.username || user.email}</p>
                  <p className="text-sm text-gray-500">Membro desde {user.createdAt}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Editar Perfil
                </Button>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{creations.length}</div>
                  <div className="text-xs text-gray-500">Criações</div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* ===== Seções abaixo do banner (RESTauradas) ===== */}
        <Tabs defaultValue="creations" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
            <TabsTrigger value="creations">Minhas Peças</TabsTrigger>
            <TabsTrigger value="elements">Elementos Salvos</TabsTrigger>
          </TabsList>

          {/* Minhas Peças */}
          <TabsContent value="creations" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Minhas Peças</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Todas</Button>
                <Button variant="outline" size="sm">Finalizadas</Button>
                <Button variant="outline" size="sm">Rascunhos</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {creations.map((item) => (
                <Card key={item.id} className="shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      {getStatusBadge(item.status)}
                    </div>
                    <p className="text-sm text-gray-500">Criado em {item.date}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="aspect-video w-full overflow-hidden rounded-md bg-muted mb-4" />
                    <div className="flex gap-2">
                      <Button variant="outline" className="w-full">Editar</Button>
                      <Button className="w-full">Produzir</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Elementos Salvos */}
          <TabsContent value="elements" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Elementos Salvos</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Todos</Button>
                <Button variant="outline" size="sm">Imagens</Button>
                <Button variant="outline" size="sm">Textos</Button>
                <Button variant="outline" size="sm">Desenhos</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedElements.map((el: any) => (
                <Card key={el.id} className="shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{el.name}</CardTitle>
                    <p className="text-sm text-gray-500">Tipo: {el.type}</p>
                  </CardHeader>
                  <CardContent>
                    {"preview" in el ? (
                      <div className="aspect-square w-full overflow-hidden rounded-md bg-muted mb-4">
                        <img
                          src={el.preview}
                          alt={el.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="rounded-md border p-4 mb-4">
                        <p className="text-gray-700">{el.content}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" className="w-full">Editar</Button>
                      <Button className="w-full">Adicionar à peça</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog de upload (inalterado) */}
      <Dialog open={openUpload} onOpenChange={setOpenUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar foto de perfil</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {previewUrl ? (
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={previewUrl} />
                  <AvatarFallback>{getAvatarFallback(user.name)}</AvatarFallback>
                </Avatar>
                <div className="text-sm text-gray-600">Pré-visualização</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Selecione uma imagem (JPG/PNG até ~5MB).</div>
            )}

            <input
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border file:px-4 file:py-2 file:text-sm file:font-medium file:bg-white file:hover:bg-gray-50"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenUpload(false)}>Cancelar</Button>
            <Button onClick={handleSaveAvatar} disabled={!selectedFile || saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
