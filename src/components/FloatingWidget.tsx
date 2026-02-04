import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTickets } from '@/hooks/useTickets';
import { useVoice } from '@/hooks/useVoice';
import * as localDb from '@/lib/localDatabase';
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
import { CompleteServiceDialog } from '@/components/dashboard/CompleteServiceDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Counter = localDb.Counter;
type Ticket = localDb.Ticket;

interface FloatingWidgetProps {
  onClose?: () => void;
  defaultExpanded?: boolean;
}

export function FloatingWidget({ onClose, defaultExpanded = true }: FloatingWidgetProps) {
  const { user, profile } = useAuth();
  const [counter, setCounter] = useState<Counter | null>(null);
  const [availableCounters, setAvailableCounters] = useState<Counter[]>([]);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
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

      const data = await localDb.getCounters(profile.unit_id);

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

  const handleSelectCounter = async (counterId: string) => {
    const selectedCounter = availableCounters.find(c => c.id === counterId);
    if (!selectedCounter) return;

    // Assign counter to user
    const updatedCounter = await localDb.updateCounter(counterId, { 
      current_attendant_id: user?.id || null 
    });

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

  const handleCompleteService = async (serviceType: string, completionStatus: string) => {
    if (!currentTicket) return;
    setIsProcessing(true);
    await completeService(currentTicket.id, serviceType, completionStatus);
    setCurrentTicket(null);
    setIsCompleteDialogOpen(false);
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

  // Width based on state
  const getWidth = () => {
    if (showCounterSelect) return '280px';
    if (!isExpanded) return '180px';
    return '320px';
  };

  return (
    <>
      <Card 
        className="fixed shadow-2xl border-2 border-primary/20 bg-card z-50 overflow-hidden"
        style={{
          left: position.x,
          top: position.y,
          width: getWidth(),
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
            {counter && !showCounterSelect && (
              <Badge variant="secondary" className="text-xs">
                Guichê {counter.number}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {counter && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => setShowCounterSelect(true)}
                title="Trocar guichê"
              >
                <Settings2 className="h-3 w-3" />
              </Button>
            )}
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

        {/* Counter Selection */}
        {showCounterSelect ? (
          <div className="p-3 space-y-3">
            <p className="text-xs text-muted-foreground text-center">Selecione o guichê de atendimento</p>
            <Select onValueChange={handleSelectCounter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Escolha um guichê..." />
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
                className="w-full"
                onClick={() => setShowCounterSelect(false)}
              >
                Cancelar
              </Button>
            )}
          </div>
        ) : (
          /* Content */
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
                      ? 'bg-amber-500/20 border border-amber-500'
                      : 'bg-emerald-500/20 border border-emerald-500'
                  }`}
                >
                  <span 
                    className={`text-2xl font-bold ${
                      currentTicket.ticket_type === 'preferential'
                        ? 'text-amber-500'
                        : 'text-emerald-500'
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
                          onClick={() => setIsCompleteDialogOpen(true)}
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
        )}
      </Card>

      {/* Skip Dialog */}
      <SkipTicketDialog 
        open={isSkipDialogOpen}
        onOpenChange={setIsSkipDialogOpen}
        onConfirm={handleSkipTicket}
        ticketCode={currentTicket?.display_code}
      />

      {/* Complete Service Dialog */}
      <CompleteServiceDialog
        open={isCompleteDialogOpen}
        onOpenChange={setIsCompleteDialogOpen}
        onConfirm={handleCompleteService}
        ticketCode={currentTicket?.display_code}
        isProcessing={isProcessing}
      />
    </>
  );
}
