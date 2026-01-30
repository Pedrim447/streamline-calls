import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { AlertCircle, Phone } from 'lucide-react';

interface ManualCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (ticketNumber: number, ticketType: 'normal' | 'preferential') => Promise<void>;
  minNumber: number;
  isLoading?: boolean;
}

export function ManualCallDialog({
  open,
  onOpenChange,
  onConfirm,
  minNumber,
  isLoading = false,
}: ManualCallDialogProps) {
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticketType, setTicketType] = useState<'normal' | 'preferential'>('normal');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const num = parseInt(ticketNumber, 10);
    
    if (isNaN(num) || num <= 0) {
      setError('Digite um número válido');
      return;
    }
    
    if (num < minNumber) {
      setError(`Número mínimo permitido é ${minNumber}`);
      return;
    }
    
    setError(null);
    await onConfirm(num, ticketType);
    
    // Reset form on success
    setTicketNumber('');
    setTicketType('normal');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setTicketNumber('');
      setTicketType('normal');
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Chamar Senha Manual
          </DialogTitle>
          <DialogDescription>
            Informe o número da senha que deseja chamar manualmente.
            O número mínimo configurado é <strong>{minNumber}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ticketNumber">Número da Senha</Label>
            <Input
              id="ticketNumber"
              type="number"
              min={minNumber}
              value={ticketNumber}
              onChange={(e) => {
                setTicketNumber(e.target.value);
                setError(null);
              }}
              placeholder={`Ex: ${minNumber}`}
              className="text-lg"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="ticketType">Tipo da Senha</Label>
            <Select 
              value={ticketType} 
              onValueChange={(value: 'normal' | 'preferential') => setTicketType(value)}
            >
              <SelectTrigger id="ticketType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal (N)</SelectItem>
                <SelectItem value="preferential">Preferencial (P)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !ticketNumber}>
            {isLoading ? 'Chamando...' : 'Chamar Senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
