/**
 * Tickets Service
 * 
 * Handles all ticket-related API operations.
 */

import api from '@/lib/api';
import { API_CONFIG } from '@/config/api.config';
import type {
  Ticket,
  CreateTicketRequest,
  CreateTicketResponse,
  CallNextTicketRequest,
  CallNextTicketResponse,
  SkipTicketRequest,
  TicketFilter,
} from '@/types/api.types';

class TicketsService {
  /**
   * Get tickets with optional filters
   */
  async getTickets(filter?: TicketFilter): Promise<{ data?: Ticket[]; error?: string }> {
    const query: Record<string, string | undefined> = {};
    
    if (filter) {
      if (filter.unit_id) query.unit_id = filter.unit_id;
      if (filter.status) {
        query.status = Array.isArray(filter.status) ? filter.status.join(',') : filter.status;
      }
      if (filter.ticket_type) query.ticket_type = filter.ticket_type;
      if (filter.attendant_id) query.attendant_id = filter.attendant_id;
      if (filter.date_from) query.date_from = filter.date_from;
      if (filter.date_to) query.date_to = filter.date_to;
    }
    
    const response = await api.get<Ticket[]>(API_CONFIG.ENDPOINTS.TICKETS.BASE, { query });
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao buscar senhas' };
  }

  /**
   * Get a single ticket by ID
   */
  async getTicket(id: string): Promise<{ data?: Ticket; error?: string }> {
    const response = await api.get<Ticket>(`${API_CONFIG.ENDPOINTS.TICKETS.BASE}/${id}`);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Senha não encontrada' };
  }

  /**
   * Create a new ticket
   */
  async createTicket(request: CreateTicketRequest): Promise<{ data?: CreateTicketResponse; error?: string }> {
    const response = await api.post<CreateTicketResponse>(
      API_CONFIG.ENDPOINTS.TICKETS.CREATE,
      request
    );
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao criar senha' };
  }

  /**
   * Call next ticket in queue
   */
  async callNextTicket(request: CallNextTicketRequest): Promise<{ data?: CallNextTicketResponse; error?: string }> {
    const response = await api.post<CallNextTicketResponse>(
      API_CONFIG.ENDPOINTS.TICKETS.CALL_NEXT,
      request
    );
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao chamar próxima senha' };
  }

  /**
   * Repeat ticket call
   */
  async repeatCall(ticketId: string): Promise<{ data?: Ticket; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.TICKETS.REPEAT_CALL.replace(':id', ticketId);
    const response = await api.post<Ticket>(endpoint);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao repetir chamada' };
  }

  /**
   * Start service for a ticket
   */
  async startService(ticketId: string): Promise<{ data?: Ticket; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.TICKETS.START_SERVICE.replace(':id', ticketId);
    const response = await api.post<Ticket>(endpoint);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao iniciar atendimento' };
  }

  /**
   * Complete a ticket
   */
  async completeTicket(ticketId: string): Promise<{ data?: Ticket; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.TICKETS.COMPLETE.replace(':id', ticketId);
    const response = await api.post<Ticket>(endpoint);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao finalizar atendimento' };
  }

  /**
   * Skip a ticket
   */
  async skipTicket(ticketId: string, reason: string): Promise<{ data?: Ticket; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.TICKETS.SKIP.replace(':id', ticketId);
    const response = await api.post<Ticket>(endpoint, { reason } as SkipTicketRequest);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao pular senha' };
  }

  /**
   * Cancel a ticket
   */
  async cancelTicket(ticketId: string, reason: string): Promise<{ data?: Ticket; error?: string }> {
    const endpoint = API_CONFIG.ENDPOINTS.TICKETS.CANCEL.replace(':id', ticketId);
    const response = await api.post<Ticket>(endpoint, { reason });
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao cancelar senha' };
  }

  /**
   * Get today's tickets for a unit
   */
  async getTodayTickets(unitId: string): Promise<{ data?: Ticket[]; error?: string }> {
    const today = new Date().toISOString().split('T')[0];
    return this.getTickets({
      unit_id: unitId,
      date_from: `${today}T00:00:00`,
      date_to: `${today}T23:59:59`,
    });
  }

  /**
   * Get waiting tickets for a unit
   */
  async getWaitingTickets(unitId: string): Promise<{ data?: Ticket[]; error?: string }> {
    const today = new Date().toISOString().split('T')[0];
    return this.getTickets({
      unit_id: unitId,
      status: 'waiting',
      date_from: `${today}T00:00:00`,
    });
  }
}

export const ticketsService = new TicketsService();
export default ticketsService;
