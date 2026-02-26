

## Plano de Otimização de Performance

### Problemas Identificados

1. **Reception.tsx (problema principal)**: A cada mudança realtime em qualquer ticket, a recepção faz um `fetchTickets()` completo — recarrega TODOS os tickets do dia. Com 25 máquinas, cada chamada gera 25+ refetches simultâneos no banco.

2. **useTickets.ts**: Já faz updates inline no realtime (bom), mas o `fetchTickets` inicial busca até 50 tickets sem necessidade em alguns contextos.

3. **PublicPanel.tsx**: O relógio atualiza a cada 1 segundo (re-render constante), mas isso é menor.

### Mudanças Propostas

#### 1. Reception — Eliminar refetch completo no realtime
Em vez de chamar `fetchTickets()` a cada evento realtime, processar as mudanças inline (INSERT, UPDATE, DELETE) diretamente no state, igual ao `useTickets.ts` já faz. Isso elimina ~25 queries simultâneas por chamada.

#### 2. Adicionar índices no banco de dados
Criar índices compostos para as queries mais frequentes:
- `tickets(unit_id, status, created_at)` — usado pelo Dashboard e useTickets
- `tickets(unit_id, called_at)` — usado pelo PublicPanel
- `tickets(unit_id, created_at)` — usado pela Reception

#### 3. Limitar dados carregados pela Reception
Carregar apenas os últimos 100 tickets ao invés de todos do dia. Os contadores (stats) podem ser calculados com uma query COUNT separada e mais leve.

#### 4. Reduzir re-renders do PublicPanel
Mover o relógio para um componente isolado para que o timer de 1 segundo não cause re-render de toda a página.

### Detalhes Técnicos

**Arquivos modificados:**
- `src/pages/Reception.tsx` — Substituir refetch completo por processamento inline de eventos realtime
- `src/pages/PublicPanel.tsx` — Extrair componente de relógio
- Nova migration SQL — Adicionar índices de performance

**Sem alterações em:**
- Edge functions (já são eficientes)
- Estrutura do banco de dados
- useTickets.ts (já otimizado)
- Funcionalidades existentes

