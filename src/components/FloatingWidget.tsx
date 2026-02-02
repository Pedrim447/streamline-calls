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
  Loader2,
  Settings2
} from 'lucide-react';
import { SkipTicketDialog } from '@/components/dashboard/SkipTicketDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Database } from '@/integrations/supabase/types';

type Counter = Database['public']['Tables']['counters']['Row'];
type Ticket = Database['public']['Tables']['tickets']['Row'];

interface FloatingWidgetProps {
  onClose?: () => void;
  defaultExpanded?: boolean;
}

export function FloatingWidget({ onClose, defaultExpanded = false }: FloatingWidgetProps) {
  const { user, profile } = useAuth();
  const [counter, setCounter] = useState<Counter | null>(null);
  const [availableCounters, setAvailableCounters] = useState<Counter[]>([]);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showCounterSelect, setShowCounterSelect] = useState(false);
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

  // Fetch available counters
  useEffect(() => {
    const fetchCounters = async () => {
      if (!profile?.unit_id) return;

      const { data } = await supabase
        .from('counters')
        .select('*')
        .eq('unit_id', profile.unit_id)
        .eq('is_active', true)
        .order('number', { ascending: true });

      if (data) {
        setAvailableCounters(data);
        
        // Check if user already has a counter assigned
        const myCounter = data.find(c => c.current_attendant_id === user?.id);
        if (myCounter) {
          setCounter(myCounter);
        } else {
          // Show counter selection if no counter assigned
          setShowCounterSelect(true);
        }
      }
    };

    fetchCounters();
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
      
      const newX = Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.x));
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

  const handleSelectCounter = async (counterId: string) => {
    const selectedCounter = availableCounters.find(c => c.id === counterId);
    if (!selectedCounter) return;

    // Assign counter to user
    const { data: updatedCounter } = await supabase
      .from('counters')
      .update({ current_attendant_id: user?.id })
      .eq('id', counterId)
      .select()
      .single();

    if (updatedCounter) {
      setCounter(updatedCounter);
      setShowCounterSelect(false);
    }
  };

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

  // Compact width based on state
  const getWidth = () => {
    if (showCounterSelect) return '200px';
    if (!isExpanded) return '140px';
    return '240px';
  };

  return (
    <>
      <Card 
        className="fixed shadow-xl border border-primary/30 bg-card/95 backdrop-blur-sm z-50 overflow-hidden rounded-xl"
        style={{
          left: position.x,
          top: position.y,
          width: getWidth(),
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* Header - Draggable & Compact */}
        <div 
          className="bg-primary/10 px-2 py-1.5 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-1">
            <GripVertical className="h-3 w-3 text-muted-foreground" />
            {counter && !showCounterSelect && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                G{counter.number}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {counter && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5"
                onClick={() => setShowCounterSelect(true)}
                title="Trocar guichê"
              >
                <Settings2 className="h-2.5 w-2.5" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-5 w-5"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <Minimize2 className="h-2.5 w-2.5" />
              ) : (
                <Maximize2 className="h-2.5 w-2.5" />
              )}
            </Button>
            {onClose && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={onClose}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Counter Selection */}
        {showCounterSelect ? (
          <div className="p-2 space-y-2">
            <p className="text-[10px] text-muted-foreground text-center">Selecione o guichê</p>
            <Select onValueChange={handleSelectCounter}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Guichê..." />
              </SelectTrigger>
              <SelectContent>
                {availableCounters.map((c) => (
                  <SelectItem 
                    key={c.id} 
                    value={c.id}
                    disabled={c.current_attendant_id !== null && c.current_attendant_id !== user?.id}
                  >
                    Guichê {c.number} {c.name ? `- ${c.name}` : ''}
                    {c.current_attendant_id && c.current_attendant_id !== user?.id && ' (ocupado)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {counter && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full h-6 text-[10px]"
                onClick={() => setShowCounterSelect(false)}
              >
                Cancelar
              </Button>
            )}
          </div>
        ) : (
          /* Content */
          <div className="p-2 space-y-2">
            {/* Queue Count - Compact */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                Fila
              </span>
              <Badge variant={waitingCount > 0 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                {waitingCount}
              </Badge>
            </div>

            {/* Current Ticket - Compact */}
            {currentTicket && (
              <div className="text-center py-1">
                <div 
                  className={`inline-block px-2 py-1 rounded ${
                    currentTicket.ticket_type === 'preferential'
                      ? 'bg-ticket-preferential/20 border border-ticket-preferential'
                      : 'bg-ticket-normal/20 border border-ticket-normal'
                  }`}
                >
                  <span 
                    className={`text-lg font-bold ${
                      currentTicket.ticket_type === 'preferential'
                        ? 'text-ticket-preferential'
                        : 'text-ticket-normal'
                    }`}
                  >
                    {currentTicket.display_code}
                  </span>
                </div>
                {isSpeaking && (
                  <div className="flex items-center justify-center gap-1 mt-1 text-primary animate-pulse">
                    <Volume2 className="h-2.5 w-2.5" />
                    <span className="text-[10px]">Chamando...</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions - Compact */}
            {isExpanded && (
              <div className="space-y-1.5">
                {!currentTicket ? (
                  <Button 
                    size="sm"
                    className="w-full h-7 text-xs bg-primary hover:bg-primary/90"
                    onClick={handleCallNext}
                    disabled={isProcessing || !counter}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <PhoneForwarded className="h-3 w-3 mr-1" />
                    )}
                    Chamar
                  </Button>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-1">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={handleRepeatCall}
                        disabled={isProcessing || isSpeaking}
                      >
                        <Volume2 className="h-2.5 w-2.5 mr-0.5" />
                        Repetir
                      </Button>
                      
                      {currentTicket.status === 'called' ? (
                        <Button 
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={handleStartService}
                          disabled={isProcessing}
                        >
                          <Play className="h-2.5 w-2.5 mr-0.5" />
                          Iniciar
                        </Button>
                      ) : (
                        <Button 
                          size="sm"
                          className="h-6 text-[10px] bg-green-600 hover:bg-green-700"
                          onClick={handleCompleteService}
                          disabled={isProcessing}
                        >
                          <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                          OK
                        </Button>
                      )}
                    </div>

                    <Button 
                      variant="destructive" 
                      size="sm"
                      className="w-full h-6 text-[10px]"
                      onClick={() => setIsSkipDialogOpen(true)}
                      disabled={isProcessing}
                    >
                      <SkipForward className="h-2.5 w-2.5 mr-0.5" />
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
                className="w-full h-7 bg-primary hover:bg-primary/90"
                onClick={handleCallNext}
                disabled={isProcessing || !counter}
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <PhoneForwarded className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        )}
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
