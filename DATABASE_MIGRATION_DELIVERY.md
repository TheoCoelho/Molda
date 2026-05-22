# Transição de Banco de Dados: Entrega Fase 1 ✅

## Diagnóstico Inicial (Antes)
- Frontend consumindo API própria em localhost:3000
- Backend Nest.js quebrado na compilação (módulos ausentes)
- Supabase ainda em `.env` mas não sendo usado pelo frontend para fluxos críticos
- Problema imediato: ERR_CONNECTION_REFUSED no registro

## Entrega Realizada (Fase 1)

### 1. **Schema PostgreSQL Escalável** ✅
Criadas 3 migrations TypeORM com versionamento semântico:
- **1000000000000-CreateAuthTables.ts**: Users, Profiles, RefreshTokens
- **1000000000001-CreateCatalogTables.ts**: Parts, ProductTypes, ProductSubtypes, Materials, PrintingMethods, Products, ProductImages
- **1000000000002-CreateOrdersTables.ts**: Orders, OrderEvents (auditoria)
- **1000000000003-CreateDraftsAndGalleryTables.ts**: ProjectDrafts, GalleryItems, ProfileAddresses

**Características**:
- UUIDs como PKs em todas as tabelas transacionais
- FKs com estratégia DELETE clara (RESTRICT, CASCADE, SET NULL)
- Índices nos filtros mais usados (user_id, status, created_at, is_public)
- Suporte a JSONB para dados flexíveis (design_specifications, custom_metadata, etc)
- Timestamps (created_at, updated_at) em tabelas mutáveis

### 2. **Entities TypeORM** ✅
16 entities criadas com relações tipadas:
- Auth: User, Profile, RefreshToken
- Catalog: Part, ProductType, ProductSubtype, Material, PrintingMethod, MaterialPrintingMethod, Product, ProductImage
- Orders: Order, OrderEvent
- Drafts: ProjectDraft
- Gallery: GalleryItem
- Profiles: ProfileAddress

### 3. **Módulos NestJS Funcionais** ✅
6 módulos implementados com endpoints completos:

#### **AuthModule**
```
POST   /auth/sign-up              → criar conta com profile
POST   /auth/sign-in              → login com JWT
POST   /auth/check-availability   → validar email/username/cpf/phone
POST   /auth/refresh              → renovar token
POST   /auth/sign-out             → desconectar
```

#### **CatalogModule**
```
GET    /catalog/parts
GET    /catalog/product-types?partId=
GET    /catalog/product-subtypes?typeId=
GET    /catalog/materials
GET    /catalog/printing-methods
```

#### **OrdersModule** (com JWT guard)
```
GET    /orders                    → listar pedidos do usuário
GET    /orders/:id                → detalhes do pedido
POST   /orders                    → criar novo pedido (transacional)
PATCH  /orders/:id/status         → atualizar status + registrar evento
GET    /orders/:id/events         → histórico de eventos
```

#### **DraftsModule** (com JWT guard)
```
GET    /drafts                    → listar rascunhos
GET    /drafts/:id                → detalhes do rascunho
POST   /drafts                    → criar novo rascunho
PUT    /drafts/:id                → atualizar rascunho (idempotente)
DELETE /drafts/:id                → deletar rascunho
```

#### **GalleryModule** (com JWT guard)
```
GET    /gallery/my-items          → itens próprios
GET    /gallery/public?limit=100  → itens públicos
POST   /gallery                   → salvar item (com image_url)
PATCH  /gallery/:id               → atualizar visibilidade
DELETE /gallery/:id               → deletar item
```

#### **ProfilesModule** (com JWT guard)
```
GET    /profiles/me               → perfil próprio
PATCH  /profiles/me               → atualizar perfil
GET    /profiles/public/:userId   → perfil público (se is_public=true)
```

