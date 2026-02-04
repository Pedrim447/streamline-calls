import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Ticket as TicketIcon, 
  Play, 
  CheckCircle, 
  SkipForward,
  Clock,
  Loader2,
  Users,
  ArrowRight,
  Volume2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type Counter = Database['public']['Tables']['counters']['Row'];

interface CurrentTicketProps {
  ticket: Ticket | null;
  counter: Counter;
  isProcessing: boolean;
  cooldownRemaining: number;
  nextTickets: Ticket[];
  onRepeatCall: () => void;
  onStartService: () => void;
  onCompleteService: () => void;
  onSkipTicket: () => void;
}

export function CurrentTicket({
  ticket,
  counter,
  isProcessing,
  cooldownRemaining,
  nextTickets,
  onRepeatCall,
  onStartService,
  onCompleteService,
  onSkipTicket,
}: CurrentTicketProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'called':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-lg px-4 py-1">Chamada</Badge>;
      case 'in_service':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-lg px-4 py-1">Em Atendimento</Badge>;
      default:
        return <Badge variant="secondary" className="text-lg px-4 py-1">{status}</Badge>;
    }
  };

  const isCooldownActive = cooldownRemaining > 0;

  return (
    <Card className={ticket ? 'border-primary shadow-xl' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TicketIcon className="h-6 w-6" />
            Senha Atual
          </div>
          {isCooldownActive && (
            <Badge variant="outline" className="animate-pulse">
              <Clock className="h-3 w-3 mr-1" />
              Aguarde {cooldownRemaining}s
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!ticket ? (
          <div className="text-center py-12 text-muted-foreground">
            <TicketIcon className="h-24 w-24 mx-auto mb-6 opacity-30" />
            <p className="text-xl font-medium">Nenhuma senha em atendimento</p>
            <p className="text-sm mt-2">Clique em "Chamar Próxima Senha" para começar</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Large Ticket Display */}
            <div className="text-center py-6">
              <div 
                className={`inline-block px-12 py-8 rounded-2xl shadow-lg transition-all duration-300 ${
                  ticket.ticket_type === 'preferential'
                    ? 'bg-gradient-to-br from-red-500/20 to-red-600/30 border-3 border-red-500'
                    : 'bg-gradient-to-br from-blue-500/20 to-blue-600/30 border-3 border-blue-500'
                }`}
              >
                <span 
                  className={`text-7xl font-black tracking-wider ${
                    ticket.ticket_type === 'preferential'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {ticket.display_code}
                </span>
                {ticket.client_name && (
                  <p className="mt-4 text-lg font-medium text-muted-foreground">
                    {ticket.client_name}
                  </p>
                )}
              </div>
              
              <div className="mt-6 flex items-center justify-center gap-4">
                {getStatusBadge(ticket.status)}
                <Badge variant="outline" className="text-lg px-4 py-1">
                  Guichê {counter.number}
                </Badge>
                <Badge 
                  variant={ticket.ticket_type === 'preferential' ? 'destructive' : 'secondary'}
                  className="text-lg px-4 py-1"
                >
                  {ticket.ticket_type === 'preferential' ? 'Preferencial' : 'Normal'}
                </Badge>
              </div>
            </div>

            {/* Time Info */}
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span className="text-lg">
                {ticket.called_at
                  ? `Chamada há ${formatDistanceToNow(new Date(ticket.called_at), { locale: ptBR })}`
                  : `Criada há ${formatDistanceToNow(new Date(ticket.created_at), { locale: ptBR })}`
                }
              </span>
            </div>

            {/* Cooldown Progress */}
            {isCooldownActive && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Aguarde para chamar novamente</span>
                  <span>{cooldownRemaining}s</span>
                </div>
                <Progress value={(5 - cooldownRemaining) * 20} className="h-2" />
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                onClick={onRepeatCall}
                disabled={isProcessing || isCooldownActive}
                className="h-14 text-base"
              >
                <Volume2 className="h-5 w-5 mr-2" />
                {isCooldownActive ? `Aguarde ${cooldownRemaining}s` : 'Repetir Chamada'}
              </Button>
              
              {ticket.status === 'called' ? (
                <Button 
                  variant="secondary"
                  onClick={onStartService}
                  disabled={isProcessing}
                  className="h-14 text-base"
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-5 w-5 mr-2" />
                  )}
                  Iniciar Atendimento
                </Button>
              ) : (
                <Button 
                  className="h-14 text-base bg-green-600 hover:bg-green-700"
                  onClick={onCompleteService}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5 mr-2" />
                  )}
                  Finalizar
                </Button>
              )}
            </div>

            <Button 
              variant="destructive" 
              className="w-full h-12"
              onClick={onSkipTicket}
              disabled={isProcessing}
            >
              <SkipForward className="h-5 w-5 mr-2" />
              Pular Senha (com justificativa)
            </Button>
          </div>
        )}

        {/* Next Tickets Preview */}
        {nextTickets.length > 0 && (
          <div className="mt-8 pt-6 border-t">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-muted-foreground">Próximas na Fila</h3>
              <Badge variant="outline" className="ml-auto">
                {nextTickets.length} aguardando
              </Badge>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {nextTickets.slice(0, 5).map((t, index) => (
                <div 
                  key={t.id}
                  className={`flex-shrink-0 px-4 py-3 rounded-lg border-2 transition-all ${
                    t.ticket_type === 'preferential'
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                      : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                  } ${index === 0 ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {index === 0 && <ArrowRight className="h-4 w-4 text-primary animate-pulse" />}
                    <span 
                      className={`text-xl font-bold ${
                        t.ticket_type === 'preferential'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {t.display_code}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.ticket_type === 'preferential' ? 'Preferencial' : 'Normal'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
