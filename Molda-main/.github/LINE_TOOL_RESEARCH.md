# Pesquisa: Ferramenta de Linha nos Editores Mais Famosos

**Data:** 3 de dezembro de 2025  
**Autor:** Guardião do Editor Fabric (Copilot)  
**Objetivo:** Estudar e documentar como funcionam as ferramentas de criar retas nos principais editores de design

---

## 🎯 Editores Analisados

### 1. **Adobe Illustrator**
**Ferramenta:** Line Segment Tool (atalho: `\`)

**Comportamentos principais:**
- **Modo básico:** Clique e arraste para criar uma linha
- **Com Shift:** Restringe ângulos a múltiplos de 45° (0°, 45°, 90°, 135°, 180°)
- **Com Alt/Option:** Desenha a partir do centro (ponto inicial vira o meio da linha)
- **Clique único:** Abre diálogo para especificar comprimento e ângulo numericamente
- **Preview em tempo real:** Mostra a linha enquanto arrasta
- **Propriedades ajustáveis:** Espessura, cor, estilo de traço (sólido, tracejado, pontilhado)
- **Pontas de linha:** Round, Square, Projecting
- **Alinhamento ao grid:** Snap automático quando grid está ativo

**Recursos avançados:**
- Pen Tool pode criar linhas como parte de paths complexos
- Pathfinder permite combinar/dividir linhas com outras formas

---

### 2. **Figma**
**Ferramenta:** Line Tool (atalho: `L`)

**Comportamentos principais:**
- **Clique e arraste:** Cria linha do ponto inicial ao final
- **Com Shift:** Restringe a ângulos de 45°
- **Modificação após criação:** Pontas editáveis como vector points
- **Propriedades no painel direito:**
  - Stroke width (espessura)
  - Stroke color
  - Stroke style (solid, dashed com padrões customizáveis)
  - Cap style (None, Round, Square, Line arrow)
  - Arrow heads (início/fim da linha)
- **Auto Layout:** Linhas podem ser usadas como separadores
- **Constraints:** Mantém posição relativa ao redimensionar frames

**Recursos especiais:**
- **Arrow connectors:** Setas que conectam elementos (não é a linha básica)
- **Vector networks:** Permite editar pontos individuais da linha

---

### 3. **Canva**
**Ferramenta:** Lines & Shapes > Line

**Comportamentos principais:**
- **Clique e arraste:** Desenha linha simples
- **Com Shift:** Trava em horizontal/vertical/diagonal perfeita
- **Após criação:**
  - Alças de rotação em volta da linha
  - Pontos de ancoragem nas pontas para redimensionar
- **Propriedades ajustáveis:**
  - Cor da linha
  - Espessura (slider 1-100px)
  - Estilo (sólido, tracejado, pontilhado - padrões predefinidos)
  - Transparência
  - Efeitos (sombra, neon, etc.)
- **Endpoints:** Opção de adicionar pontas de seta (início/fim/ambos)

**Recursos especiais:**
- **Smart guides:** Alinhamento automático com outros elementos
- **Formas pré-definidas:** Linhas decorativas (onduladas, com corações, etc.)

---

### 4. **Inkscape**
**Ferramenta:** Draw Bezier curves and straight lines (atalho: `B` ou `Shift+F6`)

**Comportamentos principais:**
- **Clique único:** Adiciona pontos, criando segmentos de linha entre eles
- **Clique e arraste:** Cria curvas Bézier (não linha reta simples)
- **Para linha reta:** Cliques sucessivos sem arrastar
- **Enter ou duplo-clique:** Finaliza a polilinha
- **Escape:** Cancela o desenho atual
- **Com Ctrl:** Restringe ângulos a múltiplos de 15°
- **Backspace/Delete:** Remove último ponto adicionado

**Recursos avançados:**
- **Path modes:** 
  - Regular Bezier path
  - Spiro path (curvas suaves)
  - BSpline path
- **Node editing:** Depois de criada, F2 ativa edição de nós
- **Stroke styles:** Markers (setas), patterns, dashed lines personalizáveis

---

### 5. **Photoshop**
**Ferramenta:** Line Tool (dentro do Shape Tools, atalho: `U` e alternar)

**Comportamentos principais:**
- **Modos de criação:**
  - Shape (cria forma vetorial)
  - Path (cria path de trabalho)
  - Pixels (rasteriza diretamente)
- **Com Shift:** Restringe a 45°
- **Propriedades:**
  - Peso/espessura (weight)
  - Cor do stroke e fill
  - Arrowheads (início, fim, ambos) com largura e comprimento customizáveis
  - Stroke style (solid, dashed, dotted)
- **Options bar:**
  - Configuração de pontas antes de desenhar
  - Alinhamento ao pixel grid

**Recursos especiais:**
- Como é vetorial (Shape), pode ser editado posteriormente
- Pen Tool oferece mais controle para paths complexos

---

### 6. **Affinity Designer**
**Ferramenta:** Pen Tool (modo linha) ou Line Tool

**Comportamentos principais:**
- **Pen Tool > Linha:** Clique em dois pontos para criar segmento reto
- **Com Shift:** Restringe a incrementos de 15°
- **Node Tool (A):** Edita pontos após criação
- **Propriedades:**
  - Stroke width
  - Cap style (Butt, Round, Square)
  - Arrow options (início/fim)
  - Pressure simulation (simula variação de pressão)
- **Snap options:** Alinhamento a grid, objetos, guias

**Recursos especiais:**
- **Pressure curves:** Simula tablets com variação de espessura
- **Stroke panel:** Controle avançado de tracejados e padrões

---

## 🔍 Análise Comparativa

### Padrões Comuns
1. **Shift para restrição de ângulos:** Todos os editores implementam
2. **Preview em tempo real:** Mostra a linha enquanto desenha
3. **Propriedades editáveis:** Cor, espessura, estilo (sólido/tracejado)
4. **Pontas de seta:** Maioria oferece opção de adicionar setas
5. **Edição posterior:** Todos permitem ajustar a linha após criação

### Diferenças Principais
| Editor | Modo Polilinha | Restrição Ângulo | Entrada Numérica | Setas |
|--------|----------------|------------------|------------------|-------|
| Illustrator | Via Pen Tool | 45° (Shift) | ✅ Diálogo | ✅ |
| Figma | Não nativo | 45° (Shift) | ✅ Panel | ✅ |
| Canva | Não | H/V/Diag | ❌ | ✅ |
| Inkscape | ✅ Nativo | 15° (Ctrl) | ❌ | ✅ |
| Photoshop | Não | 45° (Shift) | ✅ Options | ✅ |
| Affinity | Via Pen Tool | 15° (Shift) | ✅ Transform | ✅ |

---

## 💡 Situação Atual do Molda

### Implementação Atual (`Editor2D.tsx`, linhas 1460-1513)

```typescript
if (tool === "line") {
  c.isDrawingMode = false;
  c.selection = false;
  c.skipTargetFind = true;
  setObjectsSelectable(c, false);
  c.discardActiveObject();
  setHostCursor("crosshair");

  let isDrawing = false;
  let startPoint: { x: number; y: number } | null = null;
  let line: any = null;

  const onMouseDown = (e: any) => {
    if (isDrawing) return;
    const pointer = c.getPointer(e.e);
    startPoint = { x: pointer.x, y: pointer.y };
    
    line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
      stroke: strokeColor,
      strokeWidth: strokeWidth,
      opacity: opacity,
      selectable: false,
      evented: false,
      erasable: true,
    });
    c.add(line);
    isDrawing = true;
  };

  const onMouseMove = (e: any) => {
    if (!isDrawing || !line || !startPoint) return;
    const pointer = c.getPointer(e.e);
    line.set({
      x2: pointer.x,
      y2: pointer.y,
    });
    c.renderAll();
  };

  const onMouseUp = () => {
    if (!isDrawing) return;
    isDrawing = false;
    if (line) {
      line.set({ selectable: true, evented: true });
      line.setCoords();
    }
    startPoint = null;
    line = null;
  };

  attachLineListeners(c, onMouseDown, onMouseMove, onMouseUp);
  c.renderAll();
  return;
}
```

### ✅ Pontos Fortes
- Preview em tempo real funciona
- Integração com sistema de cores/espessura
- Objetos são "erasable" (compatível com borracha)

### ⚠️ Limitações Identificadas
1. **Sem restrição de ângulos (Shift):** Não trava em 45°/90°
2. **Sem captura no histórico:** Não há `historyRef.current?.capture()` após criar linha
3. **Sem modo polilinha:** Só cria segmentos únicos
4. **Sem configuração de pontas:** Cap style fixo, sem opção de setas
5. **Sem snap/alinhamento:** Não se alinha a grid ou outros objetos
6. **Sem feedback visual:** Não mostra coordenadas/ângulo/comprimento
7. **Cursor genérico:** "crosshair" básico

---

## 🚀 Recomendações de Melhoria

### Prioridade 1 (Essencial)
1. **Adicionar captura de histórico** após criar linha
2. **Implementar Shift para restrição de ângulos** (45°)
3. **Adicionar modo polilinha** (já existe `lineMode` na interface, mas não implementado)

### Prioridade 2 (Importante)
4. **Cap styles** (round, square, butt) no painel de ferramentas
5. **Arrow heads** (setas nas pontas)
6. **Feedback visual** (tooltip mostrando comprimento/ângulo)

### Prioridade 3 (Desejável)
7. **Smart guides** (alinhamento com outros objetos)
8. **Snap to grid** (quando grid estiver ativo)
9. **Entrada numérica** (comprimento e ângulo exatos)
10. **Estilos de linha** (tracejado, pontilhado) - pode usar Fabric patterns

---

## 📋 Proposta de Implementação

### 1. Restrição de Ângulos (Shift)

```typescript
const onMouseMove = (e: any) => {
  if (!isDrawing || !line || !startPoint) return;
  const pointer = c.getPointer(e.e);
  
  let targetX = pointer.x;
  let targetY = pointer.y;
  
  // Se Shift pressionado, restringir a 45°
  if (e.e.shiftKey) {
    const dx = targetX - startPoint.x;
    const dy = targetY - startPoint.y;
    const angle = Math.atan2(dy, dx);
    const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    targetX = startPoint.x + length * Math.cos(snapAngle);
    targetY = startPoint.y + length * Math.sin(snapAngle);
  }
  
  line.set({ x2: targetX, y2: targetY });
  c.renderAll();
};
```

### 2. Captura de Histórico

```typescript
const onMouseUp = () => {
  if (!isDrawing) return;
  isDrawing = false;
  if (line) {
    line.set({ selectable: true, evented: true });
    line.setCoords();
    // ADICIONAR captura de histórico
    historyRef.current?.capture();
  }
  startPoint = null;
  line = null;
};
```

### 3. Modo Polilinha

```typescript
// Se lineMode === "polyline"
let points: {x: number, y: number}[] = [];
let polylineObj: fabric.Polyline | null = null;

