import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { useYesterdayReport } from '@/hooks/useYesterdayReport';

export function ReportsCard() {
  const { generateExcelReport, isLoading } = useYesterdayReport();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Relatórios
        </CardTitle>
        <CardDescription>
          Gere relatórios de atendimento para análise
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Relatório de Ontem</h4>
              <p className="text-sm text-muted-foreground">
                Demanda, senhas por órgão, atendimentos e dados para gráficos
              </p>
            </div>
            <Button 
              onClick={generateExcelReport} 
              disabled={isLoading}
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

        <div className="text-xs text-muted-foreground">
          <p>O relatório inclui:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Resumo geral de atendimentos</li>
            <li>Detalhamento por órgão</li>
            <li>Dados formatados para criar gráficos no Excel</li>
            <li>Taxa de conclusão e tempo médio</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
