# 🚀 Agente Otimizador de Performance - Molda

Agente inteligente para otimizar performance, fluidez e velocidade do projeto **Molda-14** sem remover nenhuma funcionalidade.

## 📋 Funcionalidades

### 1. **Análise de Bundle**
- Identifica dependências desnecessárias
- Detecta duplicações de pacotes
- Sugere alternativas mais leves
- Gera relatório visual

### 2. **Code Splitting Automático**
- Implementa lazy loading em componentes heavy
- Otimiza rotas com suspense
- Cria bundles separados para features

### 3. **Análise de Componentes**
- Identifica re-renders desnecessários
- Detecta props drilling
- Sugere memoization estratégica

### 4. **Otimização de Imagens e Assets**
- Redimensiona imagens automaticamente
- Converte para formatos otimizados (WebP)
- Implementa lazy loading
- Gera srcsets responsivos

### 5. **Performance Monitoring**
- Coleta métricas de Lighthouse
- Monitora Core Web Vitals
- Gera dashboard de performance

### 6. **Otimização de Vite Config**
- Implementa compressão
- Configura sourcemaps
- Otimiza rollup config
- Lazy loading de workers

## 🛠️ Como Usar

### Instalação
```bash
cd optimization-agent
npm install
```

### Executar Agente Completo
```bash
npm run optimize:full
```

### Executar Agente de Branding Visual (autônomo)
```bash
npm run design:brand -- --brief ./brand-brief.example.json
```

Com saída customizada:
```bash
npm run design:brand -- --brief ./brand-brief.example.json --out ./reports/brand-pack-custom
```

### Executar Análises Específicas
```bash
# Análise de bundle
npm run analyze:bundle

# Análise de componentes
npm run analyze:components

# Análise de performance
npm run analyze:performance

# Otimização de imagens
npm run optimize:images

# Code splitting
npm run optimize:splitting
```

### Modo Watch (Monitoramento Contínuo)
```bash
npm run watch:performance
```

### Gerar Relatório
```bash
npm run report:generate
```

## 📊 Saídas Geradas

Todos os relatórios são salvos em `./reports/`:
- `bundle-analysis.json`
- `component-analysis.json`
- `performance-report.html`
- `optimization-suggestions.md`
- `metrics-dashboard.html`

Para o agente de branding, o pacote visual é salvo em `./reports/brand-agent/<timestamp>/` com:
- `brand-system.json`
- `tokens.css`
- `tailwind.brand.extend.cjs`
- `BRAND_GUIDE.md`
- `logos/logo-wordmark.svg`
- `logos/logo-monogram.svg`
- `logos/logo-emblem.svg`
- `patterns/interactive-patterns.css`

## ⚙️ Configuração

Edite `config.json` para personalizar:
- Limites de tamanho de bundle
- Componentes para lazy loading
- Qualidade de compressão de imagens
- Limites de Core Web Vitals

## 🎯 Princípios de Otimização

✅ **Mantém todas as funcionalidades**
✅ **Não remove dependências críticas**
✅ **Preserva experiência do usuário**
✅ **Retrocompatível**
✅ **Reversível (usa Git)**

## 📈 Métricas Rastreadas

- Bundle size (main + chunks)
- Core Web Vitals (LCP, FID, CLS)
- Lighthouse scores
- Re-renders por componente
- Tempo de carregamento por rota
- Cache hit rate
