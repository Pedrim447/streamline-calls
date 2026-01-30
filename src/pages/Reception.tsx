import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  Ticket, 
  LogOut,
  Printer,
  UserPlus,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type TicketType = Database['public']['Enums']['ticket_type'];

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

export default function Reception() {
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  
  // Form state
  const [clientName, setClientName] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('normal');
  
  

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Fetch tickets
  useEffect(() => {
    const fetchTickets = async () => {
      if (!user?.id) return;
      
      const unitId = profile?.unit_id || DEFAULT_UNIT_ID;
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('unit_id', unitId)
        .gte('created_at', `${today}T00:00:00`)
        .order('created_at', { ascending: false });

      if (data) {
        setTickets(data);
      }
      setIsLoading(false);
    };

    fetchTickets();

    // Subscribe to realtime updates with broadcast support
    const unitId = profile?.unit_id || DEFAULT_UNIT_ID;
    const channel = supabase
      .channel(`reception-${unitId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `unit_id=eq.${unitId}`,
        },
        () => {
          console.log('[Reception] Realtime ticket change');
          fetchTickets();
        }
      )
      .on('broadcast', { event: 'ticket_called' }, () => {
        console.log('[Reception] Broadcast ticket_called received');
        fetchTickets();
      })
      .subscribe((status) => {
        console.log('[Reception] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.unit_id, user?.id]);


  const handleCreateTicket = async () => {
    const trimmedName = clientName.trim();
    
    // Validate name - must have at least 2 words (first and last name)
    const nameParts = trimmedName.split(/\s+/).filter(part => part.length > 0);
    if (nameParts.length < 2) {
      toast.error('Por favor, informe o nome completo do cliente (nome e sobrenome)');
      return;
    }
    
    if (trimmedName.length < 5) {
      toast.error('O nome do cliente deve ter pelo menos 5 caracteres');
      return;
    }

    setIsCreating(true);

    try {
      const unitId = profile?.unit_id || DEFAULT_UNIT_ID;
      
      // Call the edge function to create a ticket
      const { data, error } = await supabase.functions.invoke('create-ticket', {
        body: {
          unit_id: unitId,
          ticket_type: ticketType,
          client_name: clientName.trim(),
        },
      });

      if (error) throw error;

      if (data?.ticket) {
        setCreatedTicket(data.ticket);
        setShowTicketDialog(true);
        setClientName('');
        setClientCpf('');
        setTicketType('normal');
        toast.success('Senha gerada com sucesso!');
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      toast.error(error.message || 'Erro ao criar senha');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePrintTxt = () => {
    if (!createdTicket) return;
    
    const ticketDate = new Date(createdTicket.created_at);
    const dateStr = ticketDate.toLocaleDateString('pt-BR');
    const timeStr = ticketDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const typeStr = createdTicket.ticket_type === 'preferential' ? 'PREFERENCIAL' : 'NORMAL';
    
    // Create TXT content
    const txtContent = `
========================================
              SENHA
========================================

  Tipo: ${typeStr}
  
  Senha: ${createdTicket.display_code}
  
  Cliente: ${createdTicket.client_name}
  
  Data: ${dateStr}
  Hora: ${timeStr}

========================================
  Aguarde ser chamado pelo painel
========================================
`.trim();

    // Create a blob and download as TXT
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Senha ${createdTicket.display_code}</title>
            <style>
              body {
                font-family: 'Courier New', Courier, monospace;
                white-space: pre;
                margin: 20px;
                font-size: 14px;
                line-height: 1.5;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 10mm;
                }
              }
            </style>
          </head>
          <body>${txtContent}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
    
    // Also offer download
    const link = document.createElement('a');
    link.href = url;
    link.download = `senha-${createdTicket.display_code}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
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

  // Calculate stats
  const waitingTickets = tickets.filter(t => t.status === 'waiting');
  const calledTickets = tickets.filter(t => t.status === 'called');
  const inServiceTickets = tickets.filter(t => t.status === 'in_service');
  const completedTickets = tickets.filter(t => t.status === 'completed');
  const totalTicketsToday = tickets.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-foreground">
                Recepção
              </h1>
              <Badge variant="secondary" className="text-sm">
                {profile?.full_name}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900">
                  <Users className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Aguardando</p>
                  <p className="text-3xl font-bold">{waitingTickets.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
                  <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Em Atendimento</p>
                  <p className="text-3xl font-bold">{calledTickets.length + inServiceTickets.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Finalizados</p>
                  <p className="text-3xl font-bold">{completedTickets.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
                  <Ticket className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Hoje</p>
                  <p className="text-3xl font-bold">{totalTicketsToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Generate Ticket Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Gerar Nova Senha
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clientName">Nome Completo do Cliente *</Label>
                <Input
                  id="clientName"
                  placeholder="Digite o nome completo"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="clientCpf">CPF *</Label>
                <Input
                  id="clientCpf"
                  placeholder="000.000.000-00"
                  value={clientCpf}
                  onChange={handleCpfChange}
                  maxLength={14}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticketType">Tipo de Atendimento</Label>
              <Select value={ticketType} onValueChange={(v) => setTicketType(v as TicketType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="preferential">Preferencial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              size="lg" 
              className="w-full"
              onClick={handleCreateTicket}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Clock className="h-5 w-5 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Ticket className="h-5 w-5 mr-2" />
                  Gerar Senha
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Tickets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Últimas Senhas Geradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma senha gerada hoje</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {tickets.slice(0, 20).map((ticket) => (
                  <div 
                    key={ticket.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant={ticket.ticket_type === 'preferential' ? 'destructive' : 'secondary'}
                        className="text-lg px-3 py-1"
                      >
                        {ticket.display_code}
                      </Badge>
                      <div>
                        <p className="font-medium">{ticket.client_name || 'Cliente não identificado'}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(ticket.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      variant={
                        ticket.status === 'waiting' ? 'outline' :
                        ticket.status === 'called' ? 'default' :
                        ticket.status === 'in_service' ? 'secondary' :
                        ticket.status === 'completed' ? 'default' :
                        'destructive'
                      }
                      className={
                        ticket.status === 'completed' ? 'bg-green-600 hover:bg-green-700' : ''
                      }
                    >
                      {ticket.status === 'waiting' ? 'Aguardando' :
                       ticket.status === 'called' ? 'Chamado' :
                       ticket.status === 'in_service' ? 'Atendendo' :
                       ticket.status === 'completed' ? 'Finalizado' :
                       ticket.status === 'skipped' ? 'Pulado' :
                       'Cancelado'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Ticket Generated Dialog */}
      <Dialog open={showTicketDialog} onOpenChange={setShowTicketDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Senha Gerada!</DialogTitle>
          </DialogHeader>
          
          {createdTicket && (
            <>


              {/* Visual display */}
              <div className="text-center space-y-4 py-4">
                <Badge 
                  variant={createdTicket.ticket_type === 'preferential' ? 'destructive' : 'secondary'}
                  className="text-sm"
                >
                  {createdTicket.ticket_type === 'preferential' ? 'PREFERENCIAL' : 'NORMAL'}
                </Badge>
                
                <div className="text-6xl font-bold text-primary">
                  {createdTicket.display_code}
                </div>
                
                <p className="text-lg font-medium">{createdTicket.client_name}</p>
                
                <p className="text-sm text-muted-foreground">
                  {new Date(createdTicket.created_at).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(createdTicket.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowTicketDialog(false)}
                >
                  Fechar
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handlePrintTxt}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir TXT
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
