# Backend FilaFácil - Documentação Completa

## 📋 Visão Geral

Backend Node.js/Express para o sistema de gerenciamento de filas FilaFácil, projetado para ambiente governamental on-premise com banco de dados Oracle e autenticação LDAP/Active Directory.

## 🏗️ Estrutura do Projeto

```
backend/
├── src/
│   ├── config/              # Configurações centralizadas
│   │   └── index.ts         # Configuração do servidor e serviços
│   ├── database/            # Módulo de conexão Oracle
│   │   └── index.ts         # Pool de conexões Oracle
│   ├── middleware/          # Middlewares Express
│   │   ├── auth.ts          # Autenticação JWT
│   │   ├── errorHandler.ts  # Tratamento de erros
│   │   └── requestLogger.ts # Logging de requisições
│   ├── routes/              # Rotas/Controllers
│   │   ├── auth.routes.ts   # Autenticação
│   │   ├── tickets.routes.ts
│   │   ├── counters.routes.ts
│   │   ├── users.routes.ts
│   │   ├── units.routes.ts
│   │   ├── settings.routes.ts
│   │   ├── audit.routes.ts
│   │   └── health.routes.ts
│   ├── services/            # Lógica de negócio
│   │   ├── auth.service.ts
│   │   ├── ldap.service.ts  # Integração LDAP/AD
│   │   ├── tickets.service.ts
│   │   ├── counters.service.ts
│   │   ├── users.service.ts
│   │   ├── settings.service.ts
│   │   └── audit.service.ts
│   ├── utils/               # Utilitários
│   │   └── logger.ts        # Winston logging
│   ├── websocket/           # Servidor WebSocket
│   │   └── server.ts
│   └── server.ts            # Ponto de entrada
├── database/                # Scripts SQL
│   └── oracle-schema.sql    # Schema Oracle completo
├── logs/                    # Arquivos de log (gitignore)
├── .env.example             # Exemplo de variáveis de ambiente
├── package.json
└── tsconfig.json
```

## 🚀 Instalação e Execução

### Pré-requisitos

1. **Node.js 18+**
2. **Oracle Instant Client** - [Download](https://www.oracle.com/database/technologies/instant-client.html)
3. **Banco de dados Oracle** (11g, 12c, 18c, 19c ou 21c)

### Instalação do Oracle Instant Client

#### Linux
```bash
# Baixe e extraia o Instant Client
unzip instantclient-basic-linux.zip -d /opt/oracle

# Configure variáveis de ambiente
export LD_LIBRARY_PATH=/opt/oracle/instantclient_21_1:$LD_LIBRARY_PATH
export ORACLE_HOME=/opt/oracle/instantclient_21_1
```

#### Windows
```powershell
# Extraia para C:\oracle\instantclient_21_1
# Adicione ao PATH do sistema:
# C:\oracle\instantclient_21_1
```

### Configuração

1. **Copie o arquivo de ambiente:**
```bash
cd backend
cp .env.example .env
```

2. **Configure as variáveis no `.env`:**
```env
# Banco de Dados Oracle
ORACLE_CONNECTION_STRING=servidor-oracle:1521/ORCL
ORACLE_USER=filafacil
ORACLE_PASSWORD=sua_senha

# JWT
JWT_SECRET=sua_chave_secreta_muito_longa
JWT_REFRESH_SECRET=outra_chave_secreta

# LDAP (se usar autenticação AD)
LDAP_ENABLED=true
LDAP_URL=ldap://seu-ad.gov.br:389
# ... demais configurações LDAP
```

3. **Crie o schema no Oracle:**
```bash
# Execute como DBA
sqlplus sys@ORCL as sysdba
@database/oracle-schema.sql
```

4. **Instale dependências e execute:**
```bash
npm install
npm run dev    # Desenvolvimento
npm run build  # Compilar para produção
npm start      # Produção
```

## 🔐 Autenticação

### Login Local (email/senha)
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "usuario@gov.br",
  "password": "senha123"
}
```

### Login LDAP/Active Directory
```http
POST /api/v1/auth/ldap
Content-Type: application/json

{
  "username": "joao.silva",
  "password": "senha_do_ad"
}
```

### Resposta de Autenticação
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresIn": 28800,
    "user": {
      "id": "uuid",
      "email": "usuario@gov.br",
      "fullName": "Nome Completo",
      "unitId": "uuid",
      "roles": ["admin"]
    }
  }
}
```

## 📡 WebSocket

