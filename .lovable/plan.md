
# Plano: Corrigir Reset e Validação de Senhas no Modo Manual

## Problema Identificado

Após análise detalhada, identifiquei **3 problemas críticos**:

1. **Reset não deleta tickets**: O código atual usa o cliente Supabase normal que está sujeito a RLS. Mesmo com a policy de DELETE criada, pode haver problemas de autenticação ou timing.

2. **Validação no frontend está errada**: A Reception.tsx valida `ticketNum <= lastGeneratedNumber`, mas o `lastGeneratedNumber` vem do banco de dados (onde os tickets ainda existem porque o reset falhou).

3. **Edge function também valida contra banco**: A função `create-ticket` busca a última senha no banco e bloqueia se o número não for maior.

## Solução

### Parte 1: Criar Edge Function para Reset (Bypass RLS)

Criar uma nova edge function `reset-system` que usa a **service role key** para deletar tickets e contadores, ignorando completamente o RLS.

```text
supabase/functions/reset-system/index.ts
```

A função vai:
- Receber a confirmação de senha do admin
- Verificar a autenticação
- Deletar TODOS os tickets do dia usando service role
- Deletar contadores do dia
- Retornar sucesso

### Parte 2: Modificar ManualModeSettingsCard para Usar a Edge Function

Alterar o código de reset para chamar a edge function ao invés de tentar deletar diretamente:

```text
src/components/admin/ManualModeSettingsCard.tsx
```

Trocar:
```typescript
// Antes: delete direto (falha por RLS)
await supabase.from('tickets').delete()...

// Depois: chamar edge function
await supabase.functions.invoke('reset-system', { body: { unit_id } })
```

### Parte 3: Corrigir Validação na Reception.tsx

Simplificar a validação para aceitar qualquer número >= mínimo configurado. A validação de duplicatas é feita no backend:

```text
src/pages/Reception.tsx
```

Remover a validação contra `lastGeneratedNumber` no frontend:
```typescript
// REMOVER estas linhas:
if (lastGeneratedNumber !== null && ticketNum <= lastGeneratedNumber) {
  toast.error(`O número da senha deve ser maior que ${lastGeneratedNumber}`);
  return;
}
```

A edge function `create-ticket` já valida duplicatas corretamente.

### Parte 4: Ajustar Edge Function create-ticket

Modificar a validação para ser menos restritiva após um reset:

```text
supabase/functions/create-ticket/index.ts
```

Remover a validação "deve ser maior que última gerada". Manter apenas:
1. Número >= mínimo configurado
2. Número não duplicado (já existe)

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/reset-system/index.ts` | CRIAR | Nova edge function para reset com service role |
| `src/components/admin/ManualModeSettingsCard.tsx` | MODIFICAR | Usar edge function para reset |
| `src/pages/Reception.tsx` | MODIFICAR | Remover validação contra lastGeneratedNumber |
| `supabase/functions/create-ticket/index.ts` | MODIFICAR | Remover validação "maior que última" |

## Fluxo Corrigido Após Implementação

```text
Admin clica Reset → confirma senha
         |
         v
Chama edge function reset-system (service role)
         |
         v
Edge function deleta TODOS tickets e contadores (bypass RLS)
         |
         v
Retorna sucesso + broadcast reset
         |
         +---> Reception: limpa estado local
         |
         +---> useManualModeSettings: zera lastGeneratedNumber
         |
         v
Recepção pode gerar senha 176 (>= mínimo configurado)
         |
         v
Edge function aceita: 176 >= 176 e não existe no banco
```

## Resultado Esperado

1. Reset apaga TODOS os tickets do dia instantaneamente
2. Estatísticas zeram imediatamente
3. Próxima senha começa do número mínimo configurado (176)
4. Não há mais bloqueio por "última senha gerada"
