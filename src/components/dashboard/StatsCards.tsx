import { Card, CardContent } from '@/components/ui/card';
import { Users, Clock, Ticket as TicketIcon, CheckCircle } from 'lucide-react';
import type { Ticket } from '@/lib/localDatabase';

interface StatsCardsProps {
  waitingCount: number;
  currentTicket: Ticket | null;
}

export function StatsCards({ waitingCount, currentTicket }: StatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Na Fila</p>
              <p className="text-2xl font-bold">{waitingCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <TicketIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Senha Atual</p>
              <p className="text-2xl font-bold">
                {currentTicket?.display_code || '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-bold">
                {currentTicket 
                  ? currentTicket.status === 'in_service' 
                    ? 'Atendendo' 
                    : 'Chamado'
                  : 'Disponível'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tipo</p>
              <p className="text-lg font-bold">
                {currentTicket?.ticket_type === 'preferential' 
                  ? 'Preferencial' 
                  : currentTicket 
                    ? 'Normal'
                    : '-'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