Conecte-se ao WebSocket para receber atualizações em tempo real:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?token=JWT_TOKEN');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'TICKET_CREATED':
    case 'TICKET_CALLED':
    case 'TICKET_COMPLETED':
      // Atualizar UI
      break;
  }
};
```

### Eventos WebSocket

| Evento | Descrição |
|--------|-----------|
| `CONNECTED` | Conexão estabelecida |
| `TICKET_CREATED` | Nova senha criada |
| `TICKET_CALLED` | Senha chamada |
| `TICKET_RECALLED` | Chamada repetida |
| `TICKET_IN_SERVICE` | Atendimento iniciado |
| `TICKET_COMPLETED` | Atendimento finalizado |
| `TICKET_SKIPPED` | Senha pulada |
| `TICKET_CANCELLED` | Senha cancelada |
| `COUNTER_ASSIGNED` | Atendente alocado ao guichê |
| `COUNTER_RELEASED` | Guichê liberado |

## 🔒 Configuração LDAP/Active Directory

O sistema suporta autenticação integrada com Active Directory. Configure os grupos do AD para mapear automaticamente as roles:

```env
# Grupos do AD que correspondem às roles do sistema
LDAP_ADMIN_GROUP=CN=FilaFacil-Admins,OU=Groups,DC=empresa,DC=gov,DC=br
LDAP_ATTENDANT_GROUP=CN=FilaFacil-Atendentes,OU=Groups,DC=empresa,DC=gov,DC=br
LDAP_RECEPCAO_GROUP=CN=FilaFacil-Recepcao,OU=Groups,DC=empresa,DC=gov,DC=br
```

### Fluxo de Autenticação LDAP

1. Usuário envia credenciais (username/password)
2. Backend conecta ao AD com service account
3. Busca usuário pelo sAMAccountName
4. Valida senha fazendo bind com credenciais do usuário
5. Busca grupos do usuário (memberOf)
6. Mapeia grupos para roles da aplicação
7. Cria/atualiza perfil local se necessário
8. Retorna tokens JWT

## 📊 Logs e Auditoria

### Logs da Aplicação
- Arquivo: `logs/app.log`
- Rotação: 10MB, 30 arquivos
- Formato: `timestamp [LEVEL] message {metadata}`

### Logs de Auditoria
- Arquivo: `logs/audit.log`
- Rotação: 50MB, 365 arquivos
- Formato: JSON estruturado
- Registra: ações, usuário, IP, user-agent, detalhes

### Exemplo de Log de Auditoria
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "filafacil-audit",
  "action": "TICKET_CALL",
  "entityType": "ticket",
  "entityId": "uuid",
  "userId": "uuid",
  "unitId": "uuid",
  "ipAddress": "192.168.1.100",
  "details": {
    "displayCode": "P-001",
    "counterId": "uuid"
  },
  "success": true
}
```

## 🏥 Health Checks

```http
# Health check básico
GET /api/v1/health

# Health check detalhado (com status do DB e LDAP)
GET /api/v1/health/detailed

# Kubernetes readiness
GET /api/v1/health/ready

# Kubernetes liveness
GET /api/v1/health/live
```

## 📦 Deploy em Produção

### Variáveis de Ambiente Obrigatórias

```env
NODE_ENV=production
JWT_SECRET=<chave-segura-32-chars>
JWT_REFRESH_SECRET=<outra-chave-segura>
ORACLE_PASSWORD=<senha-oracle>
```

### Systemd Service (Linux)

```ini
[Unit]
Description=FilaFácil Backend
After=network.target

[Service]
Type=simple
User=filafacil
WorkingDirectory=/opt/filafacil/backend
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Docker (Opcional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

## 🔧 Troubleshooting

### Erro de conexão Oracle

1. Verifique se o Oracle Instant Client está instalado
2. Confirme que `LD_LIBRARY_PATH` aponta para o diretório
3. Teste a conexão: `sqlplus usuario/senha@servidor:1521/ORCL`

### Erro de autenticação LDAP

1. Verifique conectividade: `telnet servidor-ad 389`
2. Teste bind do service account
3. Verifique filtro de busca de usuários
4. Confirme grupos mapeados existem no AD

### Logs não aparecem

1. Verifique permissões do diretório `logs/`
2. Confirme `LOG_LEVEL` no `.env`
3. Reinicie o serviço após alterações

## 📞 Suporte

Para suporte técnico, consulte a documentação em `docs/` ou entre em contato com a equipe de TI.
