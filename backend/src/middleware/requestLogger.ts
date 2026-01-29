/**
 * Middleware de Logging de Requisições
 * 
 * Registra todas as requisições HTTP com informações de auditoria.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, logAudit } from '../utils/logger';

/**
 * Middleware que adiciona request ID e registra requisições
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Gerar ID único para a requisição
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = requestId;
  
  // Adicionar header de resposta
  res.setHeader('X-Request-ID', requestId);
  
  // Capturar timestamp de início
  const startTime = Date.now();
  
  // Extrair informações do cliente
  const clientInfo = req.headers['x-client-info'] as string;
  const userAgent = req.headers['user-agent'];
  const ip = getClientIp(req);
  
  // Log da requisição
  logger.info(`→ ${req.method} ${req.path}`, {
    requestId,
    ip,
    userAgent: userAgent?.substring(0, 100),
    clientInfo,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
  });

  // Interceptar resposta para logging
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Log da resposta
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logger[logLevel](`← ${req.method} ${req.path} ${statusCode} ${duration}ms`, {
      requestId,
      statusCode,
      duration,
      userId: req.user?.userId,
    });

    // Auditoria para operações de escrita
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const entityType = extractEntityType(req.path);
      const entityId = extractEntityId(req.path);
      
      logAudit({
        action: `${req.method} ${req.path}`,
        entityType,
        entityId,
        userId: req.user?.userId,
        unitId: req.user?.unitId,
        ipAddress: ip,
        userAgent: userAgent?.substring(0, 500),
        details: {
          requestId,
          statusCode,
          duration,
          body: sanitizeBody(req.body),
        },
        success: statusCode < 400,
        errorMessage: statusCode >= 400 ? extractErrorMessage(body) : undefined,
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Extrai IP real do cliente (considerando proxies)
 */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }
  
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Extrai tipo de entidade do path
 */
function extractEntityType(path: string): string {
  const parts = path.split('/').filter(Boolean);
  // /api/v1/tickets -> tickets
  return parts[2] || 'unknown';
}

/**
 * Extrai ID de entidade do path
 */
function extractEntityId(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean);
  // /api/v1/tickets/123 -> 123
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const potentialId = parts[3];
  
  if (potentialId && uuidRegex.test(potentialId)) {
    return potentialId;
  }
  
  return undefined;
}

/**
 * Remove dados sensíveis do body para logging
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sensitiveFields = ['password', 'senha', 'token', 'secret', 'cpf'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Extrai mensagem de erro do body de resposta
 */
function extractErrorMessage(body: any): string | undefined {
  try {
    if (typeof body === 'string') {
      const parsed = JSON.parse(body);
      return parsed.error || parsed.message;
    }
    return body?.error || body?.message;
  } catch {
    return undefined;
  }
}

export default requestLogger;
