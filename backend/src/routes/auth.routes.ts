/**
 * Rotas de Autenticação
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { ldapService } from '../services/ldap.service';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Schema de validação
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

const ldapLoginSchema = z.object({
  username: z.string().min(1, 'Usuário obrigatório'),
  password: z.string().min(1, 'Senha obrigatória'),
  domain: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token obrigatório'),
});

/**
 * POST /auth/login
 * Login com email e senha
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress;
    
    const result = await authService.loginLocal(body.email, body.password, ip);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/ldap
 * Login via LDAP/Active Directory
 */
router.post('/ldap', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ldapLoginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress;
    
    const result = await authService.loginLdap(body.username, body.password, ip);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/refresh
 * Renova tokens
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = refreshSchema.parse(req.body);
    
    const tokens = await authService.refreshTokens(body.refreshToken);
    
    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/logout
 * Logout
 */
router.post('/logout', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logout(req.user!.userId, req.user!.sessionId);
    
    res.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/me
 * Retorna usuário autenticado
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      id: req.user!.userId,
      email: req.user!.email,
      fullName: req.user!.fullName,
      unitId: req.user!.unitId,
      roles: req.user!.roles,
    },
  });
});

/**
 * GET /auth/ldap/test
 * Testa conexão LDAP (apenas admin)
 */
router.get('/ldap/test', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user!.roles.includes('admin')) {
      res.status(403).json({ success: false, error: 'Acesso negado' });
      return;
    }

    const result = await ldapService.testConnection();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
