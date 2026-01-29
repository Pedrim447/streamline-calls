import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];

interface TicketQueueProps {
  tickets: Ticket[];
  isLoading: boolean;
}

export function TicketQueue({ tickets, isLoading }: TicketQueueProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Fila de Espera
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Fila de Espera
          <Badge variant="secondary" className="ml-2">
            {tickets.length} {tickets.length === 1 ? 'senha' : 'senhas'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <div className="text-center py-8">
            <div className="bg-amber-100 dark:bg-amber-900/30 rounded-lg p-6 border border-amber-200 dark:border-amber-800">
              <Users className="h-12 w-12 mx-auto mb-3 text-amber-600 dark:text-amber-400" />
              <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                Fila Vazia - 0 pessoas
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Aguarde a recepção entregar novas senhas para chamar
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {tickets.map((ticket, index) => (
                <div
                  key={ticket.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    ticket.ticket_type === 'preferential'
                      ? 'bg-ticket-preferential/10 border-ticket-preferential/30'
                      : 'bg-ticket-normal/10 border-ticket-normal/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground font-medium w-6">
                      #{index + 1}
                    </span>
                    <div>
                      <span 
                        className={`text-lg font-bold ${
                          ticket.ticket_type === 'preferential'
                            ? 'text-ticket-preferential'
                            : 'text-ticket-normal'
                        }`}
                      >
                        {ticket.display_code}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`ml-2 text-xs ${
                          ticket.ticket_type === 'preferential'
                            ? 'border-ticket-preferential text-ticket-preferential'
                            : 'border-ticket-normal text-ticket-normal'
                        }`}
                      >
                        {ticket.ticket_type === 'preferential' ? 'Preferencial' : 'Normal'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      {formatDistanceToNow(new Date(ticket.created_at), {
                        addSuffix: false,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
