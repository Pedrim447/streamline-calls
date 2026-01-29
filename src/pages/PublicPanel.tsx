import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVoice } from '@/hooks/useVoice';
import { Badge } from '@/components/ui/badge';
import { Maximize, Volume2, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type Counter = Database['public']['Tables']['counters']['Row'];

interface TicketWithCounter extends Ticket {
  counter?: Counter;
}

interface CallQueueItem {
  ticket: TicketWithCounter;
  callNumber: number;
  scheduledAt: number;
}

// Mask name: show first name + first letter of last name
function maskName(fullName: string | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName} ${lastInitial}.`;
}

export default function PublicPanel() {
  const [currentTicket, setCurrentTicket] = useState<TicketWithCounter | null>(null);
  const [lastCalls, setLastCalls] = useState<TicketWithCounter[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isAnimating, setIsAnimating] = useState(false);
  const [counters, setCounters] = useState<Record<string, Counter>>({});
  const [queueCount, setQueueCount] = useState(0);
  
  // Track call counts per ticket: { ticketId: { counterId: callCount } }
  const callCountsRef = useRef<Record<string, Record<string, number>>>({});
  // Queue for scheduled calls (10s interval)
  const callQueueRef = useRef<CallQueueItem[]>([]);
  const processingRef = useRef(false);

  const { callTicket } = useVoice();

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch counters for display
  const fetchCounters = useCallback(async () => {
    const { data } = await supabase.from('counters').select('*');
    if (data) {
      const counterMap: Record<string, Counter> = {};
      data.forEach(c => { counterMap[c.id] = c; });
      setCounters(counterMap);
    }
  }, []);

  // Fetch queue count (waiting tickets)
  const fetchQueueCount = useCallback(async () => {
    const { count } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting');
    
    setQueueCount(count || 0);
  }, []);

  // Fetch recent called tickets
  const fetchRecentCalls = useCallback(async () => {
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .in('status', ['called', 'in_service', 'completed'])
      .not('called_at', 'is', null)
      .order('called_at', { ascending: false })
      .limit(8);

    if (data && data.length > 0) {
      const ticketsWithCounters = data.map(ticket => ({
        ...ticket,
        counter: ticket.counter_id ? counters[ticket.counter_id] : undefined,
      }));
      
      setCurrentTicket(ticketsWithCounters[0]);
      setLastCalls(ticketsWithCounters.slice(1, 8));
    }
  }, [counters]);

  useEffect(() => {
    fetchCounters();
    fetchQueueCount();
  }, [fetchCounters, fetchQueueCount]);

  useEffect(() => {
    if (Object.keys(counters).length > 0) {
      fetchRecentCalls();
    }
  }, [counters, fetchRecentCalls]);

  // Process call queue with 10s interval
  const processCallQueue = useCallback(() => {
    if (processingRef.current || callQueueRef.current.length === 0) return;
    
    const now = Date.now();
    const nextCall = callQueueRef.current[0];
    
    if (nextCall.scheduledAt <= now) {
      processingRef.current = true;
      callQueueRef.current.shift();
      
      // Execute the call
      const { ticket, callNumber } = nextCall;
      console.log(`[PublicPanel] Executing call ${callNumber}/3 for ${ticket.display_code}`);
      
      setIsAnimating(true);
      setCurrentTicket(ticket);
      
      if (ticket.counter) {
        callTicket(ticket.display_code, ticket.counter.number, true, ticket.client_name || undefined);
      }
      
      setTimeout(() => {
        setIsAnimating(false);
        processingRef.current = false;
      }, 3000);
    }
  }, [callTicket]);

  // Check queue every second
  useEffect(() => {
    const interval = setInterval(processCallQueue, 1000);
    return () => clearInterval(interval);
  }, [processCallQueue]);

  // Schedule calls for a ticket (max 3, 10s apart)
  const scheduleTicketCalls = useCallback((ticket: TicketWithCounter) => {
    const ticketId = ticket.id;
    const counterId = ticket.counter_id || '';
    
    // Initialize tracking
    if (!callCountsRef.current[ticketId]) {
      callCountsRef.current[ticketId] = {};
    }
    
    // Get current call count for this ticket at this counter
    const currentCount = callCountsRef.current[ticketId][counterId] || 0;
    
    // Max 3 calls per ticket per counter
    if (currentCount >= 3) {
      console.log(`[PublicPanel] Max calls reached for ${ticket.display_code} at counter ${counterId}`);
      return;
    }
    
    // Clear any pending calls for this ticket
    callQueueRef.current = callQueueRef.current.filter(item => item.ticket.id !== ticketId);
    
    // Schedule remaining calls
    const now = Date.now();
    const callsToSchedule = 3 - currentCount;
    
    for (let i = 0; i < callsToSchedule; i++) {
      const callNumber = currentCount + i + 1;
      const scheduledAt = now + (i * 10000); // 10 seconds apart
      
      callQueueRef.current.push({
        ticket,
        callNumber,
        scheduledAt,
      });
      
      // Update count
      callCountsRef.current[ticketId][counterId] = callNumber;
    }
    
    // Sort by scheduled time
    callQueueRef.current.sort((a, b) => a.scheduledAt - b.scheduledAt);
    
    console.log(`[PublicPanel] Scheduled ${callsToSchedule} calls for ${ticket.display_code}`);
  }, []);

  // Handle new call
  const handleNewCall = useCallback((updatedTicket: Ticket) => {
    const ticketWithCounter: TicketWithCounter = {
      ...updatedTicket,
      counter: updatedTicket.counter_id ? counters[updatedTicket.counter_id] : undefined,
    };
    
    // Schedule the 3 calls with 10s intervals
    scheduleTicketCalls(ticketWithCounter);
    
    // Update history
    setLastCalls(prev => {
      const filtered = prev.filter(t => t.id !== updatedTicket.id);
      return [ticketWithCounter, ...filtered].slice(0, 7);
    });
    
    // Update queue count
    fetchQueueCount();
  }, [counters, scheduleTicketCalls, fetchQueueCount]);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('public-panel-realtime', {
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
        },
        (payload) => {
          // Update queue count on any ticket change
          fetchQueueCount();
          
          if (payload.eventType === 'UPDATE') {
            const updatedTicket = payload.new as Ticket;
            
            // If a ticket was just called, trigger animation and voice
            if (updatedTicket.status === 'called' && updatedTicket.called_at) {
              handleNewCall(updatedTicket);
            }
          } else if (payload.eventType === 'INSERT') {
            fetchQueueCount();
          }
        }
      )
      .on('broadcast', { event: 'ticket_called' }, ({ payload }) => {
        console.log('[PublicPanel] Broadcast received:', payload);
        if (payload?.ticket && payload.ticket.status === 'called') {
          handleNewCall(payload.ticket);
        }
      })
      .on('broadcast', { event: 'ticket_created' }, () => {
        fetchQueueCount();
      })
      .subscribe((status) => {
        console.log('[PublicPanel] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [counters, handleNewCall, fetchQueueCount]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const getCounterNumber = (ticket: TicketWithCounter) => {
    if (ticket.counter) return ticket.counter.number;
    if (ticket.counter_id && counters[ticket.counter_id]) {
      return counters[ticket.counter_id].number;
    }
    return '-';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-black/30">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-lg font-medium text-white/80">Sistema de Senhas</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Queue Count */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg">
            <Users className="h-5 w-5 text-blue-400" />
            <span className="text-xl font-bold text-blue-400">{queueCount}</span>
            <span className="text-sm text-white/60">na fila</span>
          </div>
          <div className="flex items-center gap-2 text-white/70">
            <Clock className="h-5 w-5" />
            <span className="text-2xl font-mono font-bold">
              {format(currentTime, 'HH:mm:ss')}
            </span>
          </div>
          <span className="text-white/50 hidden md:block">
            {format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </span>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Tela Cheia"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex flex-col lg:flex-row h-[calc(100vh-64px)]">
        {/* Main Display - Current Ticket */}
        <div className="flex-1 flex items-center justify-center p-4 lg:p-6">
          {currentTicket ? (
            <div 
              className={`text-center transition-all duration-500 ${
                isAnimating ? 'scale-105' : 'scale-100'
              }`}
            >
              {/* Type Badge - Top */}
              <div className="mb-4">
                <Badge 
                  className={`text-xl px-6 py-2 ${
                    currentTicket.ticket_type === 'preferential'
                      ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                      : 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50'
                  }`}
                  variant="outline"
                >
                  {currentTicket.ticket_type === 'preferential' ? '⭐ PREFERENCIAL' : '● NORMAL'}
                </Badge>
              </div>

              {/* Ticket Code */}
              <div 
                className={`relative inline-block ${
                  isAnimating ? 'animate-pulse-glow' : ''
                }`}
              >
                <div 
                  className={`text-[10rem] md:text-[14rem] font-black tracking-wider leading-none ${
                    currentTicket.ticket_type === 'preferential'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                  style={{
                    textShadow: isAnimating 
                      ? `0 0 60px ${currentTicket.ticket_type === 'preferential' ? 'rgba(251, 191, 36, 0.6)' : 'rgba(52, 211, 153, 0.6)'}`
                      : `0 0 30px ${currentTicket.ticket_type === 'preferential' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(52, 211, 153, 0.3)'}`,
                  }}
                >
                  {currentTicket.display_code}
                </div>
                
                {/* Animated ring on new call */}
                {isAnimating && (
                  <div className="absolute inset-0 -z-10">
                    <div className="absolute inset-0 animate-ping rounded-3xl bg-white/10" />
                    <div className="absolute inset-0 animate-pulse rounded-3xl bg-white/5" />
                  </div>
                )}
              </div>

              {/* Client Name (masked) */}
              {currentTicket.client_name && (
                <div className="mt-4">
                  <span className="text-4xl md:text-5xl font-bold text-white/90">
                    {maskName(currentTicket.client_name)}
                  </span>
                </div>
              )}

              {/* Counter Number */}
              <div className="mt-6 flex items-center justify-center gap-4">
                <span className="text-3xl md:text-5xl text-white/60">Guichê</span>
                <span 
                  className="text-5xl md:text-7xl font-black text-white"
                  style={{ textShadow: '0 0 20px rgba(255,255,255,0.3)' }}
                >
                  {getCounterNumber(currentTicket)}
                </span>
              </div>

              {/* Speaking indicator */}
              {isAnimating && (
                <div className="mt-6 flex items-center justify-center gap-3 text-white/70 animate-pulse">
                  <Volume2 className="h-8 w-8" />
                  <span className="text-2xl">Chamando...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-white/40">
              <div className="text-6xl font-bold mb-4">---</div>
              <p className="text-2xl">Aguardando chamadas</p>
            </div>
          )}
        </div>

        {/* Sidebar - Last Calls */}
        <div className="lg:w-[400px] bg-black/40 p-4 border-l border-white/10 overflow-y-auto">
          <h2 className="text-lg font-semibold text-white/70 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Últimas Chamadas
          </h2>
          
          <div className="space-y-2">
            {lastCalls.length > 0 ? (
              lastCalls.map((ticket, index) => (
                <div
                  key={ticket.id}
                  className={`flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                    index === 0 
                      ? 'bg-white/10 border border-white/20' 
                      : 'bg-white/5 border border-white/5'
                  }`}
                  style={{
                    opacity: 1 - (index * 0.1),
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span 
                        className={`text-2xl font-bold ${
                          ticket.ticket_type === 'preferential'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {ticket.display_code}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          ticket.ticket_type === 'preferential'
                            ? 'border-amber-500/50 text-amber-400'
                            : 'border-emerald-500/50 text-emerald-400'
                        }`}
                      >
                        {ticket.ticket_type === 'preferential' ? 'P' : 'N'}
                      </Badge>
                    </div>
                    {ticket.client_name && (
                      <span className="text-sm text-white/60">
                        {maskName(ticket.client_name)}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-white/90">
                      Guichê {getCounterNumber(ticket)}
                    </div>
                    <div className="text-xs text-white/50">
                      {ticket.called_at && format(new Date(ticket.called_at), 'HH:mm')}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-white/30">
                <p>Nenhuma chamada recente</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer with branding and queue info */}
      <footer className="absolute bottom-0 left-0 right-0 p-3 bg-black/30 flex items-center justify-between">
        <p className="text-white/30 text-sm">
          Sistema FilaFácil • Gerenciamento Inteligente de Filas
        </p>
        <div className="flex items-center gap-2 text-white/50 text-sm">
          <Users className="h-4 w-4" />
          <span>{queueCount} pessoa(s) aguardando</span>
        </div>
      </footer>
    </div>
  );
}
