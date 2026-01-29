/**
 * Audit Service
 * 
 * Handles audit log related API operations.
 */

import api, { type PaginatedResponse } from '@/lib/api';
import { API_CONFIG } from '@/config/api.config';
import type { AuditLog, AuditLogFilter } from '@/types/api.types';

class AuditService {
  /**
   * Get audit logs with optional filters and pagination
   */
  async getAuditLogs(
    filter?: AuditLogFilter,
    page = 1,
    pageSize = 50
  ): Promise<{ data?: PaginatedResponse<AuditLog>; error?: string }> {
    const query: Record<string, string | number | undefined> = {
      page,
      pageSize,
    };
    
    if (filter) {
      if (filter.user_id) query.user_id = filter.user_id;
      if (filter.unit_id) query.unit_id = filter.unit_id;
      if (filter.action) query.action = filter.action;
      if (filter.entity_type) query.entity_type = filter.entity_type;
      if (filter.date_from) query.date_from = filter.date_from;
      if (filter.date_to) query.date_to = filter.date_to;
    }
    
    const response = await api.get<PaginatedResponse<AuditLog>>(
      API_CONFIG.ENDPOINTS.AUDIT.BASE,
      { query }
    );
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao buscar logs de auditoria' };
  }

  /**
   * Get audit log by ID
   */
  async getAuditLog(id: string): Promise<{ data?: AuditLog; error?: string }> {
    const response = await api.get<AuditLog>(`${API_CONFIG.ENDPOINTS.AUDIT.BASE}/${id}`);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Log não encontrado' };
  }

  /**
   * Get recent audit logs
   */
  async getRecentLogs(limit = 20): Promise<{ data?: AuditLog[]; error?: string }> {
    const result = await this.getAuditLogs(undefined, 1, limit);
    
    if (result.data) {
      return { data: result.data.data };
    }
    
    return { error: result.error };
  }

  /**
   * Get audit logs for a specific entity
   */
  async getEntityLogs(
    entityType: string,
    entityId: string
  ): Promise<{ data?: AuditLog[]; error?: string }> {
    const response = await api.get<AuditLog[]>(API_CONFIG.ENDPOINTS.AUDIT.BASE, {
      query: {
        entity_type: entityType,
        entity_id: entityId,
      },
    });
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao buscar logs' };
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserLogs(userId: string, limit = 50): Promise<{ data?: AuditLog[]; error?: string }> {
    const result = await this.getAuditLogs({ user_id: userId }, 1, limit);
    
    if (result.data) {
      return { data: result.data.data };
    }
    
    return { error: result.error };
  }
}

export const auditService = new AuditService();
export default auditService;
