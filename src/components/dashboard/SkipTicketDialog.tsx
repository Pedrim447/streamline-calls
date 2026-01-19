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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface SkipTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  ticketCode?: string;
}

export function SkipTicketDialog({
  open,
  onOpenChange,
  onConfirm,
  ticketCode,
}: SkipTicketDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (reason.trim().length < 3) {
      setError('O motivo deve ter pelo menos 3 caracteres');
      return;
    }
    
    onConfirm(reason.trim());
    setReason('');
    setError('');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setReason('');
      setError('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Pular Senha
          </DialogTitle>
          <DialogDescription>
            Você está prestes a pular a senha <strong>{ticketCode}</strong>. 
            Esta ação é registrada e requer uma justificativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo *</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Cliente não compareceu, ausência no local..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              rows={3}
              className={error ? 'border-destructive' : ''}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Confirmar e Pular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
