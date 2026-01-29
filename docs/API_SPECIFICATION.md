# Backend API Specification

## Visão Geral

Este documento descreve a API REST esperada pelo frontend para o sistema FilaFácil.
O backend deve ser implementado em Node.js (Express ou NestJS) com:

- Autenticação JWT integrada com LDAP/Active Directory
- Banco de dados Oracle
- Logs de auditoria
- WebSocket para atualizações em tempo real

## Arquitetura Sugerida do Backend

```
backend/
├── src/
│   ├── config/
│   │   ├── database.config.ts       # Configuração Oracle
│   │   ├── ldap.config.ts           # Configuração LDAP/AD
│   │   └── jwt.config.ts            # Configuração JWT
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── tickets.controller.ts
│   │   ├── counters.controller.ts
│   │   ├── users.controller.ts
│   │   ├── settings.controller.ts
│   │   └── audit.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── ldap.service.ts          # Integração LDAP/AD
│   │   ├── tickets.service.ts
│   │   ├── counters.service.ts
│   │   ├── users.service.ts
│   │   ├── settings.service.ts
│   │   └── audit.service.ts
│   ├── repositories/
│   │   ├── tickets.repository.ts
│   │   ├── counters.repository.ts
│   │   ├── users.repository.ts
│   │   └── audit.repository.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts       # JWT validation
│   │   ├── audit.middleware.ts      # Request logging
│   │   ├── error.middleware.ts
│   │   └── validation.middleware.ts
│   ├── entities/
│   │   ├── user.entity.ts
│   │   ├── ticket.entity.ts
│   │   ├── counter.entity.ts
│   │   ├── unit.entity.ts
│   │   ├── settings.entity.ts
│   │   └── audit-log.entity.ts
│   ├── websocket/
│   │   └── websocket.gateway.ts     # WebSocket server
│   ├── utils/
│   │   └── oracle.utils.ts
│   └── app.ts
├── .env.example
├── package.json
└── tsconfig.json
```

## Variáveis de Ambiente

```env
# Server
PORT=3001
NODE_ENV=production

# Database (Oracle)
ORACLE_USER=filafacil
ORACLE_PASSWORD=your_password
ORACLE_CONNECTION_STRING=//localhost:1521/ORCL
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=10

# JWT
JWT_SECRET=your-256-bit-secret-key
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# LDAP/Active Directory
LDAP_URL=ldap://your-domain-controller:389
LDAP_BASE_DN=DC=yourdomain,DC=local
LDAP_BIND_DN=CN=ldapuser,OU=Service Accounts,DC=yourdomain,DC=local
LDAP_BIND_PASSWORD=ldap_password
LDAP_USER_SEARCH_BASE=OU=Users,DC=yourdomain,DC=local
LDAP_USER_SEARCH_FILTER=(sAMAccountName={{username}})
LDAP_GROUP_SEARCH_BASE=OU=Groups,DC=yourdomain,DC=local

# WebSocket
WS_PORT=3002
WS_PATH=/ws
```

## Endpoints da API

### Autenticação

#### POST /api/v1/auth/login
Login com email/senha local.

**Request:**
```json
{
  "email": "usuario@exemplo.com",
  "password": "senha123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 28800,
  "user": {
    "id": "uuid",
    "user_id": "uuid",
    "email": "usuario@exemplo.com",
    "full_name": "Nome do Usuário",
    "matricula": "123456",
    "unit_id": "uuid",
    "is_active": true,
    "roles": ["attendant"]
  }
}
```

#### POST /api/v1/auth/ldap
Login com LDAP/Active Directory.

**Request:**
```json
{
  "username": "usuario.ad",
  "password": "senha_ad",
  "domain": "DOMINIO"
}
```

**Response:** Mesmo formato do login local.

#### POST /api/v1/auth/refresh
Renovar token de acesso.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### POST /api/v1/auth/logout
Invalidar tokens.

#### GET /api/v1/auth/me
Obter usuário autenticado.

---

### Tickets (Senhas)

#### GET /api/v1/tickets
Listar senhas com filtros.

**Query Parameters:**
- `unit_id` (string) - Filtrar por unidade
- `status` (string) - Filtrar por status (comma-separated)
- `ticket_type` (string) - normal | preferential
- `attendant_id` (string) - Filtrar por atendente
- `date_from` (string) - Data inicial ISO
- `date_to` (string) - Data final ISO

#### POST /api/v1/tickets
Criar nova senha.

**Request:**
```json
{
  "unit_id": "uuid",
  "ticket_type": "normal",
  "client_name": "Nome do Cliente",
  "client_cpf": "12345678900"
}
```

#### POST /api/v1/tickets/call-next
Chamar próxima senha da fila.

**Request:**
```json
{
  "counter_id": "uuid",
  "attendant_id": "uuid"
}
```

#### POST /api/v1/tickets/:id/repeat
Repetir chamada de uma senha.

#### POST /api/v1/tickets/:id/start
Iniciar atendimento.

