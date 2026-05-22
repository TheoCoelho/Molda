# Database Rebuild Migration Agent (Molda)

Este agente foi criado para executar a migracao off-Supabase sem preservar dados antigos.

## Arquivo de prompt
- prompts/db-rebuild-migration-agent.prompt.md

## Quando usar
- Rebuild completo de banco PostgreSQL
- Implementacao de API para substituir acesso direto ao Supabase
- Adaptacao de leituras e escritas do frontend para backend proprio
- Definicao de schema escalavel com constraints, indices e transacoes
- Hardening de performance e operacao (backup, restore, monitoracao)

## Cobertura funcional de banco
1. Modelagem
- entidades de identidade, catalogo, drafts, galeria e pedidos
- relacoes, FKs, checks e unicidade

2. Escritas
- create/update/delete via API
- idempotencia nas rotas criticas
- transacoes em operacoes multi-tabela

3. Buscas
- filtros e ordenacoes padronizadas
- paginacao
- indices alinhados ao uso real

4. Seguranca
- autorizacao por role no backend
- validacao de payload
- isolamento de dados por usuario

5. Operacao
- migration versionada
- seed essencial
- rollback por release
- backup e restore testado

## Como usar no chat
1. Abra o prompt em prompts/db-rebuild-migration-agent.prompt.md
2. Cole o conteudo no chat do Copilot
3. Preencha a secao "Entrada da tarefa"
4. Peça implementacao por fases (schema -> API -> frontend)

## Parametros minimos de entrada
1. Stack de API: Fastify ou Nest
2. Ferramenta de migration: Drizzle, Prisma ou Flyway
3. Storage: S3, R2 ou MinIO
4. Ordem de prioridade dos fluxos (catalogo, drafts, galeria, pedidos)
5. Prazo alvo

## Escopo recomendado de execucao
1. Schema e migrations
2. Endpoints de catalogo
3. Endpoints de drafts e galeria
4. Endpoints de pedidos e eventos
5. Refactor do frontend para cliente HTTP unico
6. Remocao final de dependencias Supabase

## Gate de qualidade por fase
1. Fase schema
- banco sobe limpo
- migrations aplicam e revertem

2. Fase API
- testes de integracao por dominio
- autorizacao e idempotencia validadas

3. Fase frontend
- sem chamadas diretas Supabase
- fluxos criticos funcionando

4. Fase operacao
- dashboards minimos de erro/latencia
- backup e restore executados

## Saida esperada do agente
1. Diagnostico atual
2. Plano tecnico por etapas
3. Arquivos alterados
4. Validacao executada
5. Riscos e proximos passos
