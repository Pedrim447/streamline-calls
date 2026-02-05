import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type TicketStatus = Database['public']['Enums']['ticket_status'];
type TicketType = Database['public']['Enums']['ticket_type'];

interface UseTicketsOptions {
  unitId?: string | null;
  status?: TicketStatus[];
  organIds?: string[];
  limit?: number;
  realtime?: boolean;
  atendimentoAcaoEnabled?: boolean;
}

export function useTickets(options: UseTicketsOptions = {}) {
  const { unitId, status, organIds, limit = 50, realtime = true, atendimentoAcaoEnabled = false } = options;
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const effectiveUnitId = unitId ?? profile?.unit_id;

  const fetchTickets = useCallback(async () => {
    if (!effectiveUnitId) {
      setTickets([]);
      setIsLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('tickets')
        .select('*')
        .eq('unit_id', effectiveUnitId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

      if (status && status.length > 0) {
        query = query.in('status', status);
      }

      // Filter by organ IDs if provided
      if (organIds && organIds.length > 0) {
        query = query.in('organ_id', organIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setTickets(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUnitId, status, organIds, limit]);

  // Optimistic update helper
  const optimisticUpdate = useCallback((ticketId: string, updates: Partial<Ticket>) => {
    setTickets(prev => prev.map(t => 
      t.id === ticketId ? { ...t, ...updates } : t
    ));
  }, []);

  // Broadcast helper for instant updates across clients
  const broadcastUpdate = useCallback((event: string, payload: any) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event,
        payload,
      });
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Realtime subscription with broadcast support
  useEffect(() => {
    if (!realtime || !effectiveUnitId) return;

    const channel = supabase
      .channel(`tickets-${effectiveUnitId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `unit_id=eq.${effectiveUnitId}`,
        },
        (payload) => {
          console.log('[Realtime] DB change:', payload.eventType);
          if (payload.eventType === 'INSERT') {
            setTickets(prev => {
              const newTicket = payload.new as Ticket;
              // Check if already exists (optimistic update)
              if (prev.some(t => t.id === newTicket.id)) return prev;
              // Check if matches status filter
              if (status && status.length > 0 && !status.includes(newTicket.status)) {
                return prev;
              }
              return [...prev, newTicket].sort((a, b) => {
                if (b.priority !== a.priority) return b.priority - a.priority;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
              });
            });
          } else if (payload.eventType === 'UPDATE') {
            setTickets(prev => {
              const updatedTicket = payload.new as Ticket;
              // If status filter exists and ticket no longer matches, remove it
              if (status && status.length > 0 && !status.includes(updatedTicket.status)) {
                return prev.filter(t => t.id !== updatedTicket.id);
              }
              // Otherwise update it
              return prev.map(t => t.id === updatedTicket.id ? updatedTicket : t);
            });
          } else if (payload.eventType === 'DELETE') {
            setTickets(prev => prev.filter(t => t.id !== (payload.old as Ticket).id));
          }
        }
      )
      .on('broadcast', { event: 'ticket_called' }, ({ payload }) => {
        console.log('[Realtime] Broadcast ticket_called:', payload);
        // Instant update from broadcast (faster than DB change propagation)
        if (payload?.ticket) {
          setTickets(prev => prev.map(t => 
            t.id === payload.ticket.id ? { ...t, ...payload.ticket } : t
          ));
        }
      })
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    channelRef.current = channel;

    // Listen for system reset broadcast
    const resetChannel = supabase
      .channel(`system-reset-tickets-${effectiveUnitId}`)
      .on('broadcast', { event: 'system_reset' }, () => {
        console.log('[Realtime] System reset broadcast received');
        // Clear local tickets and refetch
        setTickets([]);
        fetchTickets();
      })
      .subscribe();

    return () => {
      console.log('[Realtime] Cleaning up channel');
      supabase.removeChannel(channel);
      supabase.removeChannel(resetChannel);
      channelRef.current = null;
    };
  }, [realtime, effectiveUnitId, status, fetchTickets]);

  const callNextTicket = async (counterId: string, filterOrganIds?: string[]) => {
    if (!effectiveUnitId) {
      toast({
        title: 'Erro',
        description: 'Unidade não configurada',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const requestBody: Record<string, unknown> = {
        unit_id: effectiveUnitId,
        counter_id: counterId,
        action: 'call_next',
      };

      // Add organ_ids filter for Modo Ação
      if (filterOrganIds && filterOrganIds.length > 0) {
        requestBody.organ_ids = filterOrganIds;
      }

      const { data, error } = await supabase.functions.invoke('call-ticket', {
        body: requestBody,
      });

      if (error) throw error;
      
      // Check if queue is empty
      if (data.queue_empty || data.no_tickets) {
        toast({
          title: 'Fila Vazia',
          description: data.error || 'Não há senhas na fila para chamar. Aguarde a recepção entregar novas senhas.',
          variant: 'destructive',
        });
        return null;
      }
      
      if (data.error) {
        toast({
          title: 'Aviso',
          description: data.error,
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: 'Senha Chamada',
        description: `Senha ${data.ticket.display_code} chamada com sucesso`,
      });

      return data.ticket as Ticket;
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
      const { data, error } = await supabase.functions.invoke('call-ticket', {
        body: {
          ticket_id: ticketId,
          action: 'repeat',
        },
      });

      if (error) throw error;
      
      toast({
        title: 'Chamada Repetida',
        description: `Senha ${data.ticket.display_code} chamada novamente`,
      });

      return data.ticket as Ticket;
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
      const { error } = await supabase
        .from('tickets')
        .update({
          status: 'in_service' as TicketStatus,
          service_started_at: new Date().toISOString(),
        })
        .eq('id', ticketId);

      if (error) throw error;
      
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
      const { error } = await supabase
        .from('tickets')
        .update({
          status: 'completed' as TicketStatus,
          completed_at: new Date().toISOString(),
          service_type: serviceType || null,
          completion_status: completionStatus || null,
        })
        .eq('id', ticketId);

      if (error) throw error;
      
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
      const { data, error } = await supabase.functions.invoke('call-ticket', {
        body: {
          ticket_id: ticketId,
          action: 'skip',
          skip_reason: reason,
        },
      });

      if (error) throw error;
      
      toast({
        title: 'Senha Pulada',
        description: `Senha ${data.ticket.display_code} foi pulada`,
      });

      return data.ticket as Ticket;
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
      const { data, error } = await supabase.functions.invoke('create-ticket', {
        body: {
          unit_id: effectiveUnitId,
          ticket_type: type,
        },
      });

      if (error) throw error;
      
      toast({
        title: 'Senha Gerada',
        description: `Senha ${data.ticket.display_code} criada`,
      });

      return data.ticket as Ticket;
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
