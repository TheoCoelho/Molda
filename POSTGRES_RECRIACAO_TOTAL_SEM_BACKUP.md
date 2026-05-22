# PostgreSQL - Recriacao Total (Sem Backup)

Este guia e para o seu cenario atual: senha perdida e sem backup recuperavel.

## 0) Diagnostico atual (maquina)

Voce tem duas instancias PostgreSQL rodando ao mesmo tempo:

- Servico `postgresql-x64-17` usando `C:\Program Files\PostgreSQL\17\data` e porta `5433`
- Servico `postgresql-x64-18` usando `C:\Program Files\PostgreSQL\18\data` e porta `5432`

Isso pode causar confusao no pgAdmin (host/porta/senha).

## 1) O que sera perdido

Sem backup, voce perdera dados antigos de bancos existentes nessas instalacoes.

## 2) Desinstalacao limpa do PostgreSQL (Windows)

1. Feche pgAdmin, VS Code e qualquer app conectada ao banco.
2. Abra PowerShell como Administrador.
3. Pare os servicos (se existirem):

```powershell
Stop-Service -Name postgresql-x64-17 -Force -ErrorAction SilentlyContinue
Stop-Service -Name postgresql-x64-18 -Force -ErrorAction SilentlyContinue
```

4. Desinstale em Configuracoes > Aplicativos:
- PostgreSQL 17
- PostgreSQL 18
- Stack Builder (se existir)
- pgAdmin (opcional)

5. Apague pastas residuais (se ainda existirem):

```powershell
Remove-Item -Recurse -Force "C:\Program Files\PostgreSQL\17" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "C:\Program Files\PostgreSQL\18" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "C:\ProgramData\PostgreSQL" -ErrorAction SilentlyContinue
```

6. Reinicie o Windows.

## 3) Reinstalacao recomendada

Instale apenas UMA versao do PostgreSQL (recomendado: 18) e, durante o setup:

- Defina senha nova para usuario `postgres`
- Porta: `5432`
- Locale padrao
- Instale pgAdmin junto (opcional)

## 4) Primeira conexao no pgAdmin

Crie o server com:

- Host: `127.0.0.1`
- Port: `5432`
- Database: `postgres` (primeiro acesso)
- User: `postgres`
- Password: a senha nova definida na instalacao
- SSL mode: `prefer`

## 5) Criar banco novo do projeto

No Query Tool (conectado no banco `postgres`), rode:

```sql
CREATE DATABASE molda_db;
```

## 6) Configurar backend para o novo banco

Arquivo: `backend/.env`

Valores esperados:

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=SUA_NOVA_SENHA
DB_NAME=molda_db
```

Importante: atualmente o projeto estava em `DB_PORT=5434`. Ajuste para `5432` se sua nova instalacao estiver no padrao.

## 7) Restaurar estrutura do banco (schema)

Neste projeto, o schema principal e recriado por migrations TypeORM automaticamente ao subir o backend.

Migrations cadastradas:

- `backend/src/database/migrations/1000000000000-CreateAuthTables.ts`
- `backend/src/database/migrations/1000000000001-CreateCatalogTables.ts`
- `backend/src/database/migrations/1000000000002-CreateOrdersTables.ts`
- `backend/src/database/migrations/1000000000003-CreateDraftsAndGalleryTables.ts`

Execute:

```powershell
Set-Location "C:\Users\coelh\Documents\GitHub\Clone Molda\Molda-14\backend"
npm install
npm run start:dev
```

Se o backend subir com sucesso, as migrations ja devem ter sido aplicadas (`migrationsRun: true`).

## 8) Popular catalogo base (seed)

Opcional, mas recomendado para telas de catalogo:

```powershell
Set-Location "C:\Users\coelh\Documents\GitHub\Clone Molda\Molda-14\backend"
node -r dotenv/config -r ts-node/register src/database/seeds/catalog.seed.ts dotenv_config_path=.env
```

## 9) Verificacao rapida (SQL)

No pgAdmin, conectado em `molda_db`:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Esperado: tabelas como `users`, `profiles`, `orders`, `project_drafts`, `gallery_visibility`, etc.

## 10) Validacao da API

Com backend rodando, teste:

- `POST http://localhost:3000/auth/sign-up`
- `POST http://localhost:3000/auth/sign-in`
- `GET  http://localhost:3000/catalog/parts`

## 11) Observacao importante sobre scripts `Molda-main/supabase/*.sql`

Esses scripts foram feitos para ambiente Supabase e podem depender de recursos especificos (auth/RLS/policies).
Nao use esses SQLs diretamente no PostgreSQL puro, a menos que voce esteja replicando um ambiente Supabase completo.

## 12) Checklist final

- [ ] PostgreSQL antigo removido
- [ ] Apenas 1 instancia instalada
- [ ] pgAdmin conecta com nova senha
- [ ] Banco `molda_db` criado
- [ ] `backend/.env` atualizado com porta/senha novas
- [ ] `npm run start:dev` sobe sem erro
- [ ] migrations aplicadas
- [ ] seed de catalogo executada (opcional)
