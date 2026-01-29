/**
 * Configuração Central do Backend
 * 
 * Todas as variáveis de ambiente são centralizadas aqui.
 * Valores padrão são fornecidos para desenvolvimento local.
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Ambiente
  env: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',

  // Servidor
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
  },

  // Banco de Dados Oracle
  oracle: {
    // Connection string completa ou parâmetros separados
    connectionString: process.env.ORACLE_CONNECTION_STRING || '',
    host: process.env.ORACLE_HOST || 'localhost',
    port: parseInt(process.env.ORACLE_PORT || '1521', 10),
    serviceName: process.env.ORACLE_SERVICE_NAME || 'ORCL',
    sid: process.env.ORACLE_SID,
    
    // Credenciais
    user: process.env.ORACLE_USER || 'filafacil',
    password: process.env.ORACLE_PASSWORD || '',
    
    // Pool de conexões
    pool: {
      min: parseInt(process.env.ORACLE_POOL_MIN || '2', 10),
      max: parseInt(process.env.ORACLE_POOL_MAX || '10', 10),
      increment: parseInt(process.env.ORACLE_POOL_INCREMENT || '1', 10),
    },
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'desenvolvimento-nao-usar-em-producao',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-desenvolvimento-nao-usar',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // LDAP/Active Directory
  ldap: {
    enabled: process.env.LDAP_ENABLED === 'true',
    url: process.env.LDAP_URL || 'ldap://localhost:389',
    baseDN: process.env.LDAP_BASE_DN || 'DC=example,DC=com',
    bindDN: process.env.LDAP_BIND_DN || '',
    bindPassword: process.env.LDAP_BIND_PASSWORD || '',
    userSearchBase: process.env.LDAP_USER_SEARCH_BASE || 'OU=Users',
    userSearchFilter: process.env.LDAP_USER_SEARCH_FILTER || '(sAMAccountName={{username}})',
    groupSearchBase: process.env.LDAP_GROUP_SEARCH_BASE || 'OU=Groups',
    adminGroup: process.env.LDAP_ADMIN_GROUP || '',
    attendantGroup: process.env.LDAP_ATTENDANT_GROUP || '',
    recepcaoGroup: process.env.LDAP_RECEPCAO_GROUP || '',
    tls: {
      enabled: process.env.LDAP_TLS_ENABLED === 'true',
      certPath: process.env.LDAP_TLS_CERT_PATH,
      rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  // Logs
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/app.log',
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '30', 10),
    auditEnabled: process.env.AUDIT_LOG_ENABLED !== 'false',
    auditPath: process.env.AUDIT_LOG_PATH || './logs/audit.log',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // WebSocket
  websocket: {
    port: parseInt(process.env.WS_PORT || '3002', 10),
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
  },
};

// Validação de configurações críticas em produção
if (config.env === 'production') {
  const requiredEnvVars = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ORACLE_PASSWORD',
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`ERRO: Variáveis de ambiente obrigatórias não configuradas: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (config.jwt.secret.includes('desenvolvimento')) {
    console.error('ERRO: JWT_SECRET não pode usar valor padrão em produção');
    process.exit(1);
  }
}

export default config;