#### POST /api/v1/tickets/:id/complete
Finalizar atendimento.

#### POST /api/v1/tickets/:id/skip
Pular senha.

**Request:**
```json
{
  "reason": "Cliente não compareceu"
}
```

#### POST /api/v1/tickets/:id/cancel
Cancelar senha.

**Request:**
```json
{
  "reason": "Senha emitida por engano"
}
```

---

### Counters (Guichês)

#### GET /api/v1/counters
Listar guichês.

**Query Parameters:**
- `unit_id` (string) - Filtrar por unidade

#### POST /api/v1/counters
Criar guichê.

**Request:**
```json
{
  "unit_id": "uuid",
  "number": 1,
  "name": "Guichê 1"
}
```

#### PATCH /api/v1/counters/:id
Atualizar guichê.

#### DELETE /api/v1/counters/:id
Excluir guichê.

#### POST /api/v1/counters/:id/assign
Atribuir atendente ao guichê.

**Request:**
```json
{
  "attendant_id": "uuid"
}
```

#### POST /api/v1/counters/:id/release
Liberar guichê (remover atendente).

---

### Users (Usuários)

#### GET /api/v1/users
Listar usuários com suas roles.

#### GET /api/v1/users/:id
Obter usuário específico.

#### POST /api/v1/users
Criar usuário.

**Request:**
```json
{
  "email": "novo@exemplo.com",
  "password": "senha123",
  "full_name": "Nome Completo",
  "role": "attendant",
  "unit_id": "uuid",
  "matricula": "123456",
  "cpf": "12345678900",
  "birth_date": "1990-01-15"
}
```

#### PATCH /api/v1/users/:id
Atualizar usuário.

#### PUT /api/v1/users/roles/:userId
Atualizar role do usuário.

**Request:**
```json
{
  "role": "admin"
}
```

#### GET /api/v1/users/profile
Obter perfil do usuário logado.

#### PATCH /api/v1/users/profile
Atualizar perfil do usuário logado.

---

### Units e Settings

#### GET /api/v1/units/:id
Obter dados da unidade.

#### PATCH /api/v1/units/:id
Atualizar unidade.

#### GET /api/v1/units/:id/settings
Obter configurações da unidade.

#### PATCH /api/v1/units/:id/settings
Atualizar configurações.

---

### Audit Logs

#### GET /api/v1/audit-logs
Listar logs de auditoria com paginação.

**Query Parameters:**
- `page` (number) - Página atual
- `pageSize` (number) - Itens por página
- `user_id` (string) - Filtrar por usuário
- `unit_id` (string) - Filtrar por unidade
- `action` (string) - Filtrar por ação
- `entity_type` (string) - Filtrar por tipo de entidade
- `date_from` (string) - Data inicial
- `date_to` (string) - Data final

