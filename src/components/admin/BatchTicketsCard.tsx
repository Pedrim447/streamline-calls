import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrgans } from '@/hooks/useOrgans';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PackagePlus, Loader2 } from 'lucide-react';

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

export function BatchTicketsCard() {
  const { toast } = useToast();
  const { organs, isLoading: organsLoading } = useOrgans();
  const [organId, setOrganId] = useState('');
  const [ticketType, setTicketType] = useState<'normal' | 'preferential'>('normal');
  const [startNumber, setStartNumber] = useState('');
  const [endNumber, setEndNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!organId) {
      toast({ title: 'Erro', description: 'Selecione um órgão', variant: 'destructive' });
      return;
    }

    const start = parseInt(startNumber);
    const end = parseInt(endNumber);

    if (isNaN(start) || isNaN(end) || start < 1) {
      toast({ title: 'Erro', description: 'Informe números válidos', variant: 'destructive' });
      return;
    }

    if (start > end) {
      toast({ title: 'Erro', description: 'Número inicial deve ser menor ou igual ao final', variant: 'destructive' });
      return;
    }

    if (end - start + 1 > 500) {
      toast({ title: 'Erro', description: 'Máximo de 500 senhas por lote', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await supabase.functions.invoke('batch-create-tickets', {
        body: {
          unit_id: DEFAULT_UNIT_ID,
          organ_id: organId,
          ticket_type: ticketType,
          start_number: start,
          end_number: end,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar lote');
      }

      const result = response.data;

      if (!result.success) {
        throw new Error(result.error || 'Erro ao criar lote');
      }

      toast({
        title: 'Lote criado com sucesso!',
        description: `${result.inserted} senhas criadas${result.skipped > 0 ? `, ${result.skipped} já existiam` : ''}. A recepção continuará a partir da senha ${end + 1}.`,
      });

      setStartNumber('');
      setEndNumber('');
    } catch (err: any) {
      console.error('Batch create error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao criar lote de senhas',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedOrganName = organs.find(o => o.id === organId)?.name || '';
  const count = parseInt(endNumber) - parseInt(startNumber) + 1;
  const validCount = !isNaN(count) && count > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Importar Lote de Senhas</CardTitle>
            <CardDescription>
              Adicione senhas já geradas para um órgão específico. Ao esgotar o lote, a recepção continuará gerando normalmente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Órgão *</Label>
            <Select value={organId} onValueChange={setOrganId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o órgão" />
              </SelectTrigger>
              <SelectContent>
                {organs.map((organ) => (
                  <SelectItem key={organ.id} value={organ.id}>
                    {organ.name} ({organ.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Senha *</Label>
            <Select value={ticketType} onValueChange={(v) => setTicketType(v as 'normal' | 'preferential')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal (N)</SelectItem>
                <SelectItem value="preferential">Preferencial (P)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Número Inicial *</Label>
            <Input
              type="number"
              min="1"
              placeholder="Ex: 1"
              value={startNumber}
              onChange={(e) => setStartNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Número Final *</Label>
            <Input
              type="number"
              min="1"
              placeholder="Ex: 100"
              value={endNumber}
              onChange={(e) => setEndNumber(e.target.value)}
            />
          </div>
        </div>

        {validCount && organId && (
          <div className="mt-4 p-3 rounded-lg bg-muted text-sm text-muted-foreground">
            Serão criadas <strong className="text-foreground">{count}</strong> senhas {ticketType === 'preferential' ? 'preferenciais' : 'normais'} ({ticketType === 'preferential' ? 'P' : 'N'}-{startNumber?.padStart(3, '0')} a {ticketType === 'preferential' ? 'P' : 'N'}-{endNumber?.padStart(3, '0')}) para <strong className="text-foreground">{selectedOrganName}</strong>.
            Após esse lote, a recepção gerará a partir de {ticketType === 'preferential' ? 'P' : 'N'}-{(parseInt(endNumber) + 1).toString().padStart(3, '0')}.
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={handleSubmit} disabled={isSubmitting || organsLoading}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <PackagePlus className="h-4 w-4 mr-2" />
                Criar Lote
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
