/**
 * Rotas de Logs de Auditoria
 */

import { Router, Request, Response, NextFunction } from 'express';
import { auditLogsService } from '../services/audit.service';
import { requireRole } from '../middleware/auth';

const router = Router();

/**
 * GET /audit-logs
 * Lista logs de auditoria (apenas admin)
 */
router.get('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      unit_id: (req.query.unit_id as string) || req.user!.unitId,
      user_id: req.query.user_id as string,
      entity_type: req.query.entity_type as string,
      action: req.query.action as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await auditLogsService.findAll(filters);
    
    res.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
