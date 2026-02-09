
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Share2, Save, Send } from "lucide-react";

const Finalize = () => {
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState<any>(null);
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem('currentProject');
    if (data) {
      setProjectData(JSON.parse(data));
    }
  }, []);

  const handleSaveCreation = () => {
    // Lógica para salvar a criação
    console.log('Salvando criação...', { ...projectData, isPublic });
    navigate('/profile');
  };

  const handleSaveDraft = () => {
    // Lógica para salvar como rascunho
    console.log('Salvando rascunho...', { ...projectData, isPublic });
    navigate('/profile');
  };

  const handleSendToProduction = () => {
    // Lógica para enviar para produção
    console.log('Enviando para produção...', projectData);
    alert('Sua peça foi enviada para produção! Em breve você receberá um email com os detalhes.');
  };

  if (!projectData) {
    return (
      <div className="min-h-screen ">
        <Header />
        <div className="pt-24 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 text-center">
          <p className="text-gray-600">Nenhum projeto encontrado.</p>
          <Button onClick={() => navigate('/create')} className="mt-4">
            Criar Novo Projeto
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <Header />
      
      <main className="pt-24 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Cabeçalho */}
          <div className="flex items-center gap-4 mb-8">
            <Button
              variant="outline"
              onClick={() => navigate('/creation')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para Edição
            </Button>
            
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Finalizar Criação
              </h1>
              <p className="text-gray-600">
                Revise suas especificações e escolha o que fazer com sua criação
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Visualização Final */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Visualização Final</span>
                  <Badge variant="secondary">
                    {projectData.part} - {projectData.type}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="w-full h-80 rounded-lg flex items-center justify-center text-white font-medium text-lg shadow-inner"
                  style={{ backgroundColor: projectData.baseColor }}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">{projectData.type}</div>
                    <div className="text-lg opacity-90">{projectData.subtype}</div>
                    <div className="text-sm opacity-75 mt-2">
                      {projectData.projectName || 'Minha Criação'}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Label htmlFor="public-toggle" className="text-sm font-medium">
                      Tornar público
                    </Label>
                    <Switch
                      id="public-toggle"
                      checked={isPublic}
                      onCheckedChange={setIsPublic}
                    />
                  </div>
                  
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Share2 className="w-4 h-4" />
                    Compartilhar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Especificações */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Especificações do Projeto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Nome do Projeto</Label>
                    <p className="text-gray-800 font-medium">
                      {projectData.projectName || 'Sem nome'}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Tipo</Label>
                    <p className="text-gray-800 font-medium">
                      {projectData.type} - {projectData.subtype}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Cor Base</Label>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full border-2 border-gray-300"
                        style={{ backgroundColor: projectData.baseColor }}
                      />
                      <span className="text-gray-800 font-medium">
                        {projectData.baseColor}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Tamanho</Label>
                    <p className="text-gray-800 font-medium">{projectData.size}</p>
                  </div>
                  
                  <div className="col-span-2">
                    <Label className="text-sm font-medium text-gray-600">Tecido</Label>
                    <p className="text-gray-800 font-medium">
                      {projectData.fabric === 'algodao' && '100% Algodão'}
                      {projectData.fabric === 'poliester' && 'Poliéster'}
                      {projectData.fabric === 'misto' && 'Misto'}
                      {projectData.fabric === 'linho' && 'Linho'}
                    </p>
                  </div>
                </div>

                {/* Ações Principais */}
                <div className="pt-6 space-y-3">
                  <Button
                    onClick={handleSendToProduction}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium py-3 text-lg"
                  >
                    <Send className="w-5 h-5 mr-2" />
                    Enviar para Produção
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleSaveCreation}
                      variant="outline"
                      className="py-3 font-medium border-purple-300 text-purple-700 hover:bg-purple-50"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Criação
                    </Button>
                    
                    <Button
                      onClick={handleSaveDraft}
                      variant="outline"
                      className="py-3 font-medium"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Rascunho
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Finalize;
