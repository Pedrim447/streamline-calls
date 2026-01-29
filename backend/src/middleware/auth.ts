/**
 * Middleware de Autenticação JWT
 * 
 * Valida tokens JWT e adiciona informações do usuário à requisição.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

// Estender interface Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
    }
  }
}

export interface JwtPayload {
  userId: string;
  email: string;
  fullName: string;
  unitId: string;
  roles: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware de autenticação
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'Token de autenticação não fornecido',
        code: 'AUTH_TOKEN_MISSING',
      });
      return;
    }

    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        success: false,
        error: 'Formato de token inválido. Use: Bearer <token>',
        code: 'AUTH_TOKEN_INVALID_FORMAT',
      });
      return;
    }

    const token = parts[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      req.user = decoded;
      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          error: 'Token expirado',
          code: 'AUTH_TOKEN_EXPIRED',
        });
        return;
      }
      
      if (jwtError instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          error: 'Token inválido',
          code: 'AUTH_TOKEN_INVALID',
        });
        return;
      }
      
      throw jwtError;
    }
  } catch (error) {
    logger.error('Erro no middleware de autenticação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno de autenticação',
      code: 'AUTH_INTERNAL_ERROR',
    });
  }
}

/**
 * Middleware para verificar roles específicas
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role));
    
    if (!hasRole) {
      logger.warn(`Acesso negado para usuário ${req.user.userId}. Roles necessárias: ${roles.join(', ')}`);
      res.status(403).json({
        success: false,
        error: 'Acesso não autorizado',
        code: 'AUTH_FORBIDDEN',
        requiredRoles: roles,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware para verificar se usuário pertence à mesma unidade
 */
export function requireSameUnit(unitIdParam: string = 'unitId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    const requestedUnitId = req.params[unitIdParam] || req.body[unitIdParam] || req.query[unitIdParam];
    
    // Admin pode acessar qualquer unidade
    if (req.user.roles.includes('admin')) {
      next();
      return;
    }

    if (requestedUnitId && requestedUnitId !== req.user.unitId) {
      res.status(403).json({
        success: false,
        error: 'Acesso negado a esta unidade',
        code: 'AUTH_UNIT_MISMATCH',
      });
      return;
    }

    next();
  };
}

export default authMiddleware;
