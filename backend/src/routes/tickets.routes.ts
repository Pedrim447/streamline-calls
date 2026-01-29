/**
 * Rotas de Tickets
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ticketsService } from '../services/tickets.service';
import { requireRole } from '../middleware/auth';

const router = Router();

const createTicketSchema = z.object({
  unit_id: z.string().uuid(),
  ticket_type: z.enum(['normal', 'preferential']),
  client_name: z.string().optional(),
  client_cpf: z.string().optional(),
});

const callNextSchema = z.object({
  unit_id: z.string().uuid(),
  counter_id: z.string().uuid(),
});

const skipSchema = z.object({
  reason: z.string().min(1, 'Motivo obrigatório'),
});

/**
 * GET /tickets
 * Lista tickets com filtros
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      unit_id: req.query.unit_id as string || req.user!.unitId,
      status: req.query.status as string,
      ticket_type: req.query.ticket_type as string,
      attendant_id: req.query.attendant_id as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
    };

    const tickets = await ticketsService.findAll(filters);
    
    res.json({
      success: true,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tickets/:id
 * Busca ticket por ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketsService.findById(req.params.id);
    
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket não encontrado' });
      return;
    }
    
    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets
 * Cria novo ticket
 */
router.post('/', requireRole('recepcao', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createTicketSchema.parse(req.body);
    
    const ticket = await ticketsService.create(body, req.user!.userId);
    
    res.status(201).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets/call-next
 * Chama próximo ticket
 */
router.post('/call-next', requireRole('attendant', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = callNextSchema.parse(req.body);
    
    const ticket = await ticketsService.callNext({
      unit_id: body.unit_id,
      counter_id: body.counter_id,
      attendant_id: req.user!.userId,
    });
    
    if (!ticket) {
      res.json({
        success: true,
        data: null,
        message: 'Fila vazia',
      });
      return;
    }
    
    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets/:id/repeat
 * Repete chamada
 */
router.post('/:id/repeat', requireRole('attendant', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketsService.repeatCall(req.params.id, req.user!.userId);
    
    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets/:id/start
 * Inicia atendimento
 */
router.post('/:id/start', requireRole('attendant', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketsService.startService(req.params.id, req.user!.userId);
    
    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets/:id/complete
 * Finaliza atendimento
 */
router.post('/:id/complete', requireRole('attendant', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketsService.complete(req.params.id, req.user!.userId);
    
    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets/:id/skip
 * Pula ticket
 */
router.post('/:id/skip', requireRole('attendant', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = skipSchema.parse(req.body);
    
    const ticket = await ticketsService.skip(req.params.id, body.reason, req.user!.userId);
    
    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets/:id/cancel
 * Cancela ticket
 */
router.post('/:id/cancel', requireRole('recepcao', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = skipSchema.parse(req.body);
    
    const ticket = await ticketsService.cancel(req.params.id, body.reason, req.user!.userId);
    
    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
