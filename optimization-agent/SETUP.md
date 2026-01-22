# 🚀 Setup Rápido - Agente Otimizador

## Pré-requisitos
- Node.js 16+
- npm 8+
- Workspace Molda-13 configurado

## 1️⃣ Instalação

```bash
cd optimization-agent
npm install
```

## 2️⃣ Verificar Configuração

Abra `config.json` e verifique os caminhos:
- `paths.moldaMain` - Deve apontar para `../Molda-main`
- `paths.decalEngine` - Deve apontar para `../decal-engine`
- `bundleThresholds` - Ajuste conforme necessário

## 3️⃣ Executar Agente Completo

Para análise e otimização completa:

```bash
npm run optimize:full
```

Isso irá:
1. **Analisar** bundle, componentes e performance
2. **Otimizar** imagens, code splitting e config Vite
3. **Gerar** relatórios detalhados

## 4️⃣ Executar Análises Individuais

Se preferir análises segmentadas:

```bash
# Apenas analisar bundle
npm run analyze:bundle

# Apenas analisar componentes
npm run analyze:components

# Apenas analisar performance
npm run analyze:performance

# Apenas otimizar imagens
npm run optimize:images

# Apenas implementar code splitting
npm run optimize:splitting

# Apenas otimizar config Vite
npm run optimize:vite
```

## 5️⃣ Monitorar Performance

Para observar métricas em tempo real:

```bash
npm run watch:performance
```

## 6️⃣ Visualizar Relatórios

Após executar, os relatórios estão em `reports/<timestamp>/`:

- **dashboard.html** - Abra no navegador para ver visualização
- **optimization-suggestions.md** - Recomendações detalhadas
- **performance-report.md** - Análise de performance
- **bundle-analysis.json** - Dados completos de bundle
- **component-analysis.json** - Análise de componentes
- **full-results.json** - Todos os resultados

## 7️⃣ Validar Mudanças

Antes de aplicar ao projeto:

```bash
npm run validate:changes
```

## 8️⃣ Aplicar Mudanças

As mudanças são geradas nos arquivos helper, mas NÃO aplicadas automaticamente. Para aplicar:

1. **Code Splitting**: Copie `lazyLoadComponents.ts` para `Molda-main/src/lib/`
2. **Vite Config**: Substitua `vite.config.ts` pelo otimizado ou merge manual
3. **Images**: Use `OptimizedImage.tsx` nos componentes

## 9️⃣ Rollback (se necessário)

```bash
npm run rollback
```

## 🔟 Próximas Passos

### Fase 1: Rápida (1-2 sprints)
- [ ] Revisar relatórios
- [ ] Aplicar code splitting
- [ ] Atualizar config Vite
- [ ] Testar funcionalidade
- [ ] Build e preview

### Fase 2: Média (2-3 sprints)
- [ ] Implementar Service Worker
- [ ] Setup HTTP caching
- [ ] Otimizar componentes críticos
- [ ] Monitorar performance

### Fase 3: Longa (opcional)
- [ ] Prefetching automático
- [ ] CDN para assets
- [ ] Análise Lighthouse API
- [ ] Monitoramento contínuo

## 📊 Métricas Esperadas

| Métrica | Antes | Depois | Melhoria |
|---------|-------|--------|----------|
| Bundle Initial | 500KB | 280KB | 44% ↓ |
| LCP | 3.5s | 1.8s | 49% ↓ |
| Lighthouse | 65 | 85+ | 20+ ↑ |
| DOM Nodes (Listas) | 1000 | 300 | 70% ↓ |

## ⚠️ Importante

✅ **Nenhuma funcionalidade será removida**
✅ **Todas as mudanças são opcionais**
✅ **Tudo pode ser desfeito com rollback**
✅ **Compatibilidade retroativa garantida**

## 🆘 Troubleshooting

### Error: "Cannot find module"
```bash
npm install
```

### Reports não são gerados
Verifique se `Molda-main/src/` existe e é acessível

### Performance não melhora
1. Limpe cache do navegador
2. Teste em modo incógnito
3. Verifique build production com `npm run build`

## 📞 Suporte

Para problemas ou dúvidas, consulte:
- `README.md` - Visão geral completa
- `CHANGELOG.md` - Histórico de mudanças
- `src/optimizers/codeSplitting.js` - Guia de code splitting
- `src/templates/VITE_OPTIMIZATION_GUIDE.md` - Guia Vite

---

**Criado por: Optimization Agent**
**Versão: 1.0.0**
**Data: Janeiro 2024**