const onMouseDown = (e: any) => {
  const pointer = c.getPointer(e.e);
  
  if (lineMode === "single") {
    // Implementação atual
  } else {
    // Polyline: adicionar ponto
    points.push({ x: pointer.x, y: pointer.y });
    
    if (points.length === 1) {
      // Primeiro ponto: criar polyline
      polylineObj = new fabric.Polyline(points, {
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        opacity: opacity,
        fill: 'transparent',
        selectable: false,
      });
      c.add(polylineObj);
    }
  }
};

// Duplo-clique ou Enter para finalizar
```

### 4. Arrow Heads (Setas)

```typescript
// Adicionar propriedades ao Editor2D
type ArrowOption = "none" | "start" | "end" | "both";

// Ao criar linha, adicionar markers
const addArrowHeads = (line: fabric.Line, option: ArrowOption) => {
  // Implementar usando fabric.Triangle ou SVG markers
  // Posicionar triangulos nas pontas da linha
};
```

---

## 🎨 Interface Proposta (ExpandableSidebar)

```tsx
// Painel de Linhas expandido
<AccordionItem title="Linhas" icon={<PenLine />} open={openKey === "linhas"}>
  {/* Modo de desenho (atual) */}
  <div className="flex gap-2">
    <button onClick={() => setLineMode("single")}>Segmento único</button>
    <button onClick={() => setLineMode("polyline")}>Polilinha</button>
  </div>
  
  {/* NOVO: Cap style */}
  <div className="mt-3">
    <Label>Pontas</Label>
    <div className="flex gap-2">
      <button onClick={() => setLineCap("butt")}>Reta</button>
      <button onClick={() => setLineCap("round")}>Redonda</button>
      <button onClick={() => setLineCap("square")}>Quadrada</button>
    </div>
  </div>
  
  {/* NOVO: Setas */}
  <div className="mt-3">
    <Label>Setas</Label>
    <div className="flex gap-2">
      <button onClick={() => setArrowOption("none")}>Nenhuma</button>
      <button onClick={() => setArrowOption("start")}>Início</button>
      <button onClick={() => setArrowOption("end")}>Fim</button>
      <button onClick={() => setArrowOption("both")}>Ambas</button>
    </div>
  </div>
  
  {/* NOVO: Estilo de traço */}
  <div className="mt-3">
    <Label>Estilo</Label>
    <select onChange={(e) => setLineStyle(e.target.value)}>
      <option value="solid">Sólido</option>
      <option value="dashed">Tracejado</option>
      <option value="dotted">Pontilhado</option>
    </select>
  </div>
