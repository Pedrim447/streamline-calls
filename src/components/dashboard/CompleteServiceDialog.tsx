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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle, Loader2 } from 'lucide-react';

interface CompleteServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (serviceType: string, completionStatus: string) => void;
  ticketCode?: string;
  isProcessing?: boolean;
}

const SERVICE_TYPES = [
  { value: 'revisao', label: 'Revisão' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'alistamento', label: 'Alistamento' },
  { value: 'certidao', label: 'Certidão' },
  { value: 'outros', label: 'Outros' },
];

const COMPLETION_STATUSES = [
  { value: 'realizado_sucesso', label: 'Realizado com sucesso' },
  { value: 'requerimento_nao_atendido', label: 'Requerimento não atendido' },
  { value: 'outro', label: 'Outro' },
];

export function CompleteServiceDialog({
  open,
  onOpenChange,
  onConfirm,
  ticketCode,
  isProcessing = false,
}: CompleteServiceDialogProps) {
  const [serviceType, setServiceType] = useState<string>('');
  const [completionStatus, setCompletionStatus] = useState<string>('');

  const canConfirm = serviceType && completionStatus;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm(serviceType, completionStatus);
      // Reset for next use
      setServiceType('');
      setCompletionStatus('');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset on close
      setServiceType('');
      setCompletionStatus('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Finalizar Atendimento
          </DialogTitle>
          <DialogDescription>
            {ticketCode && (
              <span className="font-semibold text-foreground">
                Senha: {ticketCode}
              </span>
            )}
            <br />
            Selecione o serviço solicitado e a conclusão do atendimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Service Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Serviço Solicitado <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={serviceType}
              onValueChange={setServiceType}
              className="grid gap-2"
            >
              {SERVICE_TYPES.map((type) => (
                <div
                  key={type.value}
                  className="flex items-center space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setServiceType(type.value)}
                >
                  <RadioGroupItem value={type.value} id={`service-${type.value}`} />
                  <Label
                    htmlFor={`service-${type.value}`}
                    className="flex-1 cursor-pointer font-normal"
                  >
                    {type.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Completion Status Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Conclusão do Atendimento <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={completionStatus}
              onValueChange={setCompletionStatus}
              className="grid gap-2"
            >
              {COMPLETION_STATUSES.map((status) => (
                <div
                  key={status.value}
                  className="flex items-center space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCompletionStatus(status.value)}
                >
                  <RadioGroupItem value={status.value} id={`status-${status.value}`} />
                  <Label
                    htmlFor={`status-${status.value}`}
                    className="flex-1 cursor-pointer font-normal"
                  >
                    {status.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isProcessing}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || isProcessing}
            className="bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Finalizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
