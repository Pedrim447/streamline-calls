/**
 * Middleware de Tratamento de Erros Global
 * 
 * Captura e formata todos os erros da aplicação.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

/**
 * Erro customizado da API
 */
export class AppError extends Error implements ApiError {
  statusCode: number;
  code: string;
  details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Erros pré-definidos comuns
 */
export const Errors = {
  NotFound: (resource: string = 'Recurso') => 
    new AppError(`${resource} não encontrado`, 404, 'NOT_FOUND'),
  
  Unauthorized: (message: string = 'Não autorizado') => 
    new AppError(message, 401, 'UNAUTHORIZED'),
  
  Forbidden: (message: string = 'Acesso negado') => 
    new AppError(message, 403, 'FORBIDDEN'),
  
  BadRequest: (message: string, details?: any) => 
    new AppError(message, 400, 'BAD_REQUEST', details),
  
  Conflict: (message: string) => 
    new AppError(message, 409, 'CONFLICT'),
  
  Internal: (message: string = 'Erro interno do servidor') => 
    new AppError(message, 500, 'INTERNAL_ERROR'),
  
  Validation: (details: any) => 
    new AppError('Erro de validação', 422, 'VALIDATION_ERROR', details),
};

/**
 * Handler global de erros
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log do erro
  const requestId = req.requestId || 'unknown';
  
  if (err.statusCode && err.statusCode < 500) {
    logger.warn(`[${requestId}] ${err.code || 'ERROR'}: ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      userId: req.user?.userId,
    });
  } else {
    logger.error(`[${requestId}] ${err.message}`, {
      error: err,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.userId,
    });
  }

  // Tratar erros de validação Zod
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: 'Erro de validação',
      code: 'VALIDATION_ERROR',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
      requestId,
    });
    return;
  }

  // Tratar erros do Oracle
  if (err.message && err.message.includes('ORA-')) {
    const oracleErrorCode = err.message.match(/ORA-\d+/)?.[0];
    
    logger.error(`Oracle Error ${oracleErrorCode}:`, err);
    
    res.status(500).json({
      success: false,
      error: 'Erro no banco de dados',
      code: 'DATABASE_ERROR',
      requestId,
    });
    return;
  }

  // Resposta padrão
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 && isProduction 
      ? 'Erro interno do servidor' 
      : err.message,
    code: err.code || 'INTERNAL_ERROR',
    details: err.details,
    requestId,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

export default errorHandler;
