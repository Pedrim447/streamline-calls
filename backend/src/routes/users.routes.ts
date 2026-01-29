/**
 * Rotas de Usuários
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { usersService } from '../services/users.service';
import { requireRole } from '../middleware/auth';

const router = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  matricula: z.string().optional(),
  cpf: z.string().optional(),
  birth_date: z.string().optional(),
  unit_id: z.string().uuid(),
  role: z.enum(['admin', 'attendant', 'recepcao']),
});

const updateUserSchema = z.object({
  full_name: z.string().optional(),
  matricula: z.string().optional(),
  cpf: z.string().optional(),
  birth_date: z.string().optional(),
  avatar_url: z.string().optional(),
  unit_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /users
 * Lista usuários
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitId = req.user!.roles.includes('admin') 
      ? (req.query.unit_id as string) || req.user!.unitId
      : req.user!.unitId;

    const users = await usersService.findAll(unitId);
    
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /users/profile
 * Perfil do usuário atual
 */
router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await usersService.findById(req.user!.userId);
    
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /users/profile
 * Atualiza perfil do usuário atual
 */
router.patch('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Usuário só pode atualizar campos básicos do próprio perfil
    const allowedUpdates = {
      full_name: req.body.full_name,
      avatar_url: req.body.avatar_url,
    };

    const user = await usersService.update(req.user!.userId, allowedUpdates, req.user!.userId);
    
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /users/:id
 * Busca usuário por ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await usersService.findById(req.params.id);
    
    if (!user) {
      res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      return;
    }
    
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /users
 * Cria novo usuário (apenas admin)
 */
router.post('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createUserSchema.parse(req.body);
    
    const user = await usersService.create(body, req.user!.userId);
    
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /users/:id
 * Atualiza usuário (apenas admin)
 */
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateUserSchema.parse(req.body);
    
    const user = await usersService.update(req.params.id, body, req.user!.userId);
    
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /users/roles/:id
 * Altera role do usuário (apenas admin)
 */
router.put('/roles/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.body;
    
    if (!['admin', 'attendant', 'recepcao'].includes(role)) {
      res.status(400).json({ success: false, error: 'Role inválida' });
      return;
    }

    await usersService.updateRole(req.params.id, role, req.user!.userId);
    
    res.json({
      success: true,
      message: 'Role atualizada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
