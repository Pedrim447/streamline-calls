/**
 * Serviço de Tickets (Senhas)
 * 
 * Gerencia operações de criação, chamada e atualização de senhas.
 */

import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database';
import { logger, logAudit } from '../utils/logger';
import { AppError, Errors } from '../middleware/errorHandler';
import { websocketBroadcast } from '../websocket/server';

export interface Ticket {
  id: string;
  unit_id: string;
  ticket_number: number;
  ticket_type: 'normal' | 'preferential';
  display_code: string;
  status: 'waiting' | 'called' | 'in_service' | 'completed' | 'cancelled' | 'skipped';
  priority: number;
  client_name?: string;
  client_cpf?: string;
  attendant_id?: string;
  counter_id?: string;
  called_at?: Date;
  service_started_at?: Date;
  completed_at?: Date;
  skip_reason?: string;
  cancel_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTicketRequest {
  unit_id: string;
  ticket_type: 'normal' | 'preferential';
  client_name?: string;
  client_cpf?: string;
}

export interface CallNextTicketRequest {
  unit_id: string;
  counter_id: string;
  attendant_id: string;
}

class TicketsService {
  /**
   * Cria um novo ticket
   */
  async create(request: CreateTicketRequest, userId?: string): Promise<Ticket> {
    const { unit_id, ticket_type, client_name, client_cpf } = request;

    // Buscar próximo número
    const nextNumber = await this.getNextTicketNumber(unit_id, ticket_type);
    
    // Buscar prioridade das configurações
    const settingsResult = await Database.execute<any>(
      `SELECT normal_priority, preferential_priority FROM settings WHERE unit_id = :unitId`,
      { unitId: unit_id }
    );
    
    const settings = settingsResult.rows?.[0];
    const priority = ticket_type === 'preferential' 
      ? (settings?.PREFERENTIAL_PRIORITY || 10)
      : (settings?.NORMAL_PRIORITY || 0);

    // Gerar código de exibição
    const prefix = ticket_type === 'preferential' ? 'P' : 'N';
    const displayCode = `${prefix}-${String(nextNumber).padStart(3, '0')}`;

    const ticketId = uuidv4();

    await Database.execute(
      `INSERT INTO tickets (
        id, unit_id, ticket_number, ticket_type, display_code, 
        status, priority, client_name, client_cpf, created_at, updated_at
      ) VALUES (
        :id, :unitId, :ticketNumber, :ticketType, :displayCode,
        'waiting', :priority, :clientName, :clientCpf, SYSTIMESTAMP, SYSTIMESTAMP
      )`,
      {
        id: ticketId,
        unitId: unit_id,
        ticketNumber: nextNumber,
        ticketType: ticket_type,
        displayCode,
        priority,
        clientName: client_name || null,
        clientCpf: client_cpf || null,
      }
    );

    const ticket = await this.findById(ticketId);
    
    if (!ticket) {
      throw Errors.Internal('Erro ao criar ticket');
    }

    // Broadcast via WebSocket
    websocketBroadcast(unit_id, {
      type: 'TICKET_CREATED',
      data: ticket,
    });

    logAudit({
      action: 'TICKET_CREATE',
      entityType: 'ticket',
      entityId: ticketId,
      userId,
      unitId: unit_id,
      details: { displayCode, ticketType: ticket_type },
      success: true,
    });

    return ticket;
  }

