/**
 * Rotas de Unidades
 */

import { Router, Request, Response, NextFunction } from 'express';
import { settingsService } from '../services/settings.service';
import { requireRole } from '../middleware/auth';

const router = Router();

/**
 * GET /units/:id
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await settingsService.getUnit(req.params.id);
    
    if (!unit) {
      res.status(404).json({ success: false, error: 'Unidade não encontrada' });
      return;
    }
    
    res.json({ success: true, data: unit });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /units/:id
 */
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await settingsService.updateUnit(req.params.id, req.body, req.user!.userId);
    
    res.json({ success: true, data: unit });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /units/:id/settings
 */
router.get('/:id/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getSettings(req.params.id);
    
    if (!settings) {
      res.status(404).json({ success: false, error: 'Configurações não encontradas' });
      return;
    }
    
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /units/:id/settings
 */
router.patch('/:id/settings', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.updateSettings(req.params.id, req.body, req.user!.userId);
    
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

export default router;
