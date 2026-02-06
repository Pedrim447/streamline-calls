import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface OrganStats {
  organ_id: string;
  organ_name: string;
  organ_code: string;
  total: number;
  completed: number;
  skipped: number;
  cancelled: number;
  normal: number;
  preferential: number;
}

interface ReportData {
  totalTickets: number;
  completedTickets: number;
  skippedTickets: number;
  cancelledTickets: number;
  normalTickets: number;
  preferentialTickets: number;
  avgServiceTime: number | null;
  organStats: OrganStats[];
  date: string;
}

export function useYesterdayReport() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const fetchYesterdayData = async (): Promise<ReportData | null> => {
    if (!profile?.unit_id) {
      toast({
        title: 'Erro',
        description: 'Unidade não configurada',
        variant: 'destructive',
      });
      return null;
    }

    // Calculate yesterday's date range
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const startDate = yesterday.toISOString();
    const endDate = yesterdayEnd.toISOString();

    // Fetch tickets from yesterday
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('*, organs(id, name, code)')
      .eq('unit_id', profile.unit_id)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError);
      toast({
        title: 'Erro',
        description: 'Falha ao buscar dados de ontem',
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

    // Calculate stats
    const totalTickets = tickets?.length || 0;
    const completedTickets = tickets?.filter(t => t.status === 'completed').length || 0;
    const skippedTickets = tickets?.filter(t => t.status === 'skipped').length || 0;
    const cancelledTickets = tickets?.filter(t => t.status === 'cancelled').length || 0;
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
      avgServiceTime = Math.round(totalServiceTime / completedWithTimes.length / 1000 / 60); // in minutes
    }

    // Calculate stats per organ
    const organStatsMap = new Map<string, OrganStats>();
    
    // Initialize with all active organs
    organs?.forEach(organ => {
      organStatsMap.set(organ.id, {
        organ_id: organ.id,
        organ_name: organ.name,
        organ_code: organ.code,
        total: 0,
        completed: 0,
        skipped: 0,
        cancelled: 0,
        normal: 0,
        preferential: 0,
      });
    });

    // Count tickets per organ
    tickets?.forEach(ticket => {
      if (ticket.organ_id) {
        const existing = organStatsMap.get(ticket.organ_id);
        if (existing) {
          existing.total++;
          if (ticket.status === 'completed') existing.completed++;
          if (ticket.status === 'skipped') existing.skipped++;
          if (ticket.status === 'cancelled') existing.cancelled++;
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
        normal: ticketsWithoutOrgan.filter(t => t.ticket_type === 'normal').length,
        preferential: ticketsWithoutOrgan.filter(t => t.ticket_type === 'preferential').length,
      });
    }

    const organStats = Array.from(organStatsMap.values()).filter(o => o.total > 0);

    return {
      totalTickets,
      completedTickets,
      skippedTickets,
      cancelledTickets,
      normalTickets,
      preferentialTickets,
      avgServiceTime,
      organStats,
      date: yesterday.toLocaleDateString('pt-BR'),
    };
  };

  const generateExcelReport = async () => {
    setIsLoading(true);

    try {
      const data = await fetchYesterdayData();
      
      if (!data) {
        setIsLoading(false);
        return;
      }

      if (data.totalTickets === 0) {
        toast({
          title: 'Sem dados',
          description: 'Não há registros de atendimento para ontem',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Create workbook
      const wb = XLSX.utils.book_new();

      // ===== Sheet 1: Resumo Geral =====
      const resumoData = [
        ['RELATÓRIO DE ATENDIMENTO'],
        [`Data: ${data.date}`],
        [''],
        ['RESUMO GERAL'],
        ['Métrica', 'Quantidade'],
        ['Total de Senhas', data.totalTickets],
        ['Atendidas (Completas)', data.completedTickets],
        ['Puladas', data.skippedTickets],
        ['Canceladas', data.cancelledTickets],
        [''],
        ['POR TIPO DE SENHA'],
        ['Tipo', 'Quantidade'],
        ['Normal', data.normalTickets],
        ['Preferencial', data.preferentialTickets],
        [''],
        ['INDICADORES'],
        ['Indicador', 'Valor'],
        ['Taxa de Conclusão', `${data.totalTickets > 0 ? Math.round((data.completedTickets / data.totalTickets) * 100) : 0}%`],
        ['Tempo Médio de Atendimento', data.avgServiceTime ? `${data.avgServiceTime} min` : 'N/A'],
      ];

      const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
      
      // Set column widths
      wsResumo['!cols'] = [{ wch: 30 }, { wch: 20 }];
      
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

      // ===== Sheet 2: Por Órgão =====
      const organHeader = ['Órgão', 'Código', 'Total', 'Atendidas', 'Puladas', 'Canceladas', 'Normal', 'Preferencial'];
      const organRows = data.organStats.map(o => [
        o.organ_name,
        o.organ_code,
        o.total,
        o.completed,
        o.skipped,
        o.cancelled,
        o.normal,
        o.preferential,
      ]);

      const organData = [
        ['ATENDIMENTO POR ÓRGÃO'],
        [`Data: ${data.date}`],
        [''],
        organHeader,
        ...organRows,
      ];

      const wsOrgaos = XLSX.utils.aoa_to_sheet(organData);
      wsOrgaos['!cols'] = [
        { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, 
        { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }
      ];
      
      XLSX.utils.book_append_sheet(wb, wsOrgaos, 'Por Órgão');

      // ===== Sheet 3: Dados para Gráfico =====
      const chartData = [
        ['DADOS PARA GRÁFICO - STATUS'],
        ['Status', 'Quantidade'],
        ['Atendidas', data.completedTickets],
        ['Puladas', data.skippedTickets],
        ['Canceladas', data.cancelledTickets],
        ['Aguardando', data.totalTickets - data.completedTickets - data.skippedTickets - data.cancelledTickets],
        [''],
        ['DADOS PARA GRÁFICO - POR ÓRGÃO'],
        ['Órgão', 'Total', 'Atendidas'],
        ...data.organStats.map(o => [o.organ_name, o.total, o.completed]),
        [''],
        ['DADOS PARA GRÁFICO - TIPO DE SENHA'],
        ['Tipo', 'Quantidade'],
        ['Normal', data.normalTickets],
        ['Preferencial', data.preferentialTickets],
      ];

      const wsChart = XLSX.utils.aoa_to_sheet(chartData);
      wsChart['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }];
      
      XLSX.utils.book_append_sheet(wb, wsChart, 'Dados Gráficos');

      // Generate filename
      const dateForFile = data.date.replace(/\//g, '-');
      const filename = `relatorio-atendimento-${dateForFile}.xlsx`;

      // Download file
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
