/**
 * Serviço de Logs de Auditoria
 */

import { Database } from '../database';

export interface AuditLog {
  id: string;
  user_id?: string;
  unit_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

class AuditLogsService {
  async findAll(filters: {
    unit_id?: string;
    user_id?: string;
    entity_type?: string;
    action?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: AuditLog[]; total: number }> {
    let whereClauses = ['1=1'];
    const binds: any = {};

    if (filters.unit_id) {
      whereClauses.push('unit_id = :unitId');
      binds.unitId = filters.unit_id;
    }
    if (filters.user_id) {
      whereClauses.push('user_id = :userId');
      binds.userId = filters.user_id;
    }
    if (filters.entity_type) {
      whereClauses.push('entity_type = :entityType');
      binds.entityType = filters.entity_type;
    }
    if (filters.action) {
      whereClauses.push('action LIKE :action');
      binds.action = `%${filters.action}%`;
    }
    if (filters.date_from) {
      whereClauses.push('created_at >= TO_TIMESTAMP(:dateFrom, \'YYYY-MM-DD"T"HH24:MI:SS\')');
      binds.dateFrom = filters.date_from;
    }
    if (filters.date_to) {
      whereClauses.push('created_at <= TO_TIMESTAMP(:dateTo, \'YYYY-MM-DD"T"HH24:MI:SS\')');
      binds.dateTo = filters.date_to;
    }

    const whereClause = whereClauses.join(' AND ');

    // Count total
    const countResult = await Database.execute<any>(
      `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
      binds
    );
    const total = countResult.rows?.[0]?.TOTAL || 0;

    // Get data with pagination
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const dataResult = await Database.execute<any>(
      `SELECT * FROM (
        SELECT a.*, ROWNUM rnum FROM (
          SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY created_at DESC
        ) a WHERE ROWNUM <= :maxRow
      ) WHERE rnum > :minRow`,
      { ...binds, maxRow: offset + limit, minRow: offset }
    );

    const data = (dataResult.rows || []).map(this.mapRow);

    return { data, total };
  }

  async create(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<void> {
    const { v4: uuidv4 } = require('uuid');
    
    await Database.execute(
      `INSERT INTO audit_logs (id, user_id, unit_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at)
       VALUES (:id, :userId, :unitId, :action, :entityType, :entityId, :details, :ipAddress, :userAgent, SYSTIMESTAMP)`,
      {
        id: uuidv4(),
        userId: log.user_id || null,
        unitId: log.unit_id || null,
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_id || null,
        details: log.details ? JSON.stringify(log.details) : null,
        ipAddress: log.ip_address || null,
        userAgent: log.user_agent || null,
      }
    );
  }

  private mapRow(row: any): AuditLog {
    return {
      id: row.ID,
      user_id: row.USER_ID,
      unit_id: row.UNIT_ID,
      action: row.ACTION,
      entity_type: row.ENTITY_TYPE,
      entity_id: row.ENTITY_ID,
      details: row.DETAILS ? JSON.parse(row.DETAILS) : null,
      ip_address: row.IP_ADDRESS,
      user_agent: row.USER_AGENT,
      created_at: row.CREATED_AT,
    };
  }
}

export const auditLogsService = new AuditLogsService();
export default auditLogsService;
