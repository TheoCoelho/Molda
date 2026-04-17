# Decal Geometry Implementation Plan (Molda)

## Objetivo
Reduzir deformacao e cortes de decal em modelos 3D com geometrias diferentes, mantendo performance e estabilidade da interacao.

## Fase 1 - Diagnostico e baseline
1. Criar um conjunto fixo de testes com pelo menos 3 modelos distintos (ex: low poly, oversized, manga longa).
2. Para cada modelo, registrar 5 posicoes de decal (frente centro, peito lateral, manga, regiao de costura, costas superior).
3. Coletar baseline visual e tecnico:
   - percentual de area visivel do decal
   - incidencias de corte
   - score de shear (quando disponivel)
   - ocorrencias de crossing de seam

Arquivos foco:
- `decal-engine/src/usage.ts`
- `decal-engine/src/engine/analysis/ShearEstimator.ts`
- `decal-engine/src/engine/analysis/SeamAnalyzer.ts`

## Fase 2 - Instrumentacao no engine
1. Adicionar logs/telemetria local (modo debug) para metricas por decal.
2. Expor no estado interno:
   - shearScore
   - seamCrossings
   - clippedTriangleRatio
   - visibleAreaRatio
3. Garantir que o modo debug possa ser ligado sem impactar producao.

Arquivos foco:
- `decal-engine/src/engine/three/MeshDecalAdapter.ts`
- `decal-engine/src/engine/three/ProjectedDecalAdapter.ts`
- `decal-engine/src/usage.ts`

## Fase 3 - Correcao adaptativa de projecao
1. Implementar ajuste adaptativo de profundidade com limites por curvatura local.
2. Aplicar clamp angular por faixa para reduzir wrap em quinas.
3. Ajustar banda frontal dinamica para reduzir cortes sem "vazar" para o verso.

Arquivos foco:
- `decal-engine/src/engine/three/SurfaceDecal.ts`
- `decal-engine/src/engine/three/ProjectionDecal.ts`
- `decal-engine/src/usage.ts` (parametros de projector)

## Fase 4 - Tratamento de geometrias criticas
1. Criar fallback para projected decal quando mesh decal falhar acima de limiar.
2. Implementar split em multi-projection quando seamCrossings for alto.
3. Centralizar presets por modelo em configuracao unica.

Arquivos foco:
- `decal-engine/src/engine/three/ProjectedDecalAdapter.ts`
- `decal-engine/src/engine/three/MultiProjectionDecal.ts`
- `Molda-main/src/lib/models.ts`

## Fase 5 - Integracao 2D->3D e estabilidade
1. Validar IDs estaveis de decal do `Creation` para o engine.
2. Garantir que update incremental nao gere rebuild desnecessario.
3. Confirmar que drag/rotate/scale continuam fluidos.

Arquivos foco:
- `Molda-main/src/components/DecalEngineHost.tsx`
- `decal-engine/src/usage.ts`

## Criterios de aceite
- Queda de pelo menos 40% em ocorrencias de corte nos cenarios baseline.
- Menor variacao visual entre modelos para o mesmo decal/transform.
- Sem regressao perceptivel de FPS durante interacao.
- Sem regressao de posicionamento entre tabs/IDs no fluxo externo.

## Sequencia recomendada de PRs
1. PR-1: Instrumentacao + baseline report
2. PR-2: Ajuste adaptativo de profundidade/angulo
3. PR-3: Fallback e multi-projection
4. PR-4: Presets por modelo + hardening final

## Riscos conhecidos
- Reduzir cortes demais pode aumentar "wrap" indesejado em curvaturas altas.
- Filtros muito agressivos podem gerar buracos no decal.
- Heuristicas por modelo sem centralizacao viram debt rapido.

## Mitigacoes
- Definir limiares versionados em configuracao central.
- Rodar matriz de teste fixa a cada PR.
- Manter comparativo antes/depois com capturas padrao.
