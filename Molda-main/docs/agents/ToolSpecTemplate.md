# Tool Spec Template — Ferramentas do Editor (2D)

Preencha isso e cole no chat do agente.

## 1) Identidade
- **Nome**:
- **Categoria**: (imagem / texto / shape / geral)
- **Local no UI**: (ex.: ImageToolbar > Corte > Laço)

## 2) UX (mínimo)
- **Controles**: (botões, sliders, toggles)
- **Gestos**:
  - pointerdown:
  - pointermove:
  - pointerup:
- **Atalhos** (opcional):
- **Estado visual**: (ex.: “selected/pressed”, cursor, outline)

## 3) Regras
- **Pré-condições**: (ex.: precisa 1 imagem selecionada)
- **Casos limite**: (sem seleção, múltiplas imagens, CORS)
- **Desempenho**:
  - Debounce/Throttle:
  - Operação pesada (encode, hit-test etc.):

## 4) Integração técnica
- **API do Editor2D**:
  - Novo método no `Editor2DHandle`? (sim/não; nome)
- **Onde salvar estado**:
  - Metadado no objeto Fabric (`__molda...`)?
  - Estado React no toolbar?
- **Histórico**:
  - Quando chamar `historyCapture()`:

## 5) Teste manual
- Passo 1:
- Passo 2:
- Passo 3:

## 6) Definição de pronto
- [ ] Funciona com undo/redo
- [ ] Não cria UI extra
- [ ] Não adiciona tokens/cores
- [ ] Não degrada performance perceptivelmente
