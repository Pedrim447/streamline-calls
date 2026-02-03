
# Plano: Painel de Chamadas Protegido com Correções

## Resumo das Alterações Solicitadas

O objetivo é transformar o painel público em uma tela protegida por login, corrigir os problemas de atualização em tempo real, remover a exibição de nomes de clientes, e corrigir o histórico de senhas.

---

## 1. Criar Nova Função de Usuário "painel"

### Banco de Dados
Adicionar nova role ao enum `app_role`:

```sql
ALTER TYPE public.app_role ADD VALUE 'painel';
```

### Criar Usuário Painel
Será necessário criar um usuário específico para o painel através do painel administrativo ou via Edge Function `admin-create-user` com a role `painel`.

---

## 2. Proteger o Painel com Autenticação

### Modificar `src/pages/PublicPanel.tsx`

**Adicionar verificação de autenticação:**
- Importar `useAuth` do contexto
- Verificar se o usuário está logado e possui a role `painel` ou `admin`
- Redirecionar para `/auth` se não autenticado
- Remover overlay de "Ativar Som" (som será ativado automaticamente após login)

**Código conceitual:**
```typescript
const { user, roles, isLoading } = useAuth();

useEffect(() => {
  if (!isLoading && !user) {
    navigate('/auth');
  }
}, [user, isLoading]);

// Verificar se tem permissão
const isPainelUser = roles.includes('painel') || roles.includes('admin');
if (!isPainelUser) {
  return <div>Acesso negado</div>;
}
```

---

## 3. Corrigir Atualização em Tempo Real

### Problema Identificado
O painel não está atualizando em tempo real porque:
1. A RLS policy `Public can view called tickets` requer que o ticket tenha status `called` ou `in_service`
2. O realtime não está filtrando por unit_id
3. O painel precisa de um usuário autenticado para receber eventos via RLS

### Solução

**Atualizar a subscrição realtime para:**
- Usar o `unit_id` do perfil do usuário logado
- Adicionar filtro por `unit_id` no canal de realtime
- Usar `useRealtimeChannel` ou implementação similar

**Modificar o código de subscrição:**
```typescript
const unitId = profile?.unit_id || DEFAULT_UNIT_ID;

const channel = supabase
  .channel(`panel-tickets-${unitId}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'tickets',
      filter: `unit_id=eq.${unitId}`,
    },
    (payload) => {
      // Lógica de atualização
    }
  )
  .subscribe();
```

---

## 4. Remover Nome do Cliente da Exibição

### Modificar `src/pages/PublicPanel.tsx`

**Remover exibição do nome em:**

1. **Ticket atual (linhas 402-409):** Remover completamente o bloco que mostra `formatClientName`
2. **Histórico (linhas 483-487):** Remover a linha que mostra o nome do cliente
3. **Chamada por voz:** Remover `clientName` das opções de `callTicket`

**Antes:**
```typescript
callTicketRef.current(updatedTicket.display_code, counter.number, {
  ticketType: updatedTicket.ticket_type,
  clientName: updatedTicket.client_name,
});
```

**Depois:**
```typescript
callTicketRef.current(updatedTicket.display_code, counter.number, {
  ticketType: updatedTicket.ticket_type,
});
```

---

## 5. Corrigir Histórico de Senhas

### Problema Identificado
- O histórico mostra senhas muito antigas (de dias anteriores)
- Após reset, as senhas antigas não são limpas da tela

### Solução

**Modificar consulta inicial para filtrar por data de hoje:**
```typescript
const today = new Date().toISOString().split('T')[0];

const { data: ticketData } = await supabase
  .from('tickets')
  .select('*')
  .eq('unit_id', unitId)
  .in('status', ['called', 'in_service'])
  .not('called_at', 'is', null)
  .gte('created_at', `${today}T00:00:00`)
  .order('called_at', { ascending: false })
  .limit(6);
```

**Garantir que o reset limpe o estado:**
- O broadcast `system_reset` já está configurado para limpar `currentTicket`, `lastCalls` e `lastCalledAtRef`
- Verificar se o canal de reset está correto (usar mesmo unit_id)

---

## 6. Atualizar Auth.tsx para Redirecionar Usuário "painel"

### Modificar `src/pages/Auth.tsx`

Adicionar redirecionamento específico para a role `painel`:

```typescript
useEffect(() => {
  if (user && !authLoading) {
    setIsLoggingIn(true);
    
    const isPainel = roles.includes('painel');
    const isRecepcao = roles.includes('recepcao');
    
    let targetRoute = '/dashboard';
    if (isPainel) {
      targetRoute = '/painel';
    } else if (isRecepcao) {
      targetRoute = '/recepcao';
    }
    
    setTimeout(() => navigate(targetRoute), 800);
  }
}, [user, authLoading, navigate, roles]);
```

**Remover o botão "Abrir Painel Público (TV)"** da tela de login, pois agora requer autenticação.

---

## 7. Atualizar Rota do Painel

### Modificar `src/App.tsx`

O painel já está na rota `/painel`, apenas garantir que a proteção de rota funcione.

---

## Arquivos a Serem Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/PublicPanel.tsx` | Adicionar auth, corrigir realtime, remover nome, corrigir histórico |
| `src/pages/Auth.tsx` | Adicionar redirecionamento para role 'painel', remover botão público |
| Migração SQL | Adicionar nova role 'painel' ao enum |

---

## Detalhes Técnicos

### RLS Considerations
Com o usuário autenticado como `painel`:
- O realtime funcionará corretamente com o filtro de `unit_id`
- A política `Public can view called tickets` continuará funcionando
- O usuário `painel` precisa ter um `unit_id` associado no perfil

### Fluxo de Autenticação
1. Usuário acessa `/painel`
2. Se não autenticado, redireciona para `/auth`
3. Após login com role `painel`, redireciona para `/painel`
4. Som é ativado automaticamente (já existe um overlay, mas pode ser removido após auth)

### Criação do Usuário Painel
O administrador deverá criar o usuário do painel via:
- Painel Admin > Atendentes > Adicionar Usuário
- Selecionar role "painel"
- Atribuir à unidade correta
