import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTickets } from '@/hooks/useTickets';
import { useVoice } from '@/hooks/useVoice';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Phone, 
  PhoneForwarded, 
  Play, 
  CheckCircle, 
  SkipForward, 
  LogOut,
  Volume2,
  Users,
  Clock,
  RefreshCw,
  Shield,
  ExternalLink,
  Monitor
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TicketQueue } from '@/components/dashboard/TicketQueue';
import { CurrentTicket } from '@/components/dashboard/CurrentTicket';
import { SkipTicketDialog } from '@/components/dashboard/SkipTicketDialog';
import { StatsCards } from '@/components/dashboard/StatsCards';
import type { Database } from '@/integrations/supabase/types';

type Counter = Database['public']['Tables']['counters']['Row'];
type Ticket = Database['public']['Tables']['tickets']['Row'];

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading, isAdmin, signOut } = useAuth();
  const [counter, setCounter] = useState<Counter | null>(null);
  const [availableCounters, setAvailableCounters] = useState<Counter[]>([]);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSelectingCounter, setIsSelectingCounter] = useState(false);

  const { 
    tickets, 
    isLoading: ticketsLoading,
    callNextTicket,
    repeatCall,
    startService,
    completeService,
    skipTicket,
  } = useTickets({ 
    status: ['waiting', 'called', 'in_service'],
    realtime: true 
  });

  const { callTicket, repeatCallSoft, isSpeaking } = useVoice();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Fetch available counters and check if user already has one assigned
  useEffect(() => {
    const fetchCounters = async () => {
      if (!user?.id) return;

      const unitId = profile?.unit_id || DEFAULT_UNIT_ID;

      // Check if user already has a counter assigned
      const { data: myCounter } = await supabase
        .from('counters')
        .select('*')
        .eq('current_attendant_id', user.id)
        .eq('is_active', true)
        .single();

      if (myCounter) {
        setCounter(myCounter);
        setIsSelectingCounter(false);
        return;
      }

      // Fetch all active counters for this unit
      const { data: counters } = await supabase
        .from('counters')
        .select('*')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .order('number', { ascending: true });

      if (counters) {
        // Filter to only available counters (no attendant assigned)
        const available = counters.filter(c => !c.current_attendant_id);
        setAvailableCounters(available);
        setIsSelectingCounter(true);
      }
    };

    fetchCounters();
  }, [profile?.unit_id, user?.id]);

  const handleSelectCounter = async (counterId: string) => {
    if (!user?.id) return;
    setIsProcessing(true);

    // Assign counter to this user
    const { data: updatedCounter, error } = await supabase
      .from('counters')
      .update({ current_attendant_id: user.id })
      .eq('id', counterId)
      .select()
      .single();

    if (updatedCounter) {
      setCounter(updatedCounter);
      setIsSelectingCounter(false);
    }

    setIsProcessing(false);
  };

  const handleReleaseCounter = async () => {
    if (!counter) return;
    setIsProcessing(true);

    await supabase
      .from('counters')
      .update({ current_attendant_id: null })
      .eq('id', counter.id);

    setCounter(null);
    setIsSelectingCounter(true);
    
    // Refetch available counters
    const unitId = profile?.unit_id || DEFAULT_UNIT_ID;
    const { data: counters } = await supabase
      .from('counters')
      .select('*')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .is('current_attendant_id', null)
      .order('number', { ascending: true });

    if (counters) {
      setAvailableCounters(counters);
    }

    setIsProcessing(false);
  };

  // Track current ticket (called or in_service by this attendant)
  useEffect(() => {
    const myTicket = tickets.find(
      t => t.attendant_id === user?.id && ['called', 'in_service'].includes(t.status)
    );
    setCurrentTicket(myTicket || null);
  }, [tickets, user?.id]);

  const handleCallNext = async () => {
    if (!counter) return;
    setIsProcessing(true);
    
    const ticket = await callNextTicket(counter.id);
    
    if (ticket && counter) {
      callTicket(ticket.display_code, counter.number);
    }
    
    setIsProcessing(false);
  };

  const handleRepeatCall = async () => {
    if (!currentTicket || !counter) return;
    setIsProcessing(true);
    
    await repeatCall(currentTicket.id);
    // Use soft voice and gentle chime for repeat calls
    repeatCallSoft(currentTicket.display_code, counter.number);
    
    setIsProcessing(false);
  };

  const handleStartService = async () => {
    if (!currentTicket) return;
    setIsProcessing(true);
    
    await startService(currentTicket.id);
    
    setIsProcessing(false);
  };

  const handleCompleteService = async () => {
    if (!currentTicket) return;
    setIsProcessing(true);
    
    await completeService(currentTicket.id);
    setCurrentTicket(null);
    
    setIsProcessing(false);
  };

  const handleSkipTicket = async (reason: string) => {
    if (!currentTicket) return;
    setIsProcessing(true);
    
    await skipTicket(currentTicket.id, reason);
    setCurrentTicket(null);
    setIsSkipDialogOpen(false);
    
    setIsProcessing(false);
  };

  const handleLogout = async () => {
    // Release the counter before logging out
    if (counter) {
      await supabase
        .from('counters')
        .update({ current_attendant_id: null })
        .eq('id', counter.id);
    }
    
    await signOut();
    navigate('/auth');
  };

  const openWidgetPopup = () => {
    const width = 360;
    const height = 500;
    const left = window.screen.width - width - 20;
    const top = 20;
    
    window.open(
      '/widget',
      'FilaFacilWidget',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const waitingTickets = tickets.filter(t => t.status === 'waiting');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-foreground">
                Painel do Atendente
              </h1>
              {counter && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    Guichê {counter.number}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleReleaseCounter}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={isProcessing || currentTicket !== null}
                    title="Trocar guichê"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {profile?.full_name}
              </span>
              <Button variant="outline" size="sm" onClick={openWidgetPopup}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Widget
              </Button>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm">
                    <Shield className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {isSelectingCounter ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Selecione seu Guichê
              </CardTitle>
            </CardHeader>
            <CardContent>
              {availableCounters.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum guichê disponível no momento. Aguarde ou contate o administrador.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availableCounters.map((c) => (
                    <Button
                      key={c.id}
                      variant="outline"
                      className="h-20 flex flex-col gap-1"
                      onClick={() => handleSelectCounter(c.id)}
                      disabled={isProcessing}
                    >
                      <span className="text-2xl font-bold">{c.number}</span>
                      <span className="text-sm text-muted-foreground">
                        {c.name || `Guichê ${c.number}`}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : !counter ? (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-center text-destructive">
                Nenhum guichê disponível. Entre em contato com o administrador.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats */}
            <StatsCards 
              waitingCount={waitingTickets.length}
              currentTicket={currentTicket}
            />

            {/* Main Controls */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Current Ticket Panel */}
              <CurrentTicket 
                ticket={currentTicket}
                counter={counter}
                isSpeaking={isSpeaking}
                isProcessing={isProcessing}
                onRepeatCall={handleRepeatCall}
                onStartService={handleStartService}
                onCompleteService={handleCompleteService}
                onSkipTicket={() => setIsSkipDialogOpen(true)}
              />

              {/* Action Panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Ações
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    size="lg" 
                    className="w-full h-16 text-lg bg-primary hover:bg-primary/90"
                    onClick={handleCallNext}
                    disabled={isProcessing || currentTicket !== null}
                  >
                    {isProcessing ? (
                      <RefreshCw className="h-6 w-6 mr-2 animate-spin" />
                    ) : (
                      <PhoneForwarded className="h-6 w-6 mr-2" />
                    )}
                    Chamar Próxima Senha
                  </Button>

                  {currentTicket && (
                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        variant="outline" 
                        onClick={handleRepeatCall}
                        disabled={isProcessing || isSpeaking}
                      >
                        <Volume2 className="h-4 w-4 mr-2" />
                        Repetir
                      </Button>
                      
                      {currentTicket.status === 'called' ? (
                        <Button 
                          variant="secondary"
                          onClick={handleStartService}
                          disabled={isProcessing}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Iniciar
                        </Button>
                      ) : (
                        <Button 
                          variant="default"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={handleCompleteService}
                          disabled={isProcessing}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Finalizar
                        </Button>
                      )}
                    </div>
                  )}

                  {currentTicket && (
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={() => setIsSkipDialogOpen(true)}
                      disabled={isProcessing}
                    >
                      <SkipForward className="h-4 w-4 mr-2" />
                      Pular Senha
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Queue */}
            <TicketQueue 
              tickets={waitingTickets} 
              isLoading={ticketsLoading}
            />
          </>
        )}
      </main>

      {/* Skip Dialog */}
      <SkipTicketDialog 
        open={isSkipDialogOpen}
        onOpenChange={setIsSkipDialogOpen}
        onConfirm={handleSkipTicket}
        ticketCode={currentTicket?.display_code}
      />
    </div>
  );
}
