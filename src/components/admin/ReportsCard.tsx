import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileSpreadsheet, Download, Loader2, CalendarIcon } from 'lucide-react';
import { useTicketReport } from '@/hooks/useTicketReport';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export function ReportsCard() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday by default
  );
  const { generateExcelReport, isLoading } = useTicketReport();

  const handleGenerateReport = () => {
    if (selectedDate) {
      generateExcelReport(selectedDate);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Relatórios
        </CardTitle>
        <CardDescription>
          Selecione uma data e gere o relatório de atendimento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 border rounded-lg bg-muted/50">
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="font-medium mb-2">Selecione a Data</h4>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    ) : (
                      <span>Selecione uma data</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Demanda, senhas por órgão, atendimentos e dados para gráficos
                </p>
              </div>
              <Button 
                onClick={handleGenerateReport} 
                disabled={isLoading || !selectedDate}
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isLoading ? 'Gerando...' : 'Baixar Excel'}
              </Button>
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>O relatório inclui:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Resumo geral de atendimentos</li>
            <li>Detalhamento por órgão</li>
            <li>Lista completa de todas as senhas</li>
            <li>Dados formatados para criar gráficos no Excel</li>
            <li>Taxa de conclusão e tempo médio</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
