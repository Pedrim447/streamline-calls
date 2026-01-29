/**
 * Counters Service
 * 
 * Handles all counter (guichê) related API operations.
 */

import api from '@/lib/api';
import { API_CONFIG } from '@/config/api.config';
import type {
  Counter,
  CreateCounterRequest,
  UpdateCounterRequest,
} from '@/types/api.types';

class CountersService {
  /**
   * Get all counters for a unit
   */
  async getCounters(unitId: string): Promise<{ data?: Counter[]; error?: string }> {
    const response = await api.get<Counter[]>(API_CONFIG.ENDPOINTS.COUNTERS.BASE, {
      query: { unit_id: unitId },
    });
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao buscar guichês' };
  }

  /**
   * Get a single counter by ID
   */
  async getCounter(id: string): Promise<{ data?: Counter; error?: string }> {
    const response = await api.get<Counter>(`${API_CONFIG.ENDPOINTS.COUNTERS.BASE}/${id}`);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Guichê não encontrado' };
  }

  /**
   * Create a new counter
   */
  async createCounter(request: CreateCounterRequest): Promise<{ data?: Counter; error?: string }> {
    const response = await api.post<Counter>(API_CONFIG.ENDPOINTS.COUNTERS.BASE, request);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao criar guichê' };
  }

  /**
   * Update a counter
   */
  async updateCounter(id: string, request: UpdateCounterRequest): Promise<{ data?: Counter; error?: string }> {
    const response = await api.patch<Counter>(
      `${API_CONFIG.ENDPOINTS.COUNTERS.BASE}/${id}`,
      request
    );
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao atualizar guichê' };
  }

  /**
   * Delete a counter
   */
  async deleteCounter(id: string): Promise<{ success: boolean; error?: string }> {
    const response = await api.delete(`${API_CONFIG.ENDPOINTS.COUNTERS.BASE}/${id}`);
    
    if (response.success) {
      return { success: true };
    }
    
    return { success: false, error: response.error || 'Falha ao excluir guichê' };
  }

  /**
   * Assign an attendant to a counter
   */
  async assignCounter(counterId: string, attendantId: string): Promise<{ data?: Counter; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.COUNTERS.ASSIGN.replace(':id', counterId);
    const response = await api.post<Counter>(endpoint, { attendant_id: attendantId });
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao atribuir guichê' };
  }

  /**
   * Release a counter (remove attendant)
   */
  async releaseCounter(counterId: string): Promise<{ data?: Counter; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.COUNTERS.RELEASE.replace(':id', counterId);
    const response = await api.post<Counter>(endpoint);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao liberar guichê' };
  }

  /**
   * Get available (unassigned) counters for a unit
   */
  async getAvailableCounters(unitId: string): Promise<{ data?: Counter[]; error?: string }> {
    const result = await this.getCounters(unitId);
    
    if (result.data) {
      const available = result.data.filter(c => c.is_active && !c.current_attendant_id);
      return { data: available };
    }
    
    return result;
  }

  /**
   * Get counter assigned to current user
   */
  async getMyCounter(unitId: string, userId: string): Promise<{ data?: Counter | null; error?: string }> {
    const result = await this.getCounters(unitId);
    
    if (result.data) {
      const myCounter = result.data.find(c => c.current_attendant_id === userId);
      return { data: myCounter || null };
    }
    
    return { data: null, error: result.error };
  }
}

export const countersService = new CountersService();
export default countersService;