</AccordionItem>
```

---

## 🧪 Testes Recomendados

1. **Teste de restrição de ângulos:**
   - Desenhar linha com Shift pressionado
   - Verificar que trava em 0°, 45°, 90°, 135°, 180°, etc.

2. **Teste de histórico:**
   - Criar linha
   - Pressionar Ctrl+Z
   - Verificar que linha é removida
   - Pressionar Ctrl+Y
   - Verificar que linha retorna

3. **Teste de polilinha:**
   - Modo polilinha ativo
   - Clicar em múltiplos pontos
   - Duplo-clique para finalizar
   - Verificar que polilinha conectada é criada

4. **Teste de setas:**
   - Configurar seta no início
   - Desenhar linha
   - Verificar que seta aparece no ponto inicial
   - Repetir para fim e ambas

5. **Teste de integração:**
   - Criar linha
   - Mudar para ferramenta de seleção
   - Verificar que linha é selecionável
   - Verificar que pode ser deletada, movida, rotacionada

---

## 📚 Referências

- [Fabric.js Line Documentation](http://fabricjs.com/docs/fabric.Line.html)
- [Fabric.js Polyline Documentation](http://fabricjs.com/docs/fabric.Polyline.html)
- [Adobe Illustrator Line Tool Guide](https://helpx.adobe.com/illustrator/using/drawing-simple-lines-shapes.html)
- [Figma Line Tool Documentation](https://help.figma.com/hc/en-us/articles/360040450133-Using-Shape-Tools)
- [Inkscape Bezier Tool Tutorial](https://inkscape-manuals.readthedocs.io/en/latest/bezier.html)

---

## 📝 Notas de Implementação

- Manter compatibilidade com `HistoryManager.ts`
- Garantir que linhas sejam "erasable" para funcionar com borracha
- Usar `runWithActiveEditor` para operações que precisam de canvas ativo
- Emitir eventos `editor2d:*` quando apropriado para sincronização com UI
- Adicionar testes manuais após cada feature implementada

---

**Status:** Documento de pesquisa completo  
**Próximo passo:** Implementar melhorias priorizadas  
**Guardião:** Mantém vigilância sobre estabilidade do histórico e sincronização
