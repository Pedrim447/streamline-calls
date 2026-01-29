# Estrutura do Projeto FilaFácil

## Visão Geral

Este projeto está preparado para migração de Supabase para um backend on-premise Node.js com Oracle.

## Estrutura de Pastas do Frontend

```
src/
├── assets/                    # Recursos estáticos (imagens, logos)
│   └── tre-logo.png
│
├── components/                # Componentes React reutilizáveis
│   ├── admin/                 # Componentes do painel administrativo
│   │   ├── AttendantsTab.tsx  # Gerenciamento de usuários
│   │   ├── CountersTab.tsx    # Gerenciamento de guichês
│   │   ├── SettingsTab.tsx    # Configurações do sistema
│   │   └── AuditLogsTab.tsx   # Logs de auditoria
│   │
│   ├── dashboard/             # Componentes do dashboard do atendente
│   │   ├── CurrentTicket.tsx  # Senha atual em atendimento
│   │   ├── SkipTicketDialog.tsx # Dialog para pular senha
│   │   ├── StatsCards.tsx     # Cards de estatísticas
│   │   └── TicketQueue.tsx    # Fila de senhas
│   │
│   ├── ui/                    # Componentes de UI (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   └── ... (outros componentes)
│   │
│   ├── FloatingWidget.tsx     # Widget flutuante
│   └── NavLink.tsx            # Link de navegação
│
├── config/                    # Configurações da aplicação
│   └── api.config.ts          # ✨ NOVO: Configuração da API REST
│
├── contexts/                  # Contextos React
│   ├── AuthContext.tsx        # Contexto de auth (Supabase - legado)
│   ├── AuthContextREST.tsx    # ✨ NOVO: Contexto de auth para API REST
│   └── WebSocketContext.tsx   # ✨ NOVO: Contexto WebSocket
│
├── hooks/                     # Custom hooks
│   ├── useCallCooldown.ts     # Cooldown entre chamadas
│   ├── useTickets.ts          # Hook para tickets (usa Supabase)
│   ├── useVoice.ts            # Hook para síntese de voz
│   ├── useRealtimeChannel.ts  # Hook para realtime (Supabase)
│   └── use-mobile.tsx         # Detecção de mobile
│
├── integrations/              # Integrações externas
│   └── supabase/              # ⚠️ LEGADO: Será removido
│       ├── client.ts          # Cliente Supabase
│       └── types.ts           # Tipos gerados
│
├── lib/                       # Utilitários e bibliotecas
│   ├── api.ts                 # ✨ NOVO: Cliente HTTP para API REST
│   └── utils.ts               # Funções utilitárias (cn, etc)
│
├── pages/                     # Páginas da aplicação
│   ├── Admin.tsx              # Painel administrativo
│   ├── Auth.tsx               # Página de login
│   ├── Dashboard.tsx          # Dashboard do atendente
│   ├── NotFound.tsx           # Página 404
│   ├── PublicPanel.tsx        # Painel público (TV)
│   ├── Reception.tsx          # Recepção (emissão de senhas)
│   └── Widget.tsx             # Widget popup
│
├── services/                  # ✨ NOVO: Serviços de API
│   ├── index.ts               # Export central
│   ├── auth.service.ts        # Serviço de autenticação
│   ├── tickets.service.ts     # Serviço de senhas
│   ├── counters.service.ts    # Serviço de guichês
│   ├── users.service.ts       # Serviço de usuários
│   ├── settings.service.ts    # Serviço de configurações
│   └── audit.service.ts       # Serviço de auditoria
│
├── types/                     # ✨ NOVO: Tipos TypeScript
│   └── api.types.ts           # Tipos da API REST
│
├── App.tsx                    # Componente raiz
├── App.css                    # Estilos globais
├── index.css                  # Estilos Tailwind
├── main.tsx                   # Entry point
└── vite-env.d.ts              # Tipos Vite
```

## Migração: Passos Necessários

### 1. Configurar Variáveis de Ambiente

Adicione ao `.env`:

```env
VITE_API_URL=http://seu-servidor:3001/api
```

### 2. Trocar o AuthContext

Em `src/App.tsx`, substitua:

```tsx
// De:
import { AuthProvider } from '@/contexts/AuthContext';

// Para:
import { AuthProvider } from '@/contexts/AuthContextREST';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// E envolva com WebSocketProvider:
<AuthProvider>
  <WebSocketProvider>
    {/* ... */}
  </WebSocketProvider>
</AuthProvider>
```

### 3. Atualizar Componentes

Cada componente que usa Supabase diretamente deve ser atualizado para usar os novos serviços:

```tsx
// De:
import { supabase } from '@/integrations/supabase/client';
const { data } = await supabase.from('tickets').select('*');

// Para:
import { ticketsService } from '@/services';
const { data } = await ticketsService.getTickets({ unit_id: unitId });
```

### 4. Atualizar Hook useTickets

O hook `useTickets.ts` precisa ser reescrito para usar `ticketsService` e `useWebSocket`.

### 5. Atualizar Página de Login

A página `Auth.tsx` precisa suportar login LDAP:

```tsx
import { useAuth } from '@/contexts/AuthContextREST';

const { signIn, signInWithLdap } = useAuth();

// Login LDAP
const handleLdapLogin = async () => {
  const { error } = await signInWithLdap(username, password, domain);
};
```

## Arquivos Novos Criados

| Arquivo | Descrição |
|---------|-----------|
| `src/config/api.config.ts` | Configuração de endpoints da API |
| `src/lib/api.ts` | Cliente HTTP com suporte a JWT |
| `src/types/api.types.ts` | Tipos TypeScript para a API |
| `src/services/*.ts` | Serviços para cada entidade |
| `src/contexts/AuthContextREST.tsx` | Contexto de auth para JWT/LDAP |
| `src/contexts/WebSocketContext.tsx` | Contexto para WebSocket |
| `docs/API_SPECIFICATION.md` | Especificação da API |

## Dependências Sugeridas para o Backend

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "oracledb": "^6.2.0",
    "jsonwebtoken": "^9.0.2",
    "ldapjs": "^3.0.7",
    "bcryptjs": "^2.4.3",
    "uuid": "^9.0.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1",
    "ws": "^8.14.2",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/bcryptjs": "^2.4.6",
    "@types/ws": "^8.5.10",
    "typescript": "^5.3.2",
    "tsx": "^4.6.2"
  }
}
```

## Notas Importantes

1. **Os arquivos Supabase ainda existem** para manter compatibilidade temporária
2. **Não modifique** `src/integrations/supabase/types.ts` diretamente
3. **Implemente o backend** seguindo `docs/API_SPECIFICATION.md`
4. **Teste localmente** antes de implantar em produção
5. **Configure HTTPS** em ambiente de produção
