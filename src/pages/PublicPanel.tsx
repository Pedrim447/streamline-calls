import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVoice } from '@/hooks/useVoice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Maximize, Volume2, VolumeX, Clock, ShieldAlert, Loader2, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type Counter = Database['public']['Tables']['counters']['Row'];
type Organ = Database['public']['Tables']['organs']['Row'];

interface TicketWithCounter extends Ticket {
  counter?: Counter;
  organ?: Organ;
}

export default function PublicPanel() {
  const navigate = useNavigate();
  const { user, profile, roles, isLoading: authLoading } = useAuth();
  
  const [currentTicket, setCurrentTicket] = useState<TicketWithCounter | null>(null);
  const [lastCalls, setLastCalls] = useState<TicketWithCounter[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isAnimating, setIsAnimating] = useState(false);
  const [counters, setCounters] = useState<Record<string, Counter>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const countersRef = useRef<Record<string, Counter>>({});
  const soundEnabledRef = useRef(false);
  const lastCalledAtRef = useRef<Record<string, string>>({});
  const callTicketRef = useRef<(
    code: string, 
    counter: number,
    options: { ticketType?: 'normal' | 'preferential'; clientName?: string | null }
  ) => void>(() => {});
  const { callTicket, playAlertSound } = useVoice();

  // Check if user has access to panel
  const isPainelUser = roles.includes('painel') || roles.includes('admin');
  const unitId = profile?.unit_id;

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Keep refs in sync
  useEffect(() => {
    countersRef.current = counters;
  }, [counters]);

  useEffect(() => {
    callTicketRef.current = callTicket;
  }, [callTicket]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Enable sound with user interaction
  const enableSound = useCallback(() => {
    playAlertSound();
    setSoundEnabled(true);
    console.log('[PublicPanel] Sound enabled by user interaction');
  }, [playAlertSound]);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial data load - only when authenticated and has unit_id
  useEffect(() => {
    if (!user || !isPainelUser || !unitId) return;

    let isMounted = true;
    
    const loadInitialData = async () => {
      console.log('[PublicPanel] Loading initial data for unit:', unitId);
      
      // Fetch counters for the unit
      const { data: counterData, error: counterError } = await supabase
        .from('counters')
        .select('*')
        .eq('unit_id', unitId);
      
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

      // Fetch recent called tickets - from today, any status that has been called
      const today = new Date().toISOString().split('T')[0];
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('unit_id', unitId)
        .not('called_at', 'is', null)
        .gte('called_at', `${today}T00:00:00`)
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
        
        // Initialize called_at refs to prevent re-triggering on load
        ticketData.forEach(ticket => {
          if (ticket.called_at) {
            lastCalledAtRef.current[ticket.id] = ticket.called_at;
          }
        });
      }
      
      if (isMounted) {
        setIsLoading(false);
      }
    };

    loadInitialData();
    
    return () => {
      isMounted = false;
    };
  }, [user, isPainelUser, unitId]);

  // Handle new call - stable function using refs
  const handleNewCall = useCallback(async (updatedTicket: Ticket, isCurrentTicketUpdate: boolean = false) => {
    console.log('[PublicPanel] Handling new call:', updatedTicket.display_code, 'isUpdate:', isCurrentTicketUpdate);
    
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
    
    // If this is a new ticket (not repeat of current), move current to history
    if (!isCurrentTicketUpdate) {
      setCurrentTicket(prev => {
        if (prev && prev.id !== updatedTicket.id) {
          // Move previous current to history
          setLastCalls(prevCalls => {
            const filtered = prevCalls.filter(t => t.id !== prev.id && t.id !== updatedTicket.id);
            return [prev, ...filtered].slice(0, 5);
          });
        }
        return ticketWithCounter;
      });
    } else {
      setCurrentTicket(ticketWithCounter);
    }
    
    // Play voice announcement using ref with ticket type and client first name (voice only, not displayed)
    if (counter && soundEnabledRef.current) {
      console.log('[PublicPanel] Playing voice for counter:', counter.number, 'type:', updatedTicket.ticket_type);
      callTicketRef.current(updatedTicket.display_code, counter.number, {
        ticketType: updatedTicket.ticket_type,
        clientName: updatedTicket.client_name, // Pass name for voice announcement only
      });
    } else if (!soundEnabledRef.current) {
      console.log('[PublicPanel] Sound not enabled - user needs to click to enable');
    }
    
    setTimeout(() => setIsAnimating(false), 2000);
  }, []);

  // Subscribe to real-time updates - only when authenticated with unit_id
  useEffect(() => {
    if (!user || !isPainelUser || !unitId) return;

    console.log('[PublicPanel] Setting up realtime subscription for unit:', unitId);
    
    const channel = supabase
      .channel(`panel-tickets-${unitId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `unit_id=eq.${unitId}`,
        },
        (payload) => {
          console.log('[PublicPanel] Ticket change:', payload.eventType, payload);
          
          if (payload.eventType === 'DELETE') {
            console.log('[PublicPanel] Ticket deleted');
            return;
          }
          
          const updatedTicket = payload.new as Ticket;
          
          // Check if this ticket has been called (has called_at and is called/in_service)
          if ((updatedTicket.status === 'called' || updatedTicket.status === 'in_service') && updatedTicket.called_at) {
            const previousCalledAt = lastCalledAtRef.current[updatedTicket.id];
            
            // Trigger voice if:
            // 1. This ticket wasn't tracked before (new call)
            // 2. OR called_at timestamp changed (repeat call)
            const isNewCall = !previousCalledAt;
            const isRepeatCall = previousCalledAt && previousCalledAt !== updatedTicket.called_at;
            
            // Update ref with new called_at
            lastCalledAtRef.current[updatedTicket.id] = updatedTicket.called_at;
            
            if (isNewCall || isRepeatCall) {
              console.log('[PublicPanel] Triggering call - isNew:', isNewCall, 'isRepeat:', isRepeatCall);
              handleNewCall(updatedTicket, isRepeatCall);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[PublicPanel] Realtime status:', status);
      });

    // Listen for system reset broadcast with unit_id
    const resetChannel = supabase
      .channel(`system-reset-${unitId}`)
      .on('broadcast', { event: 'system_reset' }, () => {
        console.log('[PublicPanel] System reset broadcast received');
        setCurrentTicket(null);
        setLastCalls([]);
        lastCalledAtRef.current = {};
      })
      .subscribe();

    return () => {
      console.log('[PublicPanel] Cleaning up realtime...');
      supabase.removeChannel(channel);
      supabase.removeChannel(resetChannel);
    };
  }, [user, isPainelUser, unitId, handleNewCall]);

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

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-white/70">Carregando...</p>
        </div>
      </div>
    );
  }

  // Access denied
  if (user && !isPainelUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-destructive/20 flex items-center justify-center">
            <ShieldAlert className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-white">Acesso Negado</h2>
          <p className="text-white/70 max-w-md">
            Você não possui permissão para acessar o painel de chamadas. 
            Entre em contato com o administrador.
          </p>
          <Button variant="outline" onClick={() => navigate('/auth')}>
            Voltar ao Login
          </Button>
        </div>
      </div>
    );
  }

  // No unit assigned
  if (user && isPainelUser && !unitId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
            <ShieldAlert className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">Unidade Não Configurada</h2>
          <p className="text-white/70 max-w-md">
            Seu usuário não está associado a nenhuma unidade. 
            Entre em contato com o administrador.
          </p>
          <Button variant="outline" onClick={() => navigate('/auth')}>
            Voltar ao Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Sound Enable Overlay */}
      {!soundEnabled && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="text-center space-y-6">
            <div className="w-24 h-24 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <VolumeX className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-3xl font-bold">Ativar Som do Painel</h2>
            <p className="text-white/70 max-w-md">
              Clique no botão abaixo para ativar as chamadas de voz e alertas sonoros.
            </p>
            <Button 
              size="lg" 
              onClick={enableSound}
              className="text-xl px-8 py-6"
            >
              <Volume2 className="w-6 h-6 mr-3" />
              Ativar Som
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-black/30">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-lg font-medium text-white/80">Sistema de Senhas</span>
          {soundEnabled && (
            <Badge variant="outline" className="text-green-400 border-green-400/50">
              <Volume2 className="w-3 h-3 mr-1" />
              Som Ativo
            </Badge>
          )}
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
                  {currentTicket.ticket_type === 'preferential' ? 'PREFERENCIAL' : 'ATENDIMENTO'}
                </Badge>
              </div>

              {/* Speaking indicator */}
              {isAnimating && soundEnabled && (
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
                  <div className="flex flex-col">
                    <span 
                      className={`text-2xl font-bold ${
                        ticket.ticket_type === 'preferential'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {ticket.display_code}
                    </span>
                    <span className="text-sm text-white/60">
                      {ticket.ticket_type === 'preferential' ? 'Preferencial' : 'Atendimento'}
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
