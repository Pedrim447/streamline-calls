/**
 * Rotas de Configurações (alias para settings da unidade do usuário)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { settingsService } from '../services/settings.service';
import { requireRole } from '../middleware/auth';

const router = Router();

/**
 * GET /settings
 * Retorna configurações da unidade do usuário
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getSettings(req.user!.unitId);
    
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /settings
 * Atualiza configurações da unidade do usuário
 */
router.patch('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.updateSettings(req.user!.unitId, req.body, req.user!.userId);
    
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

export default router;
