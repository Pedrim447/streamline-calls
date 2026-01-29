/**
 * Rotas de Guichês
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { countersService } from '../services/counters.service';
import { requireRole } from '../middleware/auth';

const router = Router();

const createCounterSchema = z.object({
  unit_id: z.string().uuid(),
  number: z.number().int().positive(),
  name: z.string().optional(),
});

const updateCounterSchema = z.object({
  number: z.number().int().positive().optional(),
  name: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /counters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitId = (req.query.unit_id as string) || req.user!.unitId;
    const counters = await countersService.findByUnit(unitId);
    
    res.json({ success: true, data: counters });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /counters/:id
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const counter = await countersService.findById(req.params.id);
    
    if (!counter) {
      res.status(404).json({ success: false, error: 'Guichê não encontrado' });
      return;
    }
    
    res.json({ success: true, data: counter });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /counters
 */
router.post('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createCounterSchema.parse(req.body);
    const counter = await countersService.create(body.unit_id, body.number, body.name, req.user!.userId);
    
    res.status(201).json({ success: true, data: counter });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /counters/:id
 */
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateCounterSchema.parse(req.body);
    const counter = await countersService.update(req.params.id, body, req.user!.userId);
    
    res.json({ success: true, data: counter });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /counters/:id
 */
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await countersService.delete(req.params.id, req.user!.userId);
    
    res.json({ success: true, message: 'Guichê excluído' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /counters/:id/assign
 */
router.post('/:id/assign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attendantId = req.body.attendant_id || req.user!.userId;
    const counter = await countersService.assign(req.params.id, attendantId);
    
    res.json({ success: true, data: counter });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /counters/:id/release
 */
router.post('/:id/release', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const counter = await countersService.release(req.params.id, req.user!.userId);
    
    res.json({ success: true, data: counter });
  } catch (error) {
    next(error);
  }
});

export default router;
