import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Search, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

const ACTION_LABELS: Record<string, string> = {
  'ticket_called': 'Senha Chamada',
  'ticket_repeat_call': 'Chamada Repetida',
  'ticket_skipped': 'Senha Pulada',
  'ticket_completed': 'Atendimento Finalizado',
  'ticket_cancelled': 'Senha Cancelada',
  'user_login': 'Login',
  'user_logout': 'Logout',
};

const ACTION_COLORS: Record<string, string> = {
  'ticket_called': 'bg-blue-500',
  'ticket_repeat_call': 'bg-yellow-500',
  'ticket_skipped': 'bg-red-500',
  'ticket_completed': 'bg-green-500',
  'ticket_cancelled': 'bg-gray-500',
  'user_login': 'bg-purple-500',
  'user_logout': 'bg-gray-400',
};

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchLogs = async () => {
    setIsLoading(true);

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (actionFilter !== 'all') {
      query = query.eq('action', actionFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching logs:', error);
    } else {
      setLogs(data || []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const details = log.details as any;
    return (
      log.action.toLowerCase().includes(search) ||
      log.entity_id?.toLowerCase().includes(search) ||
      details?.display_code?.toLowerCase().includes(search) ||
      details?.skip_reason?.toLowerCase().includes(search)
    );
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Logs de Auditoria
            </CardTitle>
            <CardDescription>
              Histórico de todas as ações realizadas no sistema
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ticket_called">Chamadas</SelectItem>
                <SelectItem value="ticket_repeat_call">Repetições</SelectItem>
                <SelectItem value="ticket_skipped">Puladas</SelectItem>
                <SelectItem value="ticket_completed">Finalizadas</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="icon" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum registro encontrado</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredLogs.map((log) => {
                const details = log.details as any;
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${ACTION_COLORS[log.action] || 'bg-gray-400'}`} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                        {details?.display_code && (
                          <span className="font-mono font-bold text-primary">
                            {details.display_code}
                          </span>
                        )}
                        {details?.counter_id && (
                          <span className="text-sm text-muted-foreground">
                            Guichê {details.counter_id.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                      
                      {details?.skip_reason && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          Motivo: {details.skip_reason}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-sm text-muted-foreground whitespace-nowrap">
                      <div>
                        {format(new Date(log.created_at), 'HH:mm:ss')}
                      </div>
                      <div className="text-xs">
                        {format(new Date(log.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
