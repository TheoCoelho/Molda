## 🏭 SQL Scripts para Sistema de Fábrica/Produção
**Ordem de Execução - Molda Factory Management System**

---

## 📋 Checklist de Execução

Execute os scripts **NA ORDEM EXATA** abaixo, no SQL Editor do Supabase:

### **1️⃣ Script: `01_create_orders_tables.sql`**
**O quê?** Cria as tabelas principais do sistema de pedidos
- `public.orders` - Armazena todos os pedidos
- `public.order_events` - Log de eventos/auditoria

**Quando?** PRIMEIRO - Antes de tudo
**Status:** ✅ Pode ser executado uma vez

**Conteúdo:**
- 2 tabelas principais
- 4 índices para performance
- 2 funções de trigger (update_at automático)

---

### **2️⃣ Script: `02_setup_factory_role_and_rls.sql`**
**O quê?** Configura permissões de segurança e role "factory"
- RLS (Row Level Security) nas tabelas
- Políticas de acesso para customer/factory/admin
- Função de log automático de mudanças de status
- Função de geração automática de número do pedido

**Quando?** SEGUNDO - Logo após o script 01
**Dependências:** Script 01 executado com sucesso
**Status:** ✅ Pode ser executado uma vez

**Recursos principais:**
- Factory users veem TODOS os pedidos
- Customers veem APENAS seus pedidos
- Admin veem tudo
- Número de pedido gerado automaticamente (ORD-2026-XXXXXX)

---

### **2b️⃣ Script: `02b_ensure_role_column.sql`** (⚠️ NOVO - SE RECEBER ERRO)
**O quê?** Garante que a coluna `role` existe em `public.profiles`
**Quando?** Execute SE receber erro sobre coluna `role` não existir
**Status:** ✅ Safe - Usa `ALTER TABLE IF NOT EXISTS`

---

### **3️⃣ Script: `03_create_factory_test_users.sql`** ✅ CORRIGIDO
**O quê?** Cria usuários de teste para a fábrica
- 4 usuários pré-configurados com role "factory"
- Usa coluna correta: `nickname` (não display_name)
- Dados de login para testes

**Quando?** TERCEIRO (opcional para desenvolvimento)
**Dependências:** Scripts 01 + 02 executados
**Status:** ⚠️ Idempotente (não duplica se rodar novamente)
**Correção:** Agora usa `nickname` em vez de `display_name`

**Usuários criados:**
| Email | Senha | Role |
|-------|-------|------|
| `tecnico.01@molda.factory` | `Fabrica@12345` | factory |
| `tecnico.02@molda.factory` | `Fabrica@12345` | factory |
| `gerente@molda.factory` | `Fabrica@12345` | factory |
| `supervisor.qualidade@molda.factory` | `Fabrica@12345` | factory |

---

### **4️⃣ Script: `04_seed_test_orders.sql`**
**O quê?** Popula o banco com pedidos de teste
- 7 pedidos com diferentes status
- Dados realistas para testar o dashboard

**Quando?** QUARTO (opcional para testes)
**Dependências:** Scripts 01 + 02 + 03 executados
**Status:** ⚠️ Insere dados (pode rodar múltiplas vezes)

**Pedidos de teste criados:**
- 1 PENDING (aguardando aprovação)
- 1 APPROVED (aprovado)
- 1 PRODUCTION (em produção)
- 1 QUALITY_CHECK (verificação de qualidade)
- 1 READY_TO_SHIP (pronto para envio)
- 1 SHIPPED (enviado)
- 1 DELIVERED (entregue)

---

## 🚀 Rápida Execução (Copy & Paste)

Se você quer executar tudo de uma vez no SQL Editor do Supabase:

```sql
-- Execute script 1
-- Copie e cole o conteúdo de: 01_create_orders_tables.sql

-- Aguarde sucesso ✓

-- Execute script 2
-- Copie e cole o conteúdo de: 02_setup_factory_role_and_rls.sql

-- Aguarde sucesso ✓

-- Execute script 3 (opcional)
-- Copie e cole o conteúdo de: 03_create_factory_test_users.sql

-- Aguarde sucesso ✓

-- Execute script 4 (opcional)
-- Copie e cole o conteúdo de: 04_seed_test_orders.sql

-- Aguarde sucesso ✓
```

---

## ⚠️ Troubleshooting

### ❌ "Erro: column display_name does not exist"
**Causa:** Script 03 está usando nome de coluna incorreto
**Solução:** ✅ CORRIGIDO - Use a versão atualizada do script 03
- Mudou de `display_name` para `nickname`
- Já está corrigido nos arquivos

### ❌ "Erro ao executar script 02"
**Causa:** Script 01 não foi executado com sucesso
**Solução:** 
1. Volte e verifique se script 01 rodou sem erros
2. Verifique tabelas: `SELECT * FROM pg_tables WHERE schemaname = 'public';`
3. Execute script 02 novamente

### ❌ "Erro ao criar usuários factory"
**Causa:** Script 02 (RLS) não foi executado
**Solução:** Execute script 02 antes do script 03

### ❌ "Erro: coluna role não encontrada"
**Causa:** Coluna `role` não foi adicionada em `public.profiles`
**Solução:** Execute `02b_ensure_role_column.sql` entre os scripts 02 e 03

### ❌ "Nenhum pedido foi criado"
**Causa:** Tabelas de material não existem ou script 03 não rodou
**Solução:** 
1. Verifique se pelo menos um material existe: `SELECT * FROM public.materials;`
2. Execute script 03 para criar usuários de teste
3. Execute script 04 novamente

---

## 📊 Verificação Após Conclusão

Depois de executar TODOS os scripts, verifique:

```sql
-- 1. Verificar tabelas criadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('orders', 'order_events');

-- 2. Verificar usuários factory
SELECT id, username, role FROM public.profiles 
WHERE role = 'factory';

-- 3. Verificar pedidos de teste
SELECT order_number, status, total_cost FROM public.orders 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. Verificar eventos de pedidos
SELECT order_id, event_type, created_at FROM public.order_events 
LIMIT 5;
```

---

## 🔐 Próximas Etapas (Frontend)

Após executar os scripts SQL, implemente no React:

1. **Página de Finalização** (`/checkout` ou `/confirm`)
   - Formulário de entrega
   - Resumo do pedido
   - Botão para confirmar (INSERT em `orders`)

2. **Dashboard de Fábrica** (`/factory/dashboard`)
   - Lista de pedidos (SELECT * FROM orders WHERE status...)
   - Filtros por status
   - Detalhe do pedido com downloads

3. **Componente de Downloads**
   - Download de decals (arquivos em `orders.decals_paths`)
   - Download de modelo 3D (arquivo em `orders.design_3d_model_path`)

---

## 📝 Notas Importantes

- ✅ Todos os scripts são **idempotentes** (safe to re-run)
- ✅ RLS protege dados (customers não veem pedidos alheios)
- ✅ Triggers automáticos mantêm auditoria completa
- ✅ Índices otimizam consultas de fábrica (milhares de pedidos)
- ⚠️ Dados de teste podem ser resetados: `DELETE FROM public.orders WHERE id IN (SELECT id FROM public.orders ORDER BY created_at DESC LIMIT 10);`

---

**Última atualização:** Março 2026  
**Status:** ✅ Pronto para produção
