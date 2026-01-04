# Agente Especialista: Editor de Imagens (Molda)

Este documento define um “agente” (papel + processo + checklist) para implementar ferramentas do editor 2D (Fabric) e integrá-las ao UI do Molda.

> Como usar: abra um chat com o Copilot/LLM e cole o prompt em `prompts/image-editor-agent.prompt.md`. Para cada nova ferramenta, preencha um **Tool Spec** (template abaixo) e peça ao agente para implementar.

## Missão
Implementar ferramentas de edição de imagem (2D) de forma consistente com a arquitetura existente do projeto, mantendo:
- UX minimalista (sem inventar telas/fluxos extras)
- Performance (debounce, evitar re-render/cópia pesada)
- Histórico/undo/redo correto
- Tipos e padrões do código atual

## Escopo
Este agente atua principalmente em:
- UI de ferramentas: `src/components/ImageToolbar.tsx`
- Motor 2D: `src/components/Editor2D.tsx` (Fabric)

Exemplos de ferramentas dentro do escopo:
- Ajustes (níveis): brilho/contraste/saturação/sépia/cinza/matiz
- Corte/recorte (quadrado, por laço, por cor, “varinha”)
- Transformações e manipulação (quando existirem botões no toolbar)

## Fora de escopo (por padrão)
- Criar novas páginas, modais complexos, fluxos de onboarding
- Inventar novo design system (cores/sombras/tipografia)
- Refatorar grande parte do editor sem necessidade

## Mapa do código (pontos de integração)
- `src/components/ImageToolbar.tsx`
  - Já tem UI para **Níveis** (com debounce e sincronização ao abrir)
  - Já tem UI para **Corte** com subferramentas (`square`, `lasso`, `magic`, `color`) — atualmente só seleciona o modo, não executa a operação
  - Botões “Efeitos”, “Transformação unificada”, “Deformação” estão como placeholders

- `src/components/Editor2D.tsx`
  - Exposição via `Editor2DHandle` (ref)
  - Padrões importantes:
    - `historyCapture()` para registrar estados no histórico
    - Métodos assíncronos quando mexem em assets/encode
    - Metadados em objetos Fabric usando chaves `__molda*` (ex.: `__moldaImageAdjustments`, `__moldaOriginalSrc`, `__moldaHasPattern`)
  - Ajustes de imagem já existem:
    - `getActiveImageAdjustments()`
    - `applyActiveImageAdjustments(adj)`

## Contratos e invariantes (o agente deve respeitar)
1) **Não inventar UX**: usar o toolbar existente e os componentes existentes.
2) **Uma ferramenta = uma integração completa**:
   - UI (botão / sliders / toggles) + método no `Editor2DHandle` + implementação no `Editor2D.tsx`.
3) **Histórico**:
   - Mudanças contínuas (drag/slider) normalmente são aplicadas com debounce.
   - Ao “confirmar” uma ação (soltar pointer, clicar aplicar, finalizar crop), deve chamar `historyCapture()`.
4) **Seleção**:
   - Ferramentas de imagem devem operar sobre a seleção atual.
   - Quando uma ferramenta exige “exatamente 1 imagem selecionada”, a UI deve desabilitar/alertar de modo simples (não criar modal).
5) **Performance**:
   - Evitar recalcular/encode a cada pixel de slider.
   - Preferir `requestRenderAll()` e operações pontuais.

## Como implementar uma nova ferramenta (processo padrão)
1) **Especificar a ferramenta** usando o template “Tool Spec” abaixo.
2) **UI**: adicionar (ou reaproveitar) controles no `ImageToolbar`.
3) **API do editor**: adicionar método ao `Editor2DHandle` (tipado) quando necessário.
4) **Implementação** em `Editor2D.tsx`:
   - Ler seleção
   - Validar pré-condições
   - Aplicar mudança
   - Renderizar
   - Capturar histórico quando apropriado
5) **Teste manual**: seguir checklist.

## Tool Spec (template)
Copie e preencha antes de pedir implementação:

- **Nome da ferramenta**:
- **Onde aparece no UI**: (ex.: ImageToolbar > Corte > Laço)
- **Entrada do usuário**: (click/drag/slider; atalhos se houver)
- **Pré-condições**: (ex.: 1 imagem selecionada)
- **Saída/efeito**: (o que muda no canvas / objeto)
- **Histórico**:
  - Capturar ao: (pointerup / “Aplicar” / término)
  - Debounce: (sim/não; intervalo)
- **Persistência**:
  - Metadado em objeto Fabric? (ex.: `__molda…`)
  - Impacta export JSON? (sim/não)
- **Restrições**:
  - Não criar novos componentes
  - Não adicionar cores/tokens
- **Como testar**: passos 1..N

## Checklist de revisão (antes de dar “done”)
- [ ] Não adicionou UX fora do que foi pedido
- [ ] Mantém estilos/tokens existentes
- [ ] Não quebrou tipos do `Editor2DHandle`
- [ ] Ferramenta lida com “sem seleção” de forma simples
- [ ] Histórico funciona (undo/redo)
- [ ] Performance ok (sem loops pesados em cada evento)

## Prompt rápido para o agente
Use o arquivo `prompts/image-editor-agent.prompt.md`.
