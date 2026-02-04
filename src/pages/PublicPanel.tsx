import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as localDb from '@/lib/localDatabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVoice } from '@/hooks/useVoice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Maximize, Volume2, VolumeX, Clock, ShieldAlert, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Ticket = localDb.Ticket;
type Counter = localDb.Counter;

interface TicketWithCounter extends Ticket {
  counter?: Counter;
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
  const callTicketRef = useRef<(
    code: string, 
    counter: number,
    options: { ticketType?: 'normal' | 'preferential'; clientName?: string | null }
  ) => void>(() => {});
  const { callTicket, playAlertSound } = useVoice();

  const isPainelUser = roles.includes('painel') || roles.includes('admin');
  const unitId = profile?.unit_id || 'a0000000-0000-0000-0000-000000000001';

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    countersRef.current = counters;
  }, [counters]);

  useEffect(() => {
    callTicketRef.current = callTicket;
  }, [callTicket]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const enableSound = useCallback(() => {
    playAlertSound();
    setSoundEnabled(true);
  }, [playAlertSound]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial data load
  useEffect(() => {
    if (!user || !isPainelUser || !unitId) return;

    const loadInitialData = async () => {
      const counterData = await localDb.getCounters(unitId);
      
      let counterMap: Record<string, Counter> = {};
      if (counterData) {
        counterData.forEach(c => { counterMap[c.id] = c; });
        setCounters(counterMap);
        countersRef.current = counterMap;
      }

      const ticketData = await localDb.getCalledTicketsToday(unitId, 6);

      if (ticketData && ticketData.length > 0) {
        const ticketsWithCounters = ticketData.map(ticket => ({
          ...ticket,
          counter: ticket.counter_id ? counterMap[ticket.counter_id] : undefined,
        }));
        
        setCurrentTicket(ticketsWithCounters[0]);
        setLastCalls(ticketsWithCounters.slice(1, 6));
      }
      
      setIsLoading(false);
    };

    loadInitialData();
  }, [user, isPainelUser, unitId]);

  // Handle new call
  const handleNewCall = useCallback(async (updatedTicket: Ticket) => {
    let counter = updatedTicket.counter_id ? countersRef.current[updatedTicket.counter_id] : undefined;
    
    if (!counter && updatedTicket.counter_id) {
      counter = await localDb.getCounter(updatedTicket.counter_id) || undefined;
      if (counter) {
        countersRef.current[counter.id] = counter;
        setCounters(prev => ({ ...prev, [counter!.id]: counter! }));
      }
    }
    
    const ticketWithCounter: TicketWithCounter = {
      ...updatedTicket,
      counter,
    };
    
    setIsAnimating(true);
    
    setCurrentTicket(prev => {
      if (prev && prev.id !== updatedTicket.id) {
        setLastCalls(prevCalls => {
          const filtered = prevCalls.filter(t => t.id !== prev.id && t.id !== updatedTicket.id);
          return [prev, ...filtered].slice(0, 5);
        });
      }
      return ticketWithCounter;
    });
    
    if (counter && soundEnabledRef.current) {
      callTicketRef.current(updatedTicket.display_code, counter.number, {
        ticketType: updatedTicket.ticket_type,
        clientName: updatedTicket.client_name,
      });
    }
    
    setTimeout(() => setIsAnimating(false), 2000);
  }, []);

  // Subscribe to local events
  useEffect(() => {
    if (!user || !isPainelUser || !unitId) return;

    const unsubscribeCalled = localDb.subscribeToEvent('ticket_called', (ticket) => {
      if (ticket.unit_id === unitId) {
        handleNewCall(ticket);
      }
    });

    const unsubscribeReset = localDb.subscribeToEvent('system_reset', () => {
      setCurrentTicket(null);
      setLastCalls([]);
    });

    return () => {
      unsubscribeCalled();
      unsubscribeReset();
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (user && !isPainelUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center space-y-6 p-8">
          <ShieldAlert className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold text-white">Acesso Negado</h2>
          <Button variant="outline" onClick={() => navigate('/auth')}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {!soundEnabled && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="text-center space-y-6">
            <VolumeX className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-3xl font-bold">Ativar Som</h2>
            <Button size="lg" onClick={enableSound}>
              <Volume2 className="w-6 h-6 mr-3" />
              Ativar Som
            </Button>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between px-8 py-4 bg-black/30">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-lg font-medium text-white/80">Sistema Offline</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-2xl font-mono font-bold">{format(currentTime, 'HH:mm:ss')}</span>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg hover:bg-white/10">
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        <div className="flex-1 flex items-center justify-center p-8">
          {currentTicket ? (
            <div className={`text-center transition-all duration-500 ${isAnimating ? 'scale-110' : 'scale-100'}`}>
              <div className={`text-[12rem] md:text-[16rem] font-black tracking-wider leading-none ${
                currentTicket.ticket_type === 'preferential' ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {currentTicket.display_code}
              </div>
              <div className="mt-8 flex items-center justify-center gap-4">
                <span className="text-4xl md:text-6xl text-white/60">Guichê</span>
                <span className="text-6xl md:text-8xl font-black text-white">{getCounterNumber(currentTicket)}</span>
              </div>
              <Badge className={`mt-6 text-2xl px-6 py-2 ${
                currentTicket.ticket_type === 'preferential' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
              }`} variant="outline">
                {currentTicket.ticket_type === 'preferential' ? 'PREFERENCIAL' : 'ATENDIMENTO'}
              </Badge>
            </div>
          ) : (
            <div className="text-center text-white/50">
              <Clock className="h-24 w-24 mx-auto mb-4 opacity-30" />
              <p className="text-2xl">Aguardando chamadas...</p>
            </div>
          )}
        </div>

        <div className="w-full lg:w-96 bg-black/40 p-6">
          <h3 className="text-xl font-semibold mb-4 text-white/70">Últimas Chamadas</h3>
          <div className="space-y-3">
            {lastCalls.map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                <span className={`text-2xl font-bold ${
                  ticket.ticket_type === 'preferential' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {ticket.display_code}
                </span>
                <span className="text-xl text-white/60">Guichê {getCounterNumber(ticket)}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
