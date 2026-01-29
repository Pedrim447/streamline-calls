/**
 * Serviço de Unidades e Configurações
 */

import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database';
import { Errors } from '../middleware/errorHandler';
import { logAudit } from '../utils/logger';

export interface Unit {
  id: string;
  name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  voice_enabled: boolean;
  voice_speed?: number;
  voice_message_template?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Settings {
  id: string;
  unit_id: string;
  auto_reset_daily: boolean;
  reset_time: string;
  normal_priority: number;
  preferential_priority: number;
  lock_timeout_seconds: number;
  max_retry_attempts: number;
  created_at: Date;
  updated_at: Date;
}

class SettingsService {
  async getUnit(id: string): Promise<Unit | null> {
    const result = await Database.execute<any>(
      `SELECT * FROM units WHERE id = :id`,
      { id }
    );
    return this.mapUnit(result.rows?.[0]);
  }

  async updateUnit(id: string, updates: Partial<Unit>, userId?: string): Promise<Unit> {
    const existing = await this.getUnit(id);
    if (!existing) throw Errors.NotFound('Unidade');

    const updateParts: string[] = [];
    const binds: any = { id };

    if (updates.name !== undefined) {
      updateParts.push('name = :name');
      binds.name = updates.name;
    }
    if (updates.logo_url !== undefined) {
      updateParts.push('logo_url = :logoUrl');
      binds.logoUrl = updates.logo_url;
    }
    if (updates.primary_color !== undefined) {
      updateParts.push('primary_color = :primaryColor');
      binds.primaryColor = updates.primary_color;
    }
    if (updates.secondary_color !== undefined) {
      updateParts.push('secondary_color = :secondaryColor');
      binds.secondaryColor = updates.secondary_color;
    }
    if (updates.voice_enabled !== undefined) {
      updateParts.push('voice_enabled = :voiceEnabled');
      binds.voiceEnabled = updates.voice_enabled ? 1 : 0;
    }
    if (updates.voice_speed !== undefined) {
      updateParts.push('voice_speed = :voiceSpeed');
      binds.voiceSpeed = updates.voice_speed;
    }
    if (updates.voice_message_template !== undefined) {
      updateParts.push('voice_message_template = :voiceTemplate');
      binds.voiceTemplate = updates.voice_message_template;
    }

    if (updateParts.length > 0) {
      updateParts.push('updated_at = SYSTIMESTAMP');
      await Database.execute(
        `UPDATE units SET ${updateParts.join(', ')} WHERE id = :id`,
        binds
      );
    }

    logAudit({
      action: 'UNIT_UPDATE',
      entityType: 'unit',
      entityId: id,
      userId,
      unitId: id,
      details: updates,
      success: true,
    });

    return (await this.getUnit(id))!;
  }

  async getSettings(unitId: string): Promise<Settings | null> {
    const result = await Database.execute<any>(
      `SELECT * FROM settings WHERE unit_id = :unitId`,
      { unitId }
    );
    return this.mapSettings(result.rows?.[0]);
  }

  async updateSettings(unitId: string, updates: Partial<Settings>, userId?: string): Promise<Settings> {
    let existing = await this.getSettings(unitId);
    
    if (!existing) {
      // Criar configurações padrão
      const id = uuidv4();
      await Database.execute(
        `INSERT INTO settings (id, unit_id, created_at, updated_at)
         VALUES (:id, :unitId, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { id, unitId }
      );
      existing = await this.getSettings(unitId);
    }

    const updateParts: string[] = [];
    const binds: any = { unitId };

    if (updates.auto_reset_daily !== undefined) {
      updateParts.push('auto_reset_daily = :autoReset');
      binds.autoReset = updates.auto_reset_daily ? 1 : 0;
    }
    if (updates.reset_time !== undefined) {
      updateParts.push('reset_time = :resetTime');
      binds.resetTime = updates.reset_time;
    }
    if (updates.normal_priority !== undefined) {
      updateParts.push('normal_priority = :normalPriority');
      binds.normalPriority = updates.normal_priority;
    }
    if (updates.preferential_priority !== undefined) {
      updateParts.push('preferential_priority = :prefPriority');
      binds.prefPriority = updates.preferential_priority;
    }
    if (updates.lock_timeout_seconds !== undefined) {
      updateParts.push('lock_timeout_seconds = :lockTimeout');
      binds.lockTimeout = updates.lock_timeout_seconds;
    }
    if (updates.max_retry_attempts !== undefined) {
      updateParts.push('max_retry_attempts = :maxRetry');
      binds.maxRetry = updates.max_retry_attempts;
    }

    if (updateParts.length > 0) {
      updateParts.push('updated_at = SYSTIMESTAMP');
      await Database.execute(
        `UPDATE settings SET ${updateParts.join(', ')} WHERE unit_id = :unitId`,
        binds
      );
    }

    logAudit({
      action: 'SETTINGS_UPDATE',
      entityType: 'settings',
      userId,
      unitId,
      details: updates,
      success: true,
    });

    return (await this.getSettings(unitId))!;
  }

  private mapUnit(row: any): Unit | null {
    if (!row) return null;
    return {
      id: row.ID,
      name: row.NAME,
      logo_url: row.LOGO_URL,
      primary_color: row.PRIMARY_COLOR,
      secondary_color: row.SECONDARY_COLOR,
      voice_enabled: row.VOICE_ENABLED === 1,
      voice_speed: row.VOICE_SPEED,
      voice_message_template: row.VOICE_MESSAGE_TEMPLATE,
      created_at: row.CREATED_AT,
      updated_at: row.UPDATED_AT,
    };
  }

  private mapSettings(row: any): Settings | null {
    if (!row) return null;
    return {
      id: row.ID,
      unit_id: row.UNIT_ID,
      auto_reset_daily: row.AUTO_RESET_DAILY === 1,
      reset_time: row.RESET_TIME,
      normal_priority: row.NORMAL_PRIORITY,
      preferential_priority: row.PREFERENTIAL_PRIORITY,
      lock_timeout_seconds: row.LOCK_TIMEOUT_SECONDS,
      max_retry_attempts: row.MAX_RETRY_ATTEMPTS,
      created_at: row.CREATED_AT,
      updated_at: row.UPDATED_AT,
    };
  }
}

export const settingsService = new SettingsService();
export default settingsService;