**Response:**
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "pageSize": 50,
  "totalPages": 3
}
```

---

## WebSocket Events

### Conexão
```
ws://localhost:3002/ws?token=JWT_TOKEN
```

### Eventos Emitidos pelo Servidor

#### ticket_called
Emitido quando uma senha é chamada.

```json
{
  "type": "ticket_called",
  "data": {
    "ticket": { ... },
    "counter": { ... }
  }
}
```

#### ticket_updated
Emitido quando uma senha é atualizada.

```json
{
  "type": "ticket_updated",
  "data": {
    "ticket": { ... },
    "action": "created" | "called" | "started" | "completed" | "skipped" | "cancelled"
  }
}
```

---

## Schema do Banco Oracle

```sql
-- Unidades
CREATE TABLE units (
  id VARCHAR2(36) PRIMARY KEY,
  name VARCHAR2(255) NOT NULL,
  logo_url VARCHAR2(500),
  primary_color VARCHAR2(7),
  secondary_color VARCHAR2(7),
  voice_enabled NUMBER(1) DEFAULT 1,
  voice_speed NUMBER(3,1) DEFAULT 1.0,
  voice_message_template VARCHAR2(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Configurações
CREATE TABLE settings (
  id VARCHAR2(36) PRIMARY KEY,
  unit_id VARCHAR2(36) NOT NULL UNIQUE,
  normal_priority NUMBER(10) DEFAULT 5,
  preferential_priority NUMBER(10) DEFAULT 10,
  auto_reset_daily NUMBER(1) DEFAULT 1,
  reset_time VARCHAR2(8) DEFAULT '00:00:00',
  lock_timeout_seconds NUMBER(10) DEFAULT 300,
  max_retry_attempts NUMBER(10) DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_unit FOREIGN KEY (unit_id) REFERENCES units(id)
);

-- Perfis de usuário
CREATE TABLE profiles (
  id VARCHAR2(36) PRIMARY KEY,
  user_id VARCHAR2(36) NOT NULL UNIQUE,
  email VARCHAR2(255) NOT NULL UNIQUE,
  full_name VARCHAR2(255) NOT NULL,
  matricula VARCHAR2(50) UNIQUE,
  cpf VARCHAR2(11) UNIQUE,
  birth_date DATE,
  avatar_url VARCHAR2(500),
  is_active NUMBER(1) DEFAULT 1,
  unit_id VARCHAR2(36),
  last_login_at TIMESTAMP,
  current_session_id VARCHAR2(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_unit FOREIGN KEY (unit_id) REFERENCES units(id)
);

-- Roles de usuário
CREATE TABLE user_roles (
  id VARCHAR2(36) PRIMARY KEY,
  user_id VARCHAR2(36) NOT NULL,
  role VARCHAR2(20) NOT NULL CHECK (role IN ('admin', 'attendant', 'recepcao')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_roles_user FOREIGN KEY (user_id) REFERENCES profiles(user_id)
);

-- Guichês
CREATE TABLE counters (
  id VARCHAR2(36) PRIMARY KEY,
  unit_id VARCHAR2(36) NOT NULL,
  number NUMBER(10) NOT NULL,
  name VARCHAR2(100),
  is_active NUMBER(1) DEFAULT 1,
  current_attendant_id VARCHAR2(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_counters_unit FOREIGN KEY (unit_id) REFERENCES units(id)
);

-- Senhas
CREATE TABLE tickets (
  id VARCHAR2(36) PRIMARY KEY,
  unit_id VARCHAR2(36) NOT NULL,
  ticket_type VARCHAR2(20) NOT NULL CHECK (ticket_type IN ('normal', 'preferential')),
  ticket_number NUMBER(10) NOT NULL,
  display_code VARCHAR2(20) NOT NULL,
  status VARCHAR2(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'in_service', 'completed', 'cancelled', 'skipped')),
  priority NUMBER(10) DEFAULT 5,
  client_name VARCHAR2(255),
  client_cpf VARCHAR2(11),
  attendant_id VARCHAR2(36),
  counter_id VARCHAR2(36),
  called_at TIMESTAMP,
  service_started_at TIMESTAMP,
  completed_at TIMESTAMP,
  skip_reason VARCHAR2(500),
  cancel_reason VARCHAR2(500),
  locked_at TIMESTAMP,
  locked_by VARCHAR2(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_unit FOREIGN KEY (unit_id) REFERENCES units(id),
  CONSTRAINT fk_tickets_counter FOREIGN KEY (counter_id) REFERENCES counters(id)
);

-- Contadores diários
CREATE TABLE ticket_counters (
  id VARCHAR2(36) PRIMARY KEY,
  unit_id VARCHAR2(36) NOT NULL,
  ticket_type VARCHAR2(20) NOT NULL,
  counter_date DATE NOT NULL,
  last_number NUMBER(10) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tcounters_unit FOREIGN KEY (unit_id) REFERENCES units(id),
  CONSTRAINT uq_ticket_counter UNIQUE (unit_id, ticket_type, counter_date)
);

-- Logs de auditoria
CREATE TABLE audit_logs (
  id VARCHAR2(36) PRIMARY KEY,
  user_id VARCHAR2(36),
  unit_id VARCHAR2(36),
  action VARCHAR2(100) NOT NULL,
  entity_type VARCHAR2(50) NOT NULL,
  entity_id VARCHAR2(36),
  details CLOB,
  ip_address VARCHAR2(45),
  user_agent VARCHAR2(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX idx_tickets_unit_status ON tickets(unit_id, status);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
```

---

## Middleware de Auditoria

Todas as requisições devem ser logadas para auditoria:

```typescript
// Exemplo de implementação
export function auditMiddleware(req, res, next) {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const auditLog = {
      id: generateUUID(),
      user_id: req.user?.id,
      unit_id: req.user?.unit_id,
      action: `${req.method} ${req.path}`,
      entity_type: extractEntityType(req.path),
      entity_id: req.params.id,
      details: JSON.stringify({
        method: req.method,
        path: req.path,
        query: req.query,
        statusCode: res.statusCode,
        duration: Date.now() - startTime,
      }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
    };
    
    // Salvar no banco assincronamente
    auditRepository.save(auditLog);
  });
  
  next();
}
```

---

## Headers de Requisição

Todas as requisições devem incluir:

- `Authorization: Bearer <token>` (exceto login)
- `Content-Type: application/json`
- `X-Request-ID: <uuid>` (para rastreamento)
- `X-Client-Info: filafacil-web/1.0`

---

## Códigos de Erro

| Código | Descrição |
|--------|-----------|
| 400 | Requisição inválida |
| 401 | Não autenticado |
| 403 | Acesso negado |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: guichê já ocupado) |
| 422 | Entidade não processável |
| 500 | Erro interno do servidor |

---

## Segurança

1. **Autenticação JWT** com tokens de curta duração (8h)
2. **Refresh tokens** de longa duração (7d)
3. **Rate limiting** para prevenir ataques
4. **CORS** configurado apenas para origens permitidas
5. **Helmet.js** para headers de segurança
6. **Validação de entrada** com class-validator
7. **Sanitização** de dados para prevenir SQL injection
8. **Logs de auditoria** para todas as operações