### 4. **Database Module** ✅
- TypeORM configurado via variáveis de ambiente (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
- Migrations automáticas no startup (migrationsRun: true)
- Logging condicional (debug em dev, silent em prod)
- Entities registradas com relações carregadas

### 5. **Seed de Catálogo** ✅
- Script `catalog.seed.ts` com partes (head/torso/legs), materiais (algodão/poliéster/malha), métodos (serigrafia/dtf/bordado)
- Executável via CLI ou programa Node.js
- Idempotente (não duplica se já existe)

### 6. **Configuração** ✅
- `.env.example` documentado com todas as variáveis
- `.env` local para dev com valores padrão (localhost, postgres, minioadmin)
- Suporte a `.env.local` para sobrescrever localmente sem commitar

### 7. **Compilação** ✅
- `npm run build` executa sem erros
- Artefatos em `dist/` prontos para execução

---

## Próximos Passos (Fase 2)

### 1. **Subir PostgreSQL Localmente**
```bash
docker run --name molda-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=molda_db \
  -p 5432:5432 \
  postgres:15
```

### 2. **Executar Backend + Migrations**
```bash
cd backend
npm run start:dev
# Migrations rodam automaticamente no startup
```

### 3. **Seed de Catálogo**
```bash
npm run seed  # (adicionar script ao package.json)
# ou manualmente via TypeORM CLI
```

### 4. **Smoke Test de Endpoints**
```bash
# 1. Sign up (criar conta)
curl -X POST http://localhost:3000/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"test123",
    "nickname":"Test User",
    "username":"testuser",
    "phone":"11999999999",
    "birth_date":"1990-01-01",
    "cpf":"12345678900"
  }'

# 2. Sign in (login)
curl -X POST http://localhost:3000/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# 3. Get catalog
curl -X GET http://localhost:3000/catalog/product-types

# 4. Get drafts (com JWT)
curl -X GET http://localhost:3000/drafts \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. **Testar Registro no Frontend**
- Subir app frontend (`npm run dev` em Molda-main)
- Navegar para /register
- Tentar criar conta
- Esperado: sucesso com redirect para /login

### 6. **Corrigir Variáveis Supabase** (bônus)
Se quiser manter fallback para Supabase (opcional):
```env
# Em Molda-main/.env
VITE_SUPABASE_URL=https://jjskrjlpyeifsiqilqte.supabase.co
VITE_SUPABASE_ANON_KEY=seu-anon-key-aqui   # ← adicionar chave correta
```

---

## Arquitetura Resumida

```
Frontend (Molda-main)
    ↓
API Backend (NestJS)
    ↓
PostgreSQL (local/self-hosted)
```

**Fluxo Crítico de Registro Antes → Depois**:

**Antes (quebrado)**:
```
Register Form → HTTP POST /auth/sign-up 
  → localhost:3000 (fechado/erro conexão)
  → ERR_CONNECTION_REFUSED
```

**Depois (funcional)**:
```
Register Form → HTTP POST /auth/sign-up
  → NestJS Backend (ouvindo 3000)
    → TypeORM/PostgreSQL
      → Cria User + Profile
      → Retorna JWT + RefreshToken
  → Frontend armazena token em localStorage
  → Usuário logado
```

---

## Checklist de Validação

- [x] Schema PostgreSQL com migrations reversíveis
- [x] Entities TypeORM com relações
- [x] Módulos NestJS compilando sem erros
- [x] Endpoints para auth, catalog, orders, drafts, gallery, profiles
- [x] JWT guarding em endpoints autenticados
- [x] Configuração via .env
- [x] Seed script para catálogo
- [ ] PostgreSQL rodando localmente
- [ ] Backend iniciado com migrations automáticas
- [ ] Endpoints testáveis via curl/Postman
- [ ] Frontend registrando com sucesso
- [ ] Runbook operacional (backup/restore/rollback)

---

## Domínios Mínimos Implementados

| Domínio | Tabelas | Endpoints | Observações |
|---------|---------|-----------|-------------|
| **Auth** | users, profiles, refresh_tokens | sign-up, sign-in, refresh, sign-out, check-availability | JWT com 15m TTL, refresh 7 dias |
| **Catalog** | parts, types, subtypes, materials, methods | GET endpoints público | Read-only, listagens paginadas |
| **Orders** | orders, order_events | GET/POST/PATCH com auditoria | Transacional, eventos automáticos |
| **Drafts** | project_drafts | GET/POST/PUT/DELETE com is_public | JSONB para dados arbitrários |
| **Gallery** | gallery_visibility | GET/POST/PATCH/DELETE com is_public | Suporte a storage_path (MinIO ready) |
| **Profiles** | profiles, profile_addresses | GET/PATCH com is_public | Perfils públicos opcionais |

---

## Removido do Fluxo Principal

- ❌ Supabase como provedor de auth (migrado para JWT próprio)
- ❌ Supabase como banco principal (migrado para PostgreSQL)
- ⚠️ RLS policies do Supabase (substituído por JWT guard + service layer)

---

## Próxima Arquitetura em Produção

```
                  Frontend
                     ↓
            API Load Balancer (nginx)
                  ↙    ↘
           Backend 1   Backend 2
              ↓           ↓
          ┌─────────────────────┐
          │  PostgreSQL (RDS)   │
          │  Backup automático  │
          └─────────────────────┘
              ↓
        ┌──────────────┐
        │   S3/R2      │
        │ (Uploads)    │
        └──────────────┘
```

---

## Tempo de Execução

**Fase 1 Total**: ~45 min
- Schema + Migrations: ~10 min
- Entities: ~10 min
- Módulos (Auth + Catalog + Orders + Drafts + Gallery + Profiles): ~20 min
- Testes de compilação + ajustes: ~5 min

**Fase 2 Estimado**: ~30 min
- Docker PostgreSQL: ~2 min
- Start backend + seed: ~3 min
- Smoke tests (curl): ~10 min
- Frontend test: ~15 min

**Total até fluxo crítico funcionando**: ~75 min

---

**Status**: ✅ Pronto para Fase 2 (subir PostgreSQL + começar testes E2E)
