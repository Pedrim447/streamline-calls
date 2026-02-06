import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrganStats {
  organ_id: string;
  organ_name: string;
  organ_code: string;
  total: number;
  completed: number;
  skipped: number;
  cancelled: number;
  waiting: number;
  in_service: number;
  normal: number;
  preferential: number;
}

interface TicketDetail {
  display_code: string;
  organ_name: string;
  organ_code: string;
  ticket_type: string;
  status: string;
  created_at: string;
  called_at: string | null;
  completed_at: string | null;
  attendant_name: string | null;
  counter_number: number | null;
}

interface ReportData {
  totalTickets: number;
  completedTickets: number;
  skippedTickets: number;
  cancelledTickets: number;
  waitingTickets: number;
  inServiceTickets: number;
  normalTickets: number;
  preferentialTickets: number;
  avgServiceTime: number | null;
  avgWaitTime: number | null;
  organStats: OrganStats[];
  ticketDetails: TicketDetail[];
  date: string;
}

export function useTicketReport() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const fetchReportData = async (selectedDate: Date): Promise<ReportData | null> => {
    if (!profile?.unit_id) {
      toast({
        title: 'Erro',
        description: 'Unidade não configurada',
        variant: 'destructive',
      });
      return null;
    }

    // Calculate date range for selected date
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const startDate = startOfDay.toISOString();
    const endDate = endOfDay.toISOString();

    // Fetch tickets with related data
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('*, organs(id, name, code), counters(number)')
      .eq('unit_id', profile.unit_id)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError);
      toast({
        title: 'Erro',
        description: 'Falha ao buscar dados',
        variant: 'destructive',
      });
      return null;
    }

    // Fetch all organs for the unit
    const { data: organs, error: organsError } = await supabase
      .from('organs')
      .select('id, name, code')
      .eq('unit_id', profile.unit_id)
      .eq('is_active', true);

    if (organsError) {
      console.error('Error fetching organs:', organsError);
    }

    // Fetch attendant names for completed tickets
    const attendantIds = [...new Set(tickets?.filter(t => t.attendant_id).map(t => t.attendant_id))];
    let attendantMap = new Map<string, string>();
    
    if (attendantIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', attendantIds);
      
      profiles?.forEach(p => {
        attendantMap.set(p.user_id, p.full_name);
      });
    }

    // Calculate stats
    const totalTickets = tickets?.length || 0;
    const completedTickets = tickets?.filter(t => t.status === 'completed').length || 0;
    const skippedTickets = tickets?.filter(t => t.status === 'skipped').length || 0;
    const cancelledTickets = tickets?.filter(t => t.status === 'cancelled').length || 0;
    const waitingTickets = tickets?.filter(t => t.status === 'waiting').length || 0;
    const inServiceTickets = tickets?.filter(t => t.status === 'in_service' || t.status === 'called').length || 0;
    const normalTickets = tickets?.filter(t => t.ticket_type === 'normal').length || 0;
    const preferentialTickets = tickets?.filter(t => t.ticket_type === 'preferential').length || 0;

    // Calculate average service time
    let avgServiceTime: number | null = null;
    const completedWithTimes = tickets?.filter(
      t => t.status === 'completed' && t.service_started_at && t.completed_at
    );
    
    if (completedWithTimes && completedWithTimes.length > 0) {
      const totalServiceTime = completedWithTimes.reduce((acc, t) => {
        const start = new Date(t.service_started_at!).getTime();
        const end = new Date(t.completed_at!).getTime();
        return acc + (end - start);
      }, 0);
      avgServiceTime = Math.round(totalServiceTime / completedWithTimes.length / 1000 / 60);
    }

    // Calculate average wait time
    let avgWaitTime: number | null = null;
    const calledTickets = tickets?.filter(t => t.called_at && t.created_at);
    
    if (calledTickets && calledTickets.length > 0) {
      const totalWaitTime = calledTickets.reduce((acc, t) => {
        const created = new Date(t.created_at).getTime();
        const called = new Date(t.called_at!).getTime();
        return acc + (called - created);
      }, 0);
      avgWaitTime = Math.round(totalWaitTime / calledTickets.length / 1000 / 60);
    }

    // Calculate stats per organ
    const organStatsMap = new Map<string, OrganStats>();
    
    organs?.forEach(organ => {
      organStatsMap.set(organ.id, {
        organ_id: organ.id,
        organ_name: organ.name,
        organ_code: organ.code,
        total: 0,
        completed: 0,
        skipped: 0,
        cancelled: 0,
        waiting: 0,
        in_service: 0,
        normal: 0,
        preferential: 0,
      });
    });

    tickets?.forEach(ticket => {
      if (ticket.organ_id) {
        const existing = organStatsMap.get(ticket.organ_id);
        if (existing) {
          existing.total++;
          if (ticket.status === 'completed') existing.completed++;
          if (ticket.status === 'skipped') existing.skipped++;
          if (ticket.status === 'cancelled') existing.cancelled++;
          if (ticket.status === 'waiting') existing.waiting++;
          if (ticket.status === 'in_service' || ticket.status === 'called') existing.in_service++;
          if (ticket.ticket_type === 'normal') existing.normal++;
          if (ticket.ticket_type === 'preferential') existing.preferential++;
        }
      }
    });

    // Add "Sem órgão" for tickets without organ
    const ticketsWithoutOrgan = tickets?.filter(t => !t.organ_id) || [];
    if (ticketsWithoutOrgan.length > 0) {
      organStatsMap.set('no-organ', {
        organ_id: 'no-organ',
        organ_name: 'Sem órgão definido',
        organ_code: '-',
        total: ticketsWithoutOrgan.length,
        completed: ticketsWithoutOrgan.filter(t => t.status === 'completed').length,
        skipped: ticketsWithoutOrgan.filter(t => t.status === 'skipped').length,
        cancelled: ticketsWithoutOrgan.filter(t => t.status === 'cancelled').length,
        waiting: ticketsWithoutOrgan.filter(t => t.status === 'waiting').length,
        in_service: ticketsWithoutOrgan.filter(t => t.status === 'in_service' || t.status === 'called').length,
        normal: ticketsWithoutOrgan.filter(t => t.ticket_type === 'normal').length,
        preferential: ticketsWithoutOrgan.filter(t => t.ticket_type === 'preferential').length,
      });
    }

    const organStats = Array.from(organStatsMap.values()).filter(o => o.total > 0);

    // Build ticket details
    const ticketDetails: TicketDetail[] = (tickets || []).map(ticket => ({
      display_code: ticket.display_code,
      organ_name: (ticket.organs as any)?.name || 'Sem órgão',
      organ_code: (ticket.organs as any)?.code || '-',
      ticket_type: ticket.ticket_type === 'preferential' ? 'Preferencial' : 'Normal',
      status: getStatusLabel(ticket.status),
      created_at: format(new Date(ticket.created_at), 'HH:mm:ss', { locale: ptBR }),
      called_at: ticket.called_at ? format(new Date(ticket.called_at), 'HH:mm:ss', { locale: ptBR }) : null,
      completed_at: ticket.completed_at ? format(new Date(ticket.completed_at), 'HH:mm:ss', { locale: ptBR }) : null,
      attendant_name: ticket.attendant_id ? attendantMap.get(ticket.attendant_id) || null : null,
      counter_number: (ticket.counters as any)?.number || null,
    }));

    return {
      totalTickets,
      completedTickets,
      skippedTickets,
      cancelledTickets,
      waitingTickets,
      inServiceTickets,
      normalTickets,
      preferentialTickets,
      avgServiceTime,
      avgWaitTime,
      organStats,
      ticketDetails,
      date: format(selectedDate, "dd/MM/yyyy", { locale: ptBR }),
    };
  };

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      waiting: 'Aguardando',
      called: 'Chamada',
      in_service: 'Em Atendimento',
      completed: 'Concluída',
      skipped: 'Pulada',
      cancelled: 'Cancelada',
    };
    return labels[status] || status;
  };

  const generateExcelReport = async (selectedDate: Date) => {
    setIsLoading(true);

    try {
      const data = await fetchReportData(selectedDate);
      
      if (!data) {
        setIsLoading(false);
        return;
      }

      if (data.totalTickets === 0) {
        toast({
          title: 'Sem dados',
          description: `Não há registros de atendimento para ${data.date}`,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      const wb = XLSX.utils.book_new();

      // ===== Sheet 1: Resumo Geral =====
      const resumoData = [
        ['RELATÓRIO DE ATENDIMENTO'],
        [`Data: ${data.date}`],
        [''],
        ['RESUMO GERAL'],
        ['Métrica', 'Quantidade'],
        ['Total de Senhas Emitidas', data.totalTickets],
        ['Atendidas (Concluídas)', data.completedTickets],
        ['Puladas', data.skippedTickets],
        ['Canceladas', data.cancelledTickets],
        ['Aguardando', data.waitingTickets],
        ['Em Atendimento/Chamadas', data.inServiceTickets],
        [''],
        ['POR TIPO DE SENHA'],
        ['Tipo', 'Quantidade'],
        ['Normal', data.normalTickets],
        ['Preferencial', data.preferentialTickets],
        [''],
        ['INDICADORES DE DESEMPENHO'],
        ['Indicador', 'Valor'],
        ['Taxa de Conclusão', `${data.totalTickets > 0 ? Math.round((data.completedTickets / data.totalTickets) * 100) : 0}%`],
        ['Taxa de Desistência (Puladas)', `${data.totalTickets > 0 ? Math.round((data.skippedTickets / data.totalTickets) * 100) : 0}%`],
        ['Tempo Médio de Espera', data.avgWaitTime ? `${data.avgWaitTime} min` : 'N/A'],
        ['Tempo Médio de Atendimento', data.avgServiceTime ? `${data.avgServiceTime} min` : 'N/A'],
      ];

      const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
      wsResumo['!cols'] = [{ wch: 35 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

      // ===== Sheet 2: Por Órgão =====
      const organHeader = ['Órgão', 'Código', 'Total', 'Atendidas', 'Puladas', 'Canceladas', 'Aguardando', 'Em Atend.', 'Normal', 'Preferencial', 'Taxa Conclusão'];
      const organRows = data.organStats.map(o => [
        o.organ_name,
        o.organ_code,
        o.total,
        o.completed,
        o.skipped,
        o.cancelled,
        o.waiting,
        o.in_service,
        o.normal,
        o.preferential,
        o.total > 0 ? `${Math.round((o.completed / o.total) * 100)}%` : '0%',
      ]);

      const organData = [
        ['ATENDIMENTO POR ÓRGÃO'],
        [`Data: ${data.date}`],
        [''],
        organHeader,
        ...organRows,
        [''],
        ['TOTAIS', '', data.totalTickets, data.completedTickets, data.skippedTickets, data.cancelledTickets, data.waitingTickets, data.inServiceTickets, data.normalTickets, data.preferentialTickets, `${data.totalTickets > 0 ? Math.round((data.completedTickets / data.totalTickets) * 100) : 0}%`],
      ];

      const wsOrgaos = XLSX.utils.aoa_to_sheet(organData);
      wsOrgaos['!cols'] = [
        { wch: 25 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, 
        { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(wb, wsOrgaos, 'Por Órgão');

      // ===== Sheet 3: Lista de Senhas =====
      const ticketHeader = ['Senha', 'Órgão', 'Cód. Órgão', 'Tipo', 'Status', 'Hora Emissão', 'Hora Chamada', 'Hora Conclusão', 'Atendente', 'Guichê'];
      const ticketRows = data.ticketDetails.map(t => [
        t.display_code,
        t.organ_name,
        t.organ_code,
        t.ticket_type,
        t.status,
        t.created_at,
        t.called_at || '-',
        t.completed_at || '-',
        t.attendant_name || '-',
        t.counter_number || '-',
      ]);

      const ticketData = [
        ['LISTA COMPLETA DE SENHAS'],
        [`Data: ${data.date}`],
        [`Total: ${data.totalTickets} senhas`],
        [''],
        ticketHeader,
        ...ticketRows,
      ];

      const wsTickets = XLSX.utils.aoa_to_sheet(ticketData);
      wsTickets['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, 
        { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 8 }
      ];
      XLSX.utils.book_append_sheet(wb, wsTickets, 'Lista de Senhas');

      // ===== Sheet 4: Dados para Gráfico =====
      const chartData = [
        ['DADOS PARA GRÁFICO - STATUS'],
        ['Status', 'Quantidade'],
        ['Atendidas', data.completedTickets],
        ['Puladas', data.skippedTickets],
        ['Canceladas', data.cancelledTickets],
        ['Aguardando', data.waitingTickets],
        ['Em Atendimento', data.inServiceTickets],
        [''],
        ['DADOS PARA GRÁFICO - POR ÓRGÃO'],
        ['Órgão', 'Total', 'Atendidas', 'Puladas'],
        ...data.organStats.map(o => [o.organ_name, o.total, o.completed, o.skipped]),
        [''],
        ['DADOS PARA GRÁFICO - TIPO DE SENHA'],
        ['Tipo', 'Quantidade'],
        ['Normal', data.normalTickets],
        ['Preferencial', data.preferentialTickets],
      ];

      const wsChart = XLSX.utils.aoa_to_sheet(chartData);
      wsChart['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsChart, 'Dados Gráficos');

      // Generate filename
      const dateForFile = data.date.replace(/\//g, '-');
      const filename = `relatorio-atendimento-${dateForFile}.xlsx`;

      XLSX.writeFile(wb, filename);

      toast({
        title: 'Relatório Gerado',
        description: `Arquivo ${filename} baixado com sucesso`,
      });

    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao gerar relatório',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    generateExcelReport,
    isLoading,
  };
}
