/**
 * Rotas de Health Check
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Database } from '../database';
import { ldapService } from '../services/ldap.service';
import { config } from '../config';

const router = Router();

/**
 * GET /health
 * Health check básico
 */
router.get('/', async (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    environment: config.env,
  });
});

/**
 * GET /health/detailed
 * Health check detalhado com status dos serviços
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const dbHealth = await Database.healthCheck();
  const ldapEnabled = config.ldap.enabled;
  
  let ldapHealth = { healthy: true, message: 'LDAP não habilitado' };
  if (ldapEnabled) {
    ldapHealth = await ldapService.testConnection();
  }

  const allHealthy = dbHealth.healthy && (ldapEnabled ? ldapHealth.healthy : true);

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    services: {
      database: dbHealth,
      ldap: {
        enabled: ldapEnabled,
        ...ldapHealth,
      },
    },
  });
});

/**
 * GET /health/ready
 * Readiness check (para Kubernetes)
 */
router.get('/ready', async (req: Request, res: Response) => {
  const dbHealth = await Database.healthCheck();
  
  if (dbHealth.healthy) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready', reason: dbHealth.message });
  }
});

/**
 * GET /health/live
 * Liveness check (para Kubernetes)
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

export default router;
