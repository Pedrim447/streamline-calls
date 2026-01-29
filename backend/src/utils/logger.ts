/**
 * Sistema de Logging
 * 
 * Utiliza Winston para logs estruturados com rotação de arquivos.
 * Logs de auditoria são separados dos logs de aplicação.
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Criar diretório de logs se não existir
const logsDir = path.dirname(config.logging.filePath);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Formato customizado para logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Logger principal da aplicação
export const logger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  defaultMeta: { service: 'filafacil-backend' },
  transports: [
    // Console (colorido em desenvolvimento)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    }),
    
    // Arquivo de log geral
    new winston.transports.File({
      filename: config.logging.filePath,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: config.logging.maxFiles,
      tailable: true,
    }),
    
    // Arquivo separado para erros
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 30,
    }),
  ],
});

// Logger de auditoria (separado para compliance)
const auditDir = path.dirname(config.logging.auditPath);
if (!fs.existsSync(auditDir)) {
  fs.mkdirSync(auditDir, { recursive: true });
}

export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.json()
  ),
  defaultMeta: { service: 'filafacil-audit' },
  transports: [
    new winston.transports.File({
      filename: config.logging.auditPath,
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 365, // 1 ano de logs
      tailable: true,
    }),
  ],
});

// Interface para log de auditoria
export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  unitId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  success: boolean;
  errorMessage?: string;
}

/**
 * Registra uma entrada de auditoria
 */
export function logAudit(entry: AuditLogEntry): void {
  if (!config.logging.auditEnabled) return;
  
  auditLogger.info('AUDIT', {
    ...entry,
    timestamp: new Date().toISOString(),
  });
  
  // Também logar no log principal para visibilidade
  logger.info(`AUDIT: ${entry.action} on ${entry.entityType}`, {
    entityId: entry.entityId,
    userId: entry.userId,
    success: entry.success,
  });
}

export default logger;
