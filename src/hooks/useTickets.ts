import { useState, useEffect, useCallback, useRef } from 'react';
import * as localDb from '@/lib/localDatabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

type Ticket = localDb.Ticket;
type TicketStatus = localDb.TicketStatus;
type TicketType = localDb.TicketType;

interface UseTicketsOptions {
  unitId?: string | null;
  status?: TicketStatus[];
  limit?: number;
  realtime?: boolean;
}

export function useTickets(options: UseTicketsOptions = {}) {
  const { unitId, status, limit = 50, realtime = true } = options;
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const effectiveUnitId = unitId ?? profile?.unit_id ?? 'a0000000-0000-0000-0000-000000000001';

  const fetchTickets = useCallback(async () => {
    if (!effectiveUnitId) {
      setTickets([]);
      setIsLoading(false);
      return;
    }

    try {
      const data = await localDb.getTickets(effectiveUnitId, { status, limit });
      setTickets(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUnitId, status, limit]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Subscribe to local events for realtime-like updates
  useEffect(() => {
    if (!realtime) return;

    const unsubscribeCreated = localDb.subscribeToEvent('ticket_created', () => {
      fetchTickets();
    });

    const unsubscribeUpdated = localDb.subscribeToEvent('ticket_updated', () => {
      fetchTickets();
    });

    const unsubscribeCalled = localDb.subscribeToEvent('ticket_called', () => {
      fetchTickets();
    });

    const unsubscribeChange = localDb.subscribeToEvent('tickets_change', () => {
      fetchTickets();
    });

    const unsubscribeReset = localDb.subscribeToEvent('system_reset', () => {
      setTickets([]);
      fetchTickets();
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeCalled();
      unsubscribeChange();
      unsubscribeReset();
    };
  }, [realtime, fetchTickets]);

  const callNextTicket = async (counterId: string) => {
    if (!effectiveUnitId) {
      toast({
        title: 'Erro',
        description: 'Unidade não configurada',
        variant: 'destructive',
      });
      return null;
    }

    const { user } = useAuth();
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Usuário não autenticado',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const { ticket, error, queue_empty } = await localDb.callNextTicket(
        effectiveUnitId, 
        counterId, 
        user.id
      );

      if (queue_empty) {
        toast({
          title: 'Fila Vazia',
          description: 'Não há senhas na fila para chamar.',
          variant: 'destructive',
        });
        return null;
      }

      if (error) {
        toast({
          title: 'Aviso',
          description: error,
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: 'Senha Chamada',
        description: `Senha ${ticket!.display_code} chamada com sucesso`,
      });

      return ticket;
    } catch (err) {
      console.error('Error calling next ticket:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao chamar próxima senha',
        variant: 'destructive',
      });
      return null;
    }
  };

  const repeatCall = async (ticketId: string) => {
    try {
      const { ticket, error } = await localDb.repeatCall(ticketId);

      if (error) {
        toast({
          title: 'Erro',
          description: error,
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: 'Chamada Repetida',
        description: `Senha ${ticket!.display_code} chamada novamente`,
      });

      return ticket;
    } catch (err) {
      console.error('Error repeating call:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao repetir chamada',
        variant: 'destructive',
      });
      return null;
    }
  };

  const startService = async (ticketId: string) => {
    try {
      await localDb.updateTicket(ticketId, {
        status: 'in_service',
        service_started_at: new Date().toISOString(),
      });

      toast({
        title: 'Atendimento Iniciado',
        description: 'O atendimento foi iniciado',
      });
    } catch (err) {
      console.error('Error starting service:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao iniciar atendimento',
        variant: 'destructive',
      });
    }
  };

  const completeService = async (ticketId: string, serviceType?: string, completionStatus?: string) => {
    try {
      await localDb.updateTicket(ticketId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        service_type: serviceType || null,
        completion_status: completionStatus || null,
      });

      toast({
        title: 'Atendimento Finalizado',
        description: 'O atendimento foi concluído',
      });
    } catch (err) {
      console.error('Error completing service:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao finalizar atendimento',
        variant: 'destructive',
      });
    }
  };

  const skipTicket = async (ticketId: string, reason: string) => {
    try {
      const { ticket, error } = await localDb.skipTicket(ticketId, reason);

      if (error) {
        toast({
          title: 'Erro',
          description: error,
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: 'Senha Pulada',
        description: `Senha ${ticket!.display_code} foi pulada`,
      });

      return ticket;
    } catch (err) {
      console.error('Error skipping ticket:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao pular senha',
        variant: 'destructive',
      });
      return null;
    }
  };

  const createTicket = async (type: TicketType) => {
    if (!effectiveUnitId) {
      toast({
        title: 'Erro',
        description: 'Unidade não configurada',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const { ticket, error } = await localDb.createTicket({
        unit_id: effectiveUnitId,
        ticket_type: type,
      });

      if (error) {
        toast({
          title: 'Erro',
          description: error,
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: 'Senha Gerada',
        description: `Senha ${ticket!.display_code} criada`,
      });

      return ticket;
    } catch (err) {
      console.error('Error creating ticket:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao gerar senha',
        variant: 'destructive',
      });
      return null;
    }
  };

  return {
    tickets,
    isLoading,
    error,
    refetch: fetchTickets,
    callNextTicket,
    repeatCall,
    startService,
    completeService,
    skipTicket,
    createTicket,
  };
}
