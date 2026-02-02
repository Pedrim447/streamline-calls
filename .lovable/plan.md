
# Plano: Corrigir Reset para Limpar Completamente a Recepção

## Problema Identificado

Quando o admin clica em "Reset", o sistema não limpa completamente:
1. Os tickets **finalizados** continuam aparecendo na lista da recepção
2. As **estatísticas** (Total Hoje, Finalizados, etc.) não zeram
3. O **último número gerado** não volta para o início configurado

## Solução

### 1. Modificar o Reset para Deletar TODOS os Tickets do Dia

**Arquivo:** `src/components/admin/ManualModeSettingsCard.tsx`

Alterar a query de deleção de tickets para remover TODOS os status, não apenas `waiting`, `called`, `in_service`:

```typescript
// Antes: apenas alguns status
.in('status', ['waiting', 'called', 'in_service'])

// Depois: todos os tickets do dia
// Remover o filtro .in() para deletar TODOS
```

### 2. Atualizar o Hook useManualModeSettings para Ouvir o Broadcast de Reset

**Arquivo:** `src/hooks/useManualModeSettings.ts`

Adicionar um listener para o evento `system_reset` que zera o `lastGeneratedNumber`:

```typescript
// Adicionar channel para reset
const resetChannel = supabase
  .channel(`system-reset-manual-mode-${effectiveUnitId}`)
  .on('broadcast', { event: 'system_reset' }, () => {
    setLastGeneratedNumber(null);
  })
  .subscribe();
```

### 3. Garantir que a Recepção Limpa o Estado Corretamente

**Arquivo:** `src/pages/Reception.tsx`

O listener de reset já existe, mas precisa garantir que o `setTickets([])` acontece antes do refetch para evitar flash de dados antigos.

## Fluxo Após Correção

```text
Admin clica Reset
       |
       v
Deleta TODOS os tickets do dia (todos os status)
       |
       v  
Deleta contadores de tickets
       |
       v
Envia broadcast "system_reset"
       |
       +---> Recepção: limpa lista de tickets + refetch
       |
       +---> useManualModeSettings: zera lastGeneratedNumber
       |
       +---> Dashboard: limpa fila
       |
       +---> Painel Público: limpa histórico
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/admin/ManualModeSettingsCard.tsx` | Remover filtro `.in('status', ...)` para deletar todos os tickets |
| `src/hooks/useManualModeSettings.ts` | Adicionar listener de reset para zerar `lastGeneratedNumber` |
| `src/pages/Reception.tsx` | Garantir ordem correta de limpeza do estado |

## Resultado Esperado

Após o reset pelo admin:
- Recepção mostra 0 em todas as estatísticas
- Lista "Últimas Senhas Geradas" fica vazia
- Próximo número de senha começa do mínimo configurado
- Todos os clientes (recepção, dashboard, painel) recebem a atualização instantaneamente
