/**
 * Settings Service
 * 
 * Handles unit and system settings API operations.
 */

import api from '@/lib/api';
import { API_CONFIG } from '@/config/api.config';
import type {
  Unit,
  Settings,
  UpdateUnitRequest,
  UpdateSettingsRequest,
} from '@/types/api.types';

class SettingsService {
  /**
   * Get unit by ID
   */
  async getUnit(unitId: string): Promise<{ data?: Unit; error?: string }> {
    const response = await api.get<Unit>(`${API_CONFIG.ENDPOINTS.UNITS.BASE}/${unitId}`);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Unidade não encontrada' };
  }

  /**
   * Update unit
   */
  async updateUnit(unitId: string, request: UpdateUnitRequest): Promise<{ data?: Unit; error?: string }> {
    const response = await api.patch<Unit>(
      `${API_CONFIG.ENDPOINTS.UNITS.BASE}/${unitId}`,
      request
    );
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao atualizar unidade' };
  }

  /**
   * Get settings for a unit
   */
  async getSettings(unitId: string): Promise<{ data?: Settings; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.UNITS.SETTINGS.replace(':id', unitId);
    const response = await api.get<Settings>(endpoint);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Configurações não encontradas' };
  }

  /**
   * Update settings for a unit
   */
  async updateSettings(unitId: string, request: UpdateSettingsRequest): Promise<{ data?: Settings; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.UNITS.SETTINGS.replace(':id', unitId);
    const response = await api.patch<Settings>(endpoint, request);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao atualizar configurações' };
  }

  /**
   * Get unit and settings together
   */
  async getUnitWithSettings(unitId: string): Promise<{
    data?: { unit: Unit; settings: Settings };
    error?: string;
  }> {
    const [unitResult, settingsResult] = await Promise.all([
      this.getUnit(unitId),
      this.getSettings(unitId),
    ]);
    
    if (unitResult.data && settingsResult.data) {
      return {
        data: {
          unit: unitResult.data,
          settings: settingsResult.data,
        },
      };
    }
    
    return { error: unitResult.error || settingsResult.error };
  }

  /**
   * Save both unit and settings
   */
  async saveUnitAndSettings(
    unitId: string,
    unitRequest: UpdateUnitRequest,
    settingsRequest: UpdateSettingsRequest
  ): Promise<{ success: boolean; error?: string }> {
    const [unitResult, settingsResult] = await Promise.all([
      this.updateUnit(unitId, unitRequest),
      this.updateSettings(unitId, settingsRequest),
    ]);
    
    if (unitResult.data && settingsResult.data) {
      return { success: true };
    }
    
    return {
      success: false,
      error: unitResult.error || settingsResult.error || 'Falha ao salvar configurações',
    };
  }
}

export const settingsService = new SettingsService();
export default settingsService;
