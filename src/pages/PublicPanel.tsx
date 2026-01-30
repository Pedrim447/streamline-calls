import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVoice } from '@/hooks/useVoice';
import { Badge } from '@/components/ui/badge';
import { Maximize, Volume2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type Counter = Database['public']['Tables']['counters']['Row'];

interface TicketWithCounter extends Ticket {
  counter?: Counter;
}

export default function PublicPanel() {
  const [currentTicket, setCurrentTicket] = useState<TicketWithCounter | null>(null);
  const [lastCalls, setLastCalls] = useState<TicketWithCounter[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isAnimating, setIsAnimating] = useState(false);
  const [counters, setCounters] = useState<Record<string, Counter>>({});
  const [isLoading, setIsLoading] = useState(true);

  const countersRef = useRef<Record<string, Counter>>({});
  const callTicketRef = useRef<(code: string, counter: number) => void>(() => {});
  const { callTicket } = useVoice();

  // Keep refs in sync
  useEffect(() => {
    countersRef.current = counters;
  }, [counters]);

  useEffect(() => {
    callTicketRef.current = callTicket;
  }, [callTicket]);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial data load - run once on mount
  useEffect(() => {
    let isMounted = true;
    
    const loadInitialData = async () => {
      console.log('[PublicPanel] Loading initial data...');
      
      // Fetch counters
      const { data: counterData, error: counterError } = await supabase
        .from('counters')
        .select('*');
      
      if (counterError) {
        console.error('[PublicPanel] Error fetching counters:', counterError);
      }
      
      let counterMap: Record<string, Counter> = {};
      if (counterData) {
        console.log('[PublicPanel] Counters loaded:', counterData.length);
        counterData.forEach(c => { counterMap[c.id] = c; });
        if (isMounted) {
          setCounters(counterMap);
          countersRef.current = counterMap;
        }
      }

      // Fetch recent tickets
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .in('status', ['called', 'in_service'])
        .not('called_at', 'is', null)
        .order('called_at', { ascending: false })
        .limit(6);

      if (ticketError) {
        console.error('[PublicPanel] Error fetching tickets:', ticketError);
      }

      console.log('[PublicPanel] Tickets loaded:', ticketData?.length || 0);
      
      if (isMounted && ticketData && ticketData.length > 0) {
        const ticketsWithCounters = ticketData.map(ticket => ({
          ...ticket,
          counter: ticket.counter_id ? counterMap[ticket.counter_id] : undefined,
        }));
        
        setCurrentTicket(ticketsWithCounters[0]);
        setLastCalls(ticketsWithCounters.slice(1, 6));
      }
      
      if (isMounted) {
        setIsLoading(false);
      }
    };

    loadInitialData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle new call - stable function using refs
  const handleNewCall = useCallback(async (updatedTicket: Ticket) => {
    console.log('[PublicPanel] Handling new call:', updatedTicket.display_code);
    
    // Fetch counter info using ref
    let counter = updatedTicket.counter_id ? countersRef.current[updatedTicket.counter_id] : undefined;
    
    if (!counter && updatedTicket.counter_id) {
      console.log('[PublicPanel] Counter not in cache, fetching...');
      const { data } = await supabase
        .from('counters')
        .select('*')
        .eq('id', updatedTicket.counter_id)
        .single();
      
      if (data) {
        counter = data;
        countersRef.current[data.id] = data;
        setCounters(prev => ({ ...prev, [data.id]: data }));
      }
    }
    
    const ticketWithCounter: TicketWithCounter = {
      ...updatedTicket,
      counter,
    };
    
    setIsAnimating(true);
    setCurrentTicket(ticketWithCounter);
    
    // Play voice announcement using ref
    if (counter) {
      console.log('[PublicPanel] Playing voice for counter:', counter.number);
      callTicketRef.current(updatedTicket.display_code, counter.number);
    }
    
    // Move previous current to history
    setLastCalls(prev => {
      const filtered = prev.filter(t => t.id !== updatedTicket.id);
      return filtered.slice(0, 4);
    });
    
    setTimeout(() => setIsAnimating(false), 2000);
  }, []); // No dependencies - uses refs

  // Subscribe to real-time updates - run once after mount
  useEffect(() => {
    console.log('[PublicPanel] Setting up realtime subscription...');
    
    const channel = supabase
      .channel('public-panel-tickets')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          console.log('[PublicPanel] Ticket updated:', payload);
          const updatedTicket = payload.new as Ticket;
          
          // If a ticket was just called, trigger animation and voice
          if (updatedTicket.status === 'called' && updatedTicket.called_at) {
            handleNewCall(updatedTicket);
          }
        }
      )
      .subscribe((status) => {
        console.log('[PublicPanel] Realtime status:', status);
      });

    return () => {
      console.log('[PublicPanel] Cleaning up realtime...');
      supabase.removeChannel(channel);
    };
  }, [handleNewCall]); // handleNewCall is now stable

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
      <header className="flex items-center justify-between px-8 py-4 bg-black/30">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-lg font-medium text-white/80">Sistema de Senhas</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-white/70">
            <Clock className="h-5 w-5" />
            <span className="text-2xl font-mono font-bold">
              {format(currentTime, 'HH:mm:ss')}
            </span>
          </div>
          <span className="text-white/50">
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

      <main className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        {/* Main Display - Current Ticket */}
        <div className="flex-1 flex items-center justify-center p-8">
          {currentTicket ? (
            <div 
              className={`text-center transition-all duration-500 ${
                isAnimating ? 'scale-110' : 'scale-100'
              }`}
            >
              {/* Ticket Code */}
              <div 
                className={`relative inline-block ${
                  isAnimating ? 'animate-pulse-glow' : ''
                }`}
              >
                <div 
                  className={`text-[12rem] md:text-[16rem] font-black tracking-wider leading-none ${
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

              {/* Counter Number */}
              <div className="mt-8 flex items-center justify-center gap-4">
                <span className="text-4xl md:text-6xl text-white/60">Guichê</span>
                <span 
                  className="text-6xl md:text-8xl font-black text-white"
                  style={{ textShadow: '0 0 20px rgba(255,255,255,0.3)' }}
                >
                  {getCounterNumber(currentTicket)}
                </span>
              </div>

              {/* Type Badge */}
              <div className="mt-6">
                <Badge 
                  className={`text-2xl px-6 py-2 ${
                    currentTicket.ticket_type === 'preferential'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  }`}
                  variant="outline"
                >
                  {currentTicket.ticket_type === 'preferential' ? 'PREFERENCIAL' : 'NORMAL'}
                </Badge>
              </div>

              {/* Speaking indicator */}
              {isAnimating && (
                <div className="mt-8 flex items-center justify-center gap-3 text-white/70 animate-pulse">
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
        <div className="lg:w-96 bg-black/40 p-6 border-l border-white/10">
          <h2 className="text-xl font-semibold text-white/70 mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Últimas Chamadas
          </h2>
          
          <div className="space-y-3">
            {lastCalls.length > 0 ? (
              lastCalls.map((ticket, index) => (
                <div
                  key={ticket.id}
                  className={`flex items-center justify-between p-4 rounded-xl transition-all duration-300 ${
                    index === 0 
                      ? 'bg-white/10 border border-white/20' 
                      : 'bg-white/5 border border-white/5'
                  }`}
                  style={{
                    opacity: 1 - (index * 0.15),
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span 
                      className={`text-3xl font-bold ${
                        ticket.ticket_type === 'preferential'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {ticket.display_code}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white/90">
                      Guichê {getCounterNumber(ticket)}
                    </div>
                    <div className="text-sm text-white/50">
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

      {/* Footer with branding */}
      <footer className="absolute bottom-0 left-0 right-0 p-4 bg-black/30 text-center">
        <p className="text-white/30 text-sm">
          Sistema FilaFácil • Gerenciamento Inteligente de Filas
        </p>
      </footer>
    </div>
  );
}
