
import Header from "../components/Header";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <Header />
      
      <main >
        {/* Hero Section */}
        <section className="container mx-auto px-6 py-20 text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-800 mb-6 leading-tight">
              Crie Roupas
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent block">
                Personalizadas
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
              Transforme suas ideias em peças únicas. Design intuitivo, personalização completa e produção de qualidade.
            </p>
            
            <Button 
              onClick={() => navigate("/create")}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-8 py-4 text-lg rounded-full font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              Começar Agora
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </section>

        {/* Como Funciona */}
        <section className="container mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-16">
            Como Funciona
          </h2>
          
          <div className="grid md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-white font-bold text-xl">1</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Escolha o Tipo</h3>
              <p className="text-gray-600">
                Selecione a parte do corpo e o tipo de peça que deseja criar
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-white font-bold text-xl">2</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Personalize</h3>
              <p className="text-gray-600">
                Use nossas ferramentas para adicionar cores, textos e desenhos únicos
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-white font-bold text-xl">3</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Finalize</h3>
              <p className="text-gray-600">
                Salve sua criação, compartilhe ou envie para produção
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
