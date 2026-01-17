# Molda-13 / Molda-main: Documentação Detalhada

## Visão Geral

Este projeto é uma plataforma avançada para customização, visualização e manipulação de modelos 3D de camisetas, com foco em aplicações de design, moda e e-commerce. Ele integra múltiplos engines, bibliotecas modernas de frontend, renderização 3D, manipulação de texturas, decalques e integração com serviços externos. O objetivo é fornecer uma experiência rica e interativa para usuários finais e desenvolvedores.

## Estrutura do Projeto

O repositório é composto por dois diretórios principais:

- **decal-engine/**: Engine de decalques e manipulação 3D, com exemplos, assets e lógica de engine.
- **Molda-main/**: Aplicação principal, interface de usuário, integração com engines, componentes React, assets, scripts e configuração.

### Principais Pastas e Arquivos

- **public/**: Assets estáticos (modelos 3D, imagens, HDRIs, texturas)
- **src/**: Código-fonte principal (componentes, hooks, contextos, utilitários, integrações)
- **components/**: Componentes React reutilizáveis para UI e manipulação 3D
- **contexts/**: Contextos React para gerenciamento de estado global (ex: autenticação, sincronização de decalques)
- **fonts/**: Gerenciamento e integração de fontes (Google Fonts, biblioteca própria)
- **hooks/**: Hooks customizados para funcionalidades específicas
- **lib/**: Utilitários e módulos de lógica (ex: padrões CSS, manipulação de dados)
- **pages/**: Páginas da aplicação (caso utilize roteamento)
- **supabase/**: Integração com Supabase para autenticação, banco de dados e storage
- **scripts/**: Scripts utilitários (ex: geração de fontes)
- **Configuração**: Arquivos de configuração para Vite, Tailwind, ESLint, TypeScript, PostCSS, etc.

## Funcionalidades Principais

### 1. Visualização 3D Interativa
- Renderização de modelos 3D de camisetas com Three.js/R3F
- Suporte a múltiplos modelos (masculino, feminino, manga longa, oversized, etc.)
- Iluminação HDRI realista
- Manipulação de câmera, zoom, rotação e movimentação

### 2. Engine de Decalques
- Aplicação de decalques (imagens, padrões, textos) sobre superfícies 3D
- Sincronização entre canvas 2D e modelo 3D
- Ferramentas de posicionamento, escala e rotação de decalques
- Suporte a múltiplas camadas de decalques

### 3. Editor 2D
- Editor 2D para criação e manipulação de estampas
- Ferramentas de texto, seleção de fontes, upload de imagens
- Carrossel de padrões e texturas
- Sincronização em tempo real com o modelo 3D

### 4. Gerenciamento de Fontes
- Integração com Google Fonts
- Biblioteca de fontes favoritas e recentes
- Pré-visualização e seleção dinâmica de fontes

### 5. Galeria de Imagens e Texturas
- Galeria de imagens para seleção rápida de estampas
- Organização por categorias (animais, geométricos, abstratos, etc.)
- Upload e gerenciamento de imagens do usuário

### 6. Autenticação e Integração com Supabase
- Login e registro de usuários
- Armazenamento de projetos, imagens e preferências no Supabase
- Sincronização de dados entre dispositivos

### 7. UI/UX Avançada
- Componentes customizados (carrosséis, toolbars, sidebars, overlays)
- Barra de progresso, timers, botões animados
- Layout responsivo e otimizado para mobile

### 8. Scripts e Automatizações
- Geração automática de fontes Google
- Scripts para build, lint, formatação e deploy

## Tecnologias Utilizadas

- **React** (com TypeScript)
- **Three.js** / **react-three-fiber** (R3F)
- **Vite** (build tool)
- **Tailwind CSS** (estilização)
- **Supabase** (backend as a service)
- **PostCSS**, **ESLint**, **Prettier** (qualidade e padronização)

## Fluxo de Uso

1. Usuário acessa a aplicação e faz login (opcional)
2. Seleciona um modelo 3D de camiseta
3. Utiliza o editor 2D para criar ou importar estampas
4. Aplica decalques e texturas no modelo 3D
5. Visualiza o resultado em tempo real, ajustando posição, escala e rotação
6. Salva o projeto, exporta imagens ou compartilha

## Pontos de Extensão para IA (Prompt Engineering)

- **Geração automática de estampas e padrões via prompts**
- **Sugestão de combinações de cores, fontes e layouts**
- **Análise de tendências de moda e recomendações personalizadas**
- **Automação de posicionamento de decalques com base em descrições textuais**
- **Geração de prompts para Copilot sugerindo novos recursos, componentes ou fluxos de UI**

## Observações para Agentes de IA

- O projeto é modular e extensível, facilitando a integração de novos engines, modelos ou fluxos de IA
- Os prompts podem ser utilizados para automação de tarefas, geração de conteúdo visual, sugestões de UI/UX e integração com Copilot
- A documentação de cada componente e engine está distribuída nos próprios arquivos e comentários do código

## Como Rodar o Projeto

1. Instale as dependências em ambos os diretórios (`npm install`)
2. Configure variáveis de ambiente e Supabase conforme necessário
3. Rode o projeto principal com `npm run dev` em `Molda-main`
4. Acesse via navegador para explorar as funcionalidades

## Contato e Contribuição

- Para dúvidas, sugestões ou contribuições, utilize o README.md principal ou abra issues no repositório.
- Siga as convenções de código e utilize os scripts de lint/format antes de enviar PRs.

---
