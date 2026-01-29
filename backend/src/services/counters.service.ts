/**
 * Serviço de Guichês (Counters)
 */

import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database';
import { logger, logAudit } from '../utils/logger';
import { Errors } from '../middleware/errorHandler';
import { websocketBroadcast } from '../websocket/server';

export interface Counter {
  id: string;
  unit_id: string;
  number: number;
  name?: string;
  is_active: boolean;
  current_attendant_id?: string;
  created_at: Date;
  updated_at: Date;
}

class CountersService {
  async create(unitId: string, number: number, name?: string, userId?: string): Promise<Counter> {
    const id = uuidv4();

    await Database.execute(
      `INSERT INTO counters (id, unit_id, number, name, is_active, created_at, updated_at)
       VALUES (:id, :unitId, :number, :name, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, unitId, number, name: name || null }
    );

    const counter = await this.findById(id);

    logAudit({
      action: 'COUNTER_CREATE',
      entityType: 'counter',
      entityId: id,
      userId,
      unitId,
      details: { number, name },
      success: true,
    });

    return counter!;
  }

  async update(id: string, updates: { number?: number; name?: string; is_active?: boolean }, userId?: string): Promise<Counter> {
    const existing = await this.findById(id);
    if (!existing) throw Errors.NotFound('Guichê');

    const updateParts: string[] = [];
    const binds: any = { id };

    if (updates.number !== undefined) {
      updateParts.push('number = :number');
      binds.number = updates.number;
    }
    if (updates.name !== undefined) {
      updateParts.push('name = :name');
      binds.name = updates.name;
    }
    if (updates.is_active !== undefined) {
      updateParts.push('is_active = :isActive');
      binds.isActive = updates.is_active ? 1 : 0;
    }

    if (updateParts.length > 0) {
      updateParts.push('updated_at = SYSTIMESTAMP');
      await Database.execute(
        `UPDATE counters SET ${updateParts.join(', ')} WHERE id = :id`,
        binds
      );
    }

    return (await this.findById(id))!;
  }

  async delete(id: string, userId?: string): Promise<void> {
    const counter = await this.findById(id);
    if (!counter) throw Errors.NotFound('Guichê');

    await Database.execute(`DELETE FROM counters WHERE id = :id`, { id });

    logAudit({
      action: 'COUNTER_DELETE',
      entityType: 'counter',
      entityId: id,
      userId,
      unitId: counter.unit_id,
      success: true,
    });
  }

  async assign(counterId: string, attendantId: string): Promise<Counter> {
    const counter = await this.findById(counterId);
    if (!counter) throw Errors.NotFound('Guichê');

    if (counter.current_attendant_id && counter.current_attendant_id !== attendantId) {
      throw Errors.Conflict('Guichê já está ocupado');
    }

    await Database.execute(
      `UPDATE counters SET current_attendant_id = :attendantId, updated_at = SYSTIMESTAMP WHERE id = :id`,
      { attendantId, id: counterId }
    );

    const updated = await this.findById(counterId);

    websocketBroadcast(counter.unit_id, {
      type: 'COUNTER_ASSIGNED',
      data: updated,
    });

    logAudit({
      action: 'COUNTER_ASSIGN',
      entityType: 'counter',
      entityId: counterId,
      userId: attendantId,
      unitId: counter.unit_id,
      success: true,
    });

    return updated!;
  }

  async release(counterId: string, attendantId: string): Promise<Counter> {
    const counter = await this.findById(counterId);
    if (!counter) throw Errors.NotFound('Guichê');

    await Database.execute(
      `UPDATE counters SET current_attendant_id = NULL, updated_at = SYSTIMESTAMP WHERE id = :id`,
      { id: counterId }
    );

    const updated = await this.findById(counterId);

    websocketBroadcast(counter.unit_id, {
      type: 'COUNTER_RELEASED',
      data: updated,
    });

    logAudit({
      action: 'COUNTER_RELEASE',
      entityType: 'counter',
      entityId: counterId,
      userId: attendantId,
      unitId: counter.unit_id,
      success: true,
    });

    return updated!;
  }

  async findById(id: string): Promise<Counter | null> {
    const result = await Database.execute<any>(
      `SELECT * FROM counters WHERE id = :id`,
      { id }
    );
    return this.mapRow(result.rows?.[0]);
  }

  async findByUnit(unitId: string): Promise<Counter[]> {
    const result = await Database.execute<any>(
      `SELECT * FROM counters WHERE unit_id = :unitId ORDER BY number`,
      { unitId }
    );
    return (result.rows || []).map(this.mapRow).filter(Boolean) as Counter[];
  }

  private mapRow(row: any): Counter | null {
    if (!row) return null;
    return {
      id: row.ID,
      unit_id: row.UNIT_ID,
      number: row.NUMBER,
      name: row.NAME,
      is_active: row.IS_ACTIVE === 1,
      current_attendant_id: row.CURRENT_ATTENDANT_ID,
      created_at: row.CREATED_AT,
      updated_at: row.UPDATED_AT,
    };
  }
}

export const countersService = new CountersService();
export default countersService;
