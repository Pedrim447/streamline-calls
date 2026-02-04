import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Hand, RotateCcw, Play, Lock } from 'lucide-react';

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

interface ManualModeSettingsCardProps {
  manualModeEnabled: boolean;
  manualModeMinNumber: number;
  manualModeMinNumberPreferential: number;
  callingSystemActive: boolean;
  atendimentoAcaoEnabled: boolean;
  onManualModeEnabledChange: (value: boolean) => void;
  onManualModeMinNumberChange: (value: number) => void;
  onManualModeMinNumberPreferentialChange: (value: number) => void;
  onCallingSystemActiveChange: (value: boolean) => void;
  onAtendimentoAcaoEnabledChange: (value: boolean) => void;
  onSettingsChange: () => void;
}

export function ManualModeSettingsCard({
  manualModeEnabled,
  manualModeMinNumber,
  manualModeMinNumberPreferential,
  callingSystemActive,
  atendimentoAcaoEnabled,
  onManualModeEnabledChange,
  onManualModeMinNumberChange,
  onManualModeMinNumberPreferentialChange,
  onCallingSystemActiveChange,
  onAtendimentoAcaoEnabledChange,
  onSettingsChange,
}: ManualModeSettingsCardProps) {
  const { toast } = useToast();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'reset' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleStartStop = () => {
    setPendingAction(callingSystemActive ? 'stop' : 'start');
    setShowPasswordDialog(true);
    setPasswordInput('');
  };

  const handleReset = () => {
    setPendingAction('reset');
    setShowPasswordDialog(true);
    setPasswordInput('');
  };

  const handlePasswordConfirm = async () => {
    if (!passwordInput) {
      toast({
        title: 'Erro',
        description: 'Por favor, digite sua senha',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Verify password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        throw new Error('Usuário não encontrado');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordInput,
      });

      if (signInError) {
        toast({
          title: 'Erro',
          description: 'Senha incorreta',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Password verified, proceed with action
      if (pendingAction === 'start' || pendingAction === 'stop') {
        const newActiveState = pendingAction === 'start';
        const { error } = await supabase
          .from('settings')
          .update({ calling_system_active: newActiveState })
          .eq('unit_id', DEFAULT_UNIT_ID);

        if (error) throw error;

        onCallingSystemActiveChange(newActiveState);
        toast({
          title: 'Sucesso',
          description: newActiveState ? 'Sistema de chamadas iniciado' : 'Sistema de chamadas parado',
        });
      } else if (pendingAction === 'reset') {
        // Reset ticket counters for today
        const today = new Date().toISOString().split('T')[0];
        
        // Delete ticket counters
        const { error: counterError } = await supabase
          .from('ticket_counters')
          .delete()
          .eq('unit_id', DEFAULT_UNIT_ID)
          .eq('counter_date', today);

        if (counterError) throw counterError;

        // Delete ALL tickets from today (including completed, cancelled, skipped)
        const { error: ticketError } = await supabase
          .from('tickets')
          .delete()
          .eq('unit_id', DEFAULT_UNIT_ID)
          .gte('created_at', `${today}T00:00:00`);

        if (ticketError) throw ticketError;

        // Broadcast reset event to all clients
        const channel = supabase.channel(`system-reset-${DEFAULT_UNIT_ID}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'system_reset',
          payload: { timestamp: new Date().toISOString() },
        });
        await supabase.removeChannel(channel);

        toast({
          title: 'Sucesso',
          description: 'Sistema resetado com sucesso. Contadores e senhas pendentes foram limpos.',
        });
        
        onSettingsChange();
      }

      setShowPasswordDialog(false);
      setPasswordInput('');
      setPendingAction(null);
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao executar ação',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hand className="h-5 w-5" />
            Modo de Geração de Senhas
          </CardTitle>
          <CardDescription>
            Configure o modo de geração de senhas (automático ou manual)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* System Status and Controls */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${callingSystemActive ? 'bg-primary/10' : 'bg-muted'}`}>
                {callingSystemActive ? (
                  <Play className="h-5 w-5 text-primary" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {callingSystemActive ? 'Sistema Ativo' : 'Sistema Parado'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {callingSystemActive 
                    ? 'O sistema de chamadas está funcionando' 
                    : 'O sistema de chamadas está desativado'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={callingSystemActive ? 'destructive' : 'default'}
                onClick={handleStartStop}
              >
                {callingSystemActive ? 'Parar' : 'Iniciar'}
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>

          <Separator />

          {/* Mode Selection */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="manualModeEnabled">Modo Manual</Label>
              <p className="text-sm text-muted-foreground">
                {manualModeEnabled 
                  ? 'Recepção define o número de cada senha'
                  : 'Sistema gera números automaticamente'}
              </p>
            </div>
            <Switch
              id="manualModeEnabled"
              checked={manualModeEnabled}
              onCheckedChange={onManualModeEnabledChange}
            />
          </div>

          <Separator />

          {/* Number Settings - Always visible */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="manualModeMinNumber">
                Número Inicial - Normal
              </Label>
              <Input
                id="manualModeMinNumber"
                type="number"
                min="0"
                value={manualModeMinNumber}
                onChange={(e) => onManualModeMinNumberChange(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                {manualModeEnabled 
                  ? 'Mínimo para senhas normais no modo manual'
                  : 'Senhas normais iniciam a partir deste número'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manualModeMinNumberPreferential">
                Número Inicial - Preferencial
              </Label>
              <Input
                id="manualModeMinNumberPreferential"
                type="number"
                min="0"
                value={manualModeMinNumberPreferential}
                onChange={(e) => onManualModeMinNumberPreferentialChange(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                {manualModeEnabled 
                  ? 'Mínimo para senhas preferenciais no modo manual'
                  : 'Senhas preferenciais iniciam a partir deste número'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Confirmation Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Ação</DialogTitle>
            <DialogDescription>
              {pendingAction === 'start' && 'Digite sua senha para iniciar o sistema de chamadas.'}
              {pendingAction === 'stop' && 'Digite sua senha para parar o sistema de chamadas.'}
              {pendingAction === 'reset' && 'Digite sua senha para resetar os contadores de senha. Esta ação não pode ser desfeita.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">Senha do Administrador</Label>
              <Input
                id="password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Digite sua senha"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handlePasswordConfirm();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false);
                setPasswordInput('');
                setPendingAction(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePasswordConfirm}
              disabled={isLoading || !passwordInput}
            >
              {isLoading ? 'Verificando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