  /**
   * Busca próximo número de ticket para o dia
   */
  private async getNextTicketNumber(unitId: string, ticketType: string): Promise<number> {
    return Database.executeInTransaction(async (conn) => {
      // Tentar atualizar contador existente
      const updateResult = await conn.execute(
        `UPDATE ticket_counters 
         SET last_number = last_number + 1, updated_at = SYSTIMESTAMP
         WHERE unit_id = :unitId 
           AND ticket_type = :ticketType 
           AND counter_date = TRUNC(SYSDATE)
         RETURNING last_number INTO :lastNumber`,
        {
          unitId,
          ticketType,
          lastNumber: { dir: require('oracledb').BIND_OUT, type: require('oracledb').NUMBER },
        }
      );

      if ((updateResult as any).rowsAffected > 0) {
        return (updateResult.outBinds as any).lastNumber[0];
      }

      // Criar novo contador para o dia
      const startNumber = ticketType === 'normal' ? 500 : 0;
      const newNumber = startNumber + 1;

      await conn.execute(
        `INSERT INTO ticket_counters (id, unit_id, ticket_type, counter_date, last_number, created_at, updated_at)
         VALUES (:id, :unitId, :ticketType, TRUNC(SYSDATE), :lastNumber, SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          id: uuidv4(),
          unitId,
          ticketType,
          lastNumber: newNumber,
        }
      );

      return newNumber;
    });
  }

  /**
   * Chama próximo ticket da fila
   */
  async callNext(request: CallNextTicketRequest): Promise<Ticket | null> {
    const { unit_id, counter_id, attendant_id } = request;

    // Buscar próximo ticket (prioridade DESC, depois created_at ASC)
    const nextTicket = await Database.execute<any>(
      `SELECT id FROM (
        SELECT id FROM tickets 
        WHERE unit_id = :unitId 
          AND status = 'waiting'
          AND TRUNC(created_at) = TRUNC(SYSDATE)
        ORDER BY priority DESC, created_at ASC
      ) WHERE ROWNUM = 1`,
      { unitId: unit_id }
    );

    const ticketId = nextTicket.rows?.[0]?.ID;

    if (!ticketId) {
      return null; // Fila vazia
    }

    // Atualizar ticket
    await Database.execute(
      `UPDATE tickets SET
        status = 'called',
        attendant_id = :attendantId,
        counter_id = :counterId,
        called_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
      WHERE id = :ticketId`,
      { attendantId: attendant_id, counterId: counter_id, ticketId }
    );

    const ticket = await this.findById(ticketId);

    if (ticket) {
      websocketBroadcast(unit_id, {
        type: 'TICKET_CALLED',
        data: ticket,
      });

      logAudit({
        action: 'TICKET_CALL',
        entityType: 'ticket',
        entityId: ticketId,
        userId: attendant_id,
        unitId: unit_id,
        details: { displayCode: ticket.display_code, counterId: counter_id },
        success: true,
      });
    }

    return ticket;
  }

  /**
   * Repete chamada de ticket
   */
  async repeatCall(ticketId: string, attendantId: string): Promise<Ticket> {
    const ticket = await this.findById(ticketId);
    
    if (!ticket) {
      throw Errors.NotFound('Ticket');
    }

    if (ticket.status !== 'called') {
      throw Errors.BadRequest('Ticket não está no status "chamado"');
    }

    await Database.execute(
      `UPDATE tickets SET called_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP WHERE id = :ticketId`,
      { ticketId }
    );

    websocketBroadcast(ticket.unit_id, {
      type: 'TICKET_RECALLED',
      data: ticket,
    });

    return ticket;
  }

  /**
   * Inicia atendimento
   */
  async startService(ticketId: string, attendantId: string): Promise<Ticket> {
    const ticket = await this.findById(ticketId);
    
    if (!ticket) {
      throw Errors.NotFound('Ticket');
    }

    if (ticket.status !== 'called') {
      throw Errors.BadRequest('Ticket precisa estar no status "chamado"');
    }

    await Database.execute(
      `UPDATE tickets SET
        status = 'in_service',
        service_started_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
      WHERE id = :ticketId`,
      { ticketId }
    );

    const updated = await this.findById(ticketId);

    if (updated) {
      websocketBroadcast(updated.unit_id, {
        type: 'TICKET_IN_SERVICE',
        data: updated,
      });

      logAudit({
        action: 'TICKET_START_SERVICE',
        entityType: 'ticket',
        entityId: ticketId,
        userId: attendantId,
        unitId: updated.unit_id,
        success: true,
      });
    }

    return updated!;
  }

  /**
   * Finaliza atendimento
   */
  async complete(ticketId: string, attendantId: string): Promise<Ticket> {
    const ticket = await this.findById(ticketId);
    
    if (!ticket) {
      throw Errors.NotFound('Ticket');
    }

    if (ticket.status !== 'in_service') {
      throw Errors.BadRequest('Ticket precisa estar em atendimento');
    }

    await Database.execute(
      `UPDATE tickets SET
        status = 'completed',
        completed_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
      WHERE id = :ticketId`,
      { ticketId }
    );

    const updated = await this.findById(ticketId);

    if (updated) {
      websocketBroadcast(updated.unit_id, {
        type: 'TICKET_COMPLETED',
        data: updated,
      });

      logAudit({
        action: 'TICKET_COMPLETE',
        entityType: 'ticket',
        entityId: ticketId,
        userId: attendantId,
        unitId: updated.unit_id,
        success: true,
      });
    }

    return updated!;
  }

  /**
   * Pula ticket
   */
  async skip(ticketId: string, reason: string, attendantId: string): Promise<Ticket> {
    const ticket = await this.findById(ticketId);
    
    if (!ticket) {
      throw Errors.NotFound('Ticket');
    }

    await Database.execute(
      `UPDATE tickets SET
        status = 'skipped',
        skip_reason = :reason,
        updated_at = SYSTIMESTAMP
      WHERE id = :ticketId`,
      { reason, ticketId }
    );

    const updated = await this.findById(ticketId);

    if (updated) {
      websocketBroadcast(updated.unit_id, {
        type: 'TICKET_SKIPPED',
        data: updated,
      });

      logAudit({
        action: 'TICKET_SKIP',
        entityType: 'ticket',
        entityId: ticketId,
        userId: attendantId,
        unitId: updated.unit_id,
        details: { reason },
        success: true,
      });
    }

    return updated!;
  }

  /**
   * Cancela ticket
   */
  async cancel(ticketId: string, reason: string, userId: string): Promise<Ticket> {
    const ticket = await this.findById(ticketId);
    
    if (!ticket) {
      throw Errors.NotFound('Ticket');
    }

    await Database.execute(
      `UPDATE tickets SET
        status = 'cancelled',
        cancel_reason = :reason,
        updated_at = SYSTIMESTAMP
      WHERE id = :ticketId`,
      { reason, ticketId }
    );

    const updated = await this.findById(ticketId);

    if (updated) {
      websocketBroadcast(updated.unit_id, {
        type: 'TICKET_CANCELLED',
        data: updated,
      });

      logAudit({
        action: 'TICKET_CANCEL',
        entityType: 'ticket',
        entityId: ticketId,
        userId,
        unitId: updated.unit_id,
        details: { reason },
        success: true,
      });
    }

    return updated!;
  }

  /**
   * Busca ticket por ID
   */
  async findById(id: string): Promise<Ticket | null> {
    const result = await Database.execute<any>(
      `SELECT * FROM tickets WHERE id = :id`,
      { id }
    );

    return this.mapRowToTicket(result.rows?.[0]);
  }

  /**
   * Lista tickets com filtros
   */
  async findAll(filters: {
    unit_id?: string;
    status?: string | string[];
    ticket_type?: string;
    attendant_id?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<Ticket[]> {
    let sql = 'SELECT * FROM tickets WHERE 1=1';
    const binds: any = {};

    if (filters.unit_id) {
      sql += ' AND unit_id = :unitId';
      binds.unitId = filters.unit_id;
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        const statusList = filters.status.map((s, i) => `:status${i}`).join(',');
        sql += ` AND status IN (${statusList})`;
        filters.status.forEach((s, i) => binds[`status${i}`] = s);
      } else {
        sql += ' AND status = :status';
        binds.status = filters.status;
      }
    }

    if (filters.ticket_type) {
      sql += ' AND ticket_type = :ticketType';
      binds.ticketType = filters.ticket_type;
    }

    if (filters.attendant_id) {
      sql += ' AND attendant_id = :attendantId';
      binds.attendantId = filters.attendant_id;
    }

    if (filters.date_from) {
      sql += ' AND created_at >= TO_TIMESTAMP(:dateFrom, \'YYYY-MM-DD"T"HH24:MI:SS\')';
      binds.dateFrom = filters.date_from;
    }

    if (filters.date_to) {
      sql += ' AND created_at <= TO_TIMESTAMP(:dateTo, \'YYYY-MM-DD"T"HH24:MI:SS\')';
      binds.dateTo = filters.date_to;
    }

    sql += ' ORDER BY priority DESC, created_at ASC';

    const result = await Database.execute<any>(sql, binds);
    
    return (result.rows || []).map(this.mapRowToTicket).filter(Boolean) as Ticket[];
  }

  /**
   * Conta tickets na fila de espera
   */
  async countWaiting(unitId: string): Promise<number> {
    const result = await Database.execute<any>(
      `SELECT COUNT(*) as total FROM tickets 
       WHERE unit_id = :unitId 
         AND status = 'waiting' 
         AND TRUNC(created_at) = TRUNC(SYSDATE)`,
      { unitId }
    );

    return result.rows?.[0]?.TOTAL || 0;
  }

  /**
   * Mapeia row do Oracle para objeto Ticket
   */
  private mapRowToTicket(row: any): Ticket | null {
    if (!row) return null;

    return {
      id: row.ID,
      unit_id: row.UNIT_ID,
      ticket_number: row.TICKET_NUMBER,
      ticket_type: row.TICKET_TYPE,
      display_code: row.DISPLAY_CODE,
      status: row.STATUS,
      priority: row.PRIORITY,
      client_name: row.CLIENT_NAME,
      client_cpf: row.CLIENT_CPF,
      attendant_id: row.ATTENDANT_ID,
      counter_id: row.COUNTER_ID,
      called_at: row.CALLED_AT,
      service_started_at: row.SERVICE_STARTED_AT,
      completed_at: row.COMPLETED_AT,
      skip_reason: row.SKIP_REASON,
      cancel_reason: row.CANCEL_REASON,
      created_at: row.CREATED_AT,
      updated_at: row.UPDATED_AT,
    };
  }
}

export const ticketsService = new TicketsService();
export default ticketsService;
