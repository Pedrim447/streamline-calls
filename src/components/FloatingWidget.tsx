import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTickets } from '@/hooks/useTickets';
import { useVoice } from '@/hooks/useVoice';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
  PhoneForwarded, 
  Play, 
  CheckCircle, 
  SkipForward, 
  Volume2,
  X,
  Minimize2,
  Maximize2,
  GripVertical,
  Users,
  Loader2
} from 'lucide-react';
import { SkipTicketDialog } from '@/components/dashboard/SkipTicketDialog';
import type { Database } from '@/integrations/supabase/types';

type Counter = Database['public']['Tables']['counters']['Row'];
type Ticket = Database['public']['Tables']['tickets']['Row'];

interface FloatingWidgetProps {
  onClose?: () => void;
  defaultExpanded?: boolean;
}

export function FloatingWidget({ onClose, defaultExpanded = true }: FloatingWidgetProps) {
  const { user, profile } = useAuth();
  const [counter, setCounter] = useState<Counter | null>(null);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const { 
    tickets, 
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

  // Fetch counter for the attendant
  useEffect(() => {
    const fetchCounter = async () => {
      if (!profile?.unit_id || !user?.id) return;

      const { data: existingCounter } = await supabase
        .from('counters')
        .select('*')
        .eq('current_attendant_id', user.id)
        .eq('unit_id', profile.unit_id)
        .eq('is_active', true)
        .single();

      if (existingCounter) {
        setCounter(existingCounter);
        return;
      }

      const { data: availableCounter } = await supabase
        .from('counters')
        .select('*')
        .eq('unit_id', profile.unit_id)
        .eq('is_active', true)
        .is('current_attendant_id', null)
        .order('number', { ascending: true })
        .limit(1)
        .single();

      if (availableCounter) {
        const { data: updatedCounter } = await supabase
          .from('counters')
          .update({ current_attendant_id: user.id })
          .eq('id', availableCounter.id)
          .select()
          .single();

        if (updatedCounter) {
          setCounter(updatedCounter);
        }
      }
    };

    fetchCounter();
  }, [profile?.unit_id, user?.id]);

  // Track current ticket
  useEffect(() => {
    const myTicket = tickets.find(
      t => t.attendant_id === user?.id && ['called', 'in_service'].includes(t.status)
    );
    setCurrentTicket(myTicket || null);
  }, [tickets, user?.id]);

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

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

  const waitingCount = tickets.filter(t => t.status === 'waiting').length;

  if (!user || !profile) {
    return null;
  }

  return (
    <>
      <Card 
        className="fixed shadow-2xl border-2 border-primary/20 bg-card z-50 overflow-hidden"
        style={{
          left: position.x,
          top: position.y,
          width: isExpanded ? '320px' : '180px',
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* Header - Draggable */}
        <div 
          className="bg-primary/10 px-3 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            {counter && (
              <Badge variant="secondary" className="text-xs">
                Guichê {counter.number}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </Button>
            {onClose && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={onClose}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Queue Count */}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" />
              Fila
            </span>
            <Badge variant={waitingCount > 0 ? "default" : "secondary"}>
              {waitingCount} aguardando
            </Badge>
          </div>

          {/* Current Ticket */}
          {currentTicket && (
            <div className="text-center py-2">
              <div 
                className={`inline-block px-4 py-2 rounded-lg ${
                  currentTicket.ticket_type === 'preferential'
                    ? 'bg-ticket-preferential/20 border border-ticket-preferential'
                    : 'bg-ticket-normal/20 border border-ticket-normal'
                }`}
              >
                <span 
                  className={`text-2xl font-bold ${
                    currentTicket.ticket_type === 'preferential'
                      ? 'text-ticket-preferential'
                      : 'text-ticket-normal'
                  }`}
                >
                  {currentTicket.display_code}
                </span>
              </div>
              <div className="mt-2">
                <Badge 
                  variant={currentTicket.status === 'in_service' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {currentTicket.status === 'called' ? 'Chamada' : 'Em Atendimento'}
                </Badge>
              </div>
              {isSpeaking && (
                <div className="flex items-center justify-center gap-1 mt-2 text-primary animate-pulse">
                  <Volume2 className="h-3 w-3" />
                  <span className="text-xs">Chamando...</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {isExpanded && (
            <div className="space-y-2">
              {!currentTicket ? (
                <Button 
                  size="sm"
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={handleCallNext}
                  disabled={isProcessing || !counter}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PhoneForwarded className="h-4 w-4 mr-2" />
                  )}
                  Chamar Próxima
                </Button>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleRepeatCall}
                      disabled={isProcessing || isSpeaking}
                    >
                      <Volume2 className="h-3 w-3 mr-1" />
                      Repetir
                    </Button>
                    
                    {currentTicket.status === 'called' ? (
                      <Button 
                        variant="secondary"
                        size="sm"
                        onClick={handleStartService}
                        disabled={isProcessing}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Iniciar
                      </Button>
                    ) : (
                      <Button 
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={handleCompleteService}
                        disabled={isProcessing}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Finalizar
                      </Button>
                    )}
                  </div>

                  <Button 
                    variant="destructive" 
                    size="sm"
                    className="w-full"
                    onClick={() => setIsSkipDialogOpen(true)}
                    disabled={isProcessing}
                  >
                    <SkipForward className="h-3 w-3 mr-1" />
                    Pular
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Minimized Quick Action */}
          {!isExpanded && !currentTicket && (
            <Button 
              size="sm"
              className="w-full bg-primary hover:bg-primary/90"
              onClick={handleCallNext}
              disabled={isProcessing || !counter}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneForwarded className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </Card>

      {/* Skip Dialog */}
      <SkipTicketDialog 
        open={isSkipDialogOpen}
        onOpenChange={setIsSkipDialogOpen}
        onConfirm={handleSkipTicket}
        ticketCode={currentTicket?.display_code}
      />
    </>
  );
}
