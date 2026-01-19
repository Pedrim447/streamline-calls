import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Ticket as TicketIcon, 
  Volume2, 
  Play, 
  CheckCircle, 
  SkipForward,
  Clock,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type Counter = Database['public']['Tables']['counters']['Row'];

interface CurrentTicketProps {
  ticket: Ticket | null;
  counter: Counter;
  isSpeaking: boolean;
  isProcessing: boolean;
  onRepeatCall: () => void;
  onStartService: () => void;
  onCompleteService: () => void;
  onSkipTicket: () => void;
}

export function CurrentTicket({
  ticket,
  counter,
  isSpeaking,
  isProcessing,
  onRepeatCall,
  onStartService,
  onCompleteService,
  onSkipTicket,
}: CurrentTicketProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'called':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Chamada</Badge>;
      case 'in_service':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Em Atendimento</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card className={ticket ? 'border-primary shadow-lg' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TicketIcon className="h-5 w-5" />
          Senha Atual
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!ticket ? (
          <div className="text-center py-8 text-muted-foreground">
            <TicketIcon className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Nenhuma senha em atendimento</p>
            <p className="text-sm mt-1">Clique em "Chamar Próxima Senha" para começar</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Ticket Display */}
            <div className="text-center">
              <div 
                className={`inline-block px-8 py-4 rounded-xl ${
                  ticket.ticket_type === 'preferential'
                    ? 'bg-ticket-preferential/20 border-2 border-ticket-preferential'
                    : 'bg-ticket-normal/20 border-2 border-ticket-normal'
                }`}
              >
                <span 
                  className={`text-5xl font-bold tracking-wider ${
                    ticket.ticket_type === 'preferential'
                      ? 'text-ticket-preferential'
                      : 'text-ticket-normal'
                  }`}
                >
                  {ticket.display_code}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-center gap-3">
                {getStatusBadge(ticket.status)}
                <Badge variant="outline">
                  Guichê {counter.number}
                </Badge>
              </div>
            </div>

            {/* Time Info */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {ticket.called_at
                  ? `Chamada há ${formatDistanceToNow(new Date(ticket.called_at), { locale: ptBR })}`
                  : `Criada há ${formatDistanceToNow(new Date(ticket.created_at), { locale: ptBR })}`
                }
              </span>
            </div>

            {/* Speaking Indicator */}
            {isSpeaking && (
              <div className="flex items-center justify-center gap-2 text-primary animate-pulse">
                <Volume2 className="h-5 w-5" />
                <span className="text-sm font-medium">Chamando...</span>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                onClick={onRepeatCall}
                disabled={isProcessing || isSpeaking}
                className="h-12"
              >
                {isSpeaking ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Volume2 className="h-4 w-4 mr-2" />
                )}
                Repetir Chamada
              </Button>
              
              {ticket.status === 'called' ? (
                <Button 
                  variant="secondary"
                  onClick={onStartService}
                  disabled={isProcessing}
                  className="h-12"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Iniciar Atendimento
                </Button>
              ) : (
                <Button 
                  className="h-12 bg-green-600 hover:bg-green-700"
                  onClick={onCompleteService}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Finalizar
                </Button>
              )}
            </div>

            <Button 
              variant="destructive" 
              className="w-full"
              onClick={onSkipTicket}
              disabled={isProcessing}
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Pular Senha (com justificativa)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
