/**
 * Servidor Principal - FilaFácil Backend
 * 
 * Sistema de gerenciamento de filas para ambiente governamental on-premise
 * Banco de dados: Oracle
 * Autenticação: JWT + LDAP/Active Directory
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authMiddleware } from './middleware/auth';
import { WebSocketServer } from './websocket/server';
import { Database } from './database';

// Rotas
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import ticketsRoutes from './routes/tickets.routes';
import countersRoutes from './routes/counters.routes';
import unitsRoutes from './routes/units.routes';
import settingsRoutes from './routes/settings.routes';
import auditRoutes from './routes/audit.routes';
import healthRoutes from './routes/health.routes';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const httpServer = createServer(app);

// ===========================================
// MIDDLEWARES GLOBAIS
// ===========================================

// Segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Client-Info'],
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// ===========================================
// ROTAS
// ===========================================

const apiPrefix = `/api/${config.apiVersion}`;

// Rotas públicas
app.use(`${apiPrefix}/health`, healthRoutes);
app.use(`${apiPrefix}/auth`, authRoutes);

// Rotas protegidas (requerem autenticação)
app.use(`${apiPrefix}/users`, authMiddleware, usersRoutes);
app.use(`${apiPrefix}/tickets`, authMiddleware, ticketsRoutes);
app.use(`${apiPrefix}/counters`, authMiddleware, countersRoutes);
app.use(`${apiPrefix}/units`, authMiddleware, unitsRoutes);
app.use(`${apiPrefix}/settings`, authMiddleware, settingsRoutes);
app.use(`${apiPrefix}/audit-logs`, authMiddleware, auditRoutes);

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    path: req.originalUrl,
  });
});

// Error handler global
app.use(errorHandler);

// ===========================================
// INICIALIZAÇÃO
// ===========================================

async function startServer() {
  try {
    // Conectar ao banco de dados Oracle
    logger.info('Conectando ao banco de dados Oracle...');
    await Database.initialize();
    logger.info('Conexão com Oracle estabelecida com sucesso');

    // Iniciar servidor WebSocket
    const wsServer = new WebSocketServer(httpServer);
    wsServer.start();
    logger.info(`Servidor WebSocket iniciado na porta ${config.server.port}`);

    // Iniciar servidor HTTP
    httpServer.listen(config.server.port, () => {
      logger.info(`
========================================
  FilaFácil Backend - v${config.apiVersion}
========================================
  Ambiente: ${config.env}
  Porta: ${config.server.port}
  API: http://localhost:${config.server.port}/api/${config.apiVersion}
  WebSocket: ws://localhost:${config.server.port}
  LDAP: ${config.ldap.enabled ? 'Habilitado' : 'Desabilitado'}
========================================
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM recebido. Encerrando servidor...');
      await Database.close();
      httpServer.close(() => {
        logger.info('Servidor encerrado.');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT recebido. Encerrando servidor...');
      await Database.close();
      httpServer.close(() => {
        logger.info('Servidor encerrado.');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();

export { app, httpServer };
