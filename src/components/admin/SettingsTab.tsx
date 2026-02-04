import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Save, Building, Volume2, Clock } from 'lucide-react';
import { ManualModeSettingsCard } from './ManualModeSettingsCard';
import type { Database } from '@/integrations/supabase/types';

type Unit = Database['public']['Tables']['units']['Row'];

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

export function SettingsTab() {
  const { toast } = useToast();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state - Unit
  const [unitName, setUnitName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [secondaryColor, setSecondaryColor] = useState('#1e40af');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voiceTemplate, setVoiceTemplate] = useState('Senha {ticket}, guichê {counter}');
  
  // Form state - Settings
  const [normalPriority, setNormalPriority] = useState(5);
  const [preferentialPriority, setPreferentialPriority] = useState(10);
  const [autoResetDaily, setAutoResetDaily] = useState(true);
  const [resetTime, setResetTime] = useState('00:00');
  const [manualModeEnabled, setManualModeEnabled] = useState(false);
  const [manualModeMinNumber, setManualModeMinNumber] = useState(500);
  const [manualModeMinNumberPreferential, setManualModeMinNumberPreferential] = useState(0);
  const [callingSystemActive, setCallingSystemActive] = useState(false);
  const [atendimentoAcaoEnabled, setAtendimentoAcaoEnabled] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);

    const [unitRes, settingsRes] = await Promise.all([
      supabase.from('units').select('*').eq('id', DEFAULT_UNIT_ID).single(),
      supabase.from('settings').select('*').eq('unit_id', DEFAULT_UNIT_ID).single(),
    ]);

    if (unitRes.data) {
      setUnit(unitRes.data);
      setUnitName(unitRes.data.name);
      setPrimaryColor(unitRes.data.primary_color || '#2563eb');
      setSecondaryColor(unitRes.data.secondary_color || '#1e40af');
      setVoiceEnabled(unitRes.data.voice_enabled ?? true);
      setVoiceSpeed(unitRes.data.voice_speed ?? 1.0);
      setVoiceTemplate(unitRes.data.voice_message_template || 'Senha {ticket}, guichê {counter}');
    }

    if (settingsRes.data) {
      setNormalPriority(settingsRes.data.normal_priority ?? 5);
      setPreferentialPriority(settingsRes.data.preferential_priority ?? 10);
      setAutoResetDaily(settingsRes.data.auto_reset_daily ?? true);
      setResetTime(settingsRes.data.reset_time?.slice(0, 5) || '00:00');
      setManualModeEnabled(settingsRes.data.manual_mode_enabled ?? false);
      setManualModeMinNumber(settingsRes.data.manual_mode_min_number ?? 500);
      // @ts-ignore - new columns
      setManualModeMinNumberPreferential(settingsRes.data.manual_mode_min_number_preferential ?? 0);
      // @ts-ignore - new columns
      setCallingSystemActive(settingsRes.data.calling_system_active ?? false);
      // @ts-ignore - new columns
      setAtendimentoAcaoEnabled(settingsRes.data.atendimento_acao_enabled ?? false);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Update unit
      const { error: unitError } = await supabase
        .from('units')
        .update({
          name: unitName,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          voice_enabled: voiceEnabled,
          voice_speed: voiceSpeed,
          voice_message_template: voiceTemplate,
        })
        .eq('id', DEFAULT_UNIT_ID);

      if (unitError) throw unitError;

      // Update settings
      const { error: settingsError } = await supabase
        .from('settings')
        .update({
          normal_priority: normalPriority,
          preferential_priority: preferentialPriority,
          auto_reset_daily: autoResetDaily,
          reset_time: resetTime + ':00',
          manual_mode_enabled: manualModeEnabled,
          manual_mode_min_number: manualModeMinNumber,
          manual_mode_min_number_preferential: manualModeMinNumberPreferential,
          atendimento_acao_enabled: atendimentoAcaoEnabled,
        .eq('unit_id', DEFAULT_UNIT_ID);

      if (settingsError) throw settingsError;

      toast({
        title: 'Sucesso',
        description: 'Configurações salvas com sucesso',
      });
    } catch (err) {
      console.error('Error saving settings:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao salvar configurações',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unit Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Dados da Unidade
          </CardTitle>
          <CardDescription>
            Configure o nome e identidade visual da unidade
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitName">Nome da Unidade</Label>
              <Input
                id="unitName"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Ex: Hospital Central"
              />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Cor Primária</Label>
              <div className="flex gap-2">
                <Input
                  id="primaryColor"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#2563eb"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Cor Secundária</Label>
              <div className="flex gap-2">
                <Input
                  id="secondaryColor"
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder="#1e40af"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voice Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Configurações de Voz
          </CardTitle>
          <CardDescription>
            Configure a chamada por voz do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="voiceEnabled">Chamada por Voz</Label>
              <p className="text-sm text-muted-foreground">
                Ativar anúncio por voz ao chamar senhas
              </p>
            </div>
            <Switch
              id="voiceEnabled"
              checked={voiceEnabled}
              onCheckedChange={setVoiceEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="voiceTemplate">Modelo da Mensagem</Label>
            <Input
              id="voiceTemplate"
              value={voiceTemplate}
              onChange={(e) => setVoiceTemplate(e.target.value)}
              placeholder="Senha {ticket}, guichê {counter}"
            />
            <p className="text-xs text-muted-foreground">
              Use {'{ticket}'} para o número da senha e {'{counter}'} para o guichê
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voiceSpeed">Velocidade da Fala: {voiceSpeed.toFixed(1)}x</Label>
            <input
              id="voiceSpeed"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={voiceSpeed}
              onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Manual Mode Settings - New Component */}
      <ManualModeSettingsCard
        manualModeEnabled={manualModeEnabled}
        manualModeMinNumber={manualModeMinNumber}
        manualModeMinNumberPreferential={manualModeMinNumberPreferential}
        callingSystemActive={callingSystemActive}
        onManualModeEnabledChange={setManualModeEnabled}
        onManualModeMinNumberChange={setManualModeMinNumber}
        onManualModeMinNumberPreferentialChange={setManualModeMinNumberPreferential}
        onCallingSystemActiveChange={setCallingSystemActive}
        onSettingsChange={fetchData}
      />

      {/* Priority & Reset Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Prioridades e Reset
          </CardTitle>
          <CardDescription>
            Configure prioridades e reset automático das senhas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="normalPriority">Prioridade Normal</Label>
              <Input
                id="normalPriority"
                type="number"
                min="1"
                max="100"
                value={normalPriority}
                onChange={(e) => setNormalPriority(parseInt(e.target.value))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="preferentialPriority">Prioridade Preferencial</Label>
              <Input
                id="preferentialPriority"
                type="number"
                min="1"
                max="100"
                value={preferentialPriority}
                onChange={(e) => setPreferentialPriority(parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Valores maiores = maior prioridade na fila
              </p>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="autoReset">Reset Automático Diário</Label>
              <p className="text-sm text-muted-foreground">
                Zerar contadores de senha automaticamente
              </p>
            </div>
            <Switch
              id="autoReset"
              checked={autoResetDaily}
              onCheckedChange={setAutoResetDaily}
            />
          </div>

          {autoResetDaily && (
            <div className="space-y-2">
              <Label htmlFor="resetTime">Horário do Reset</Label>
              <Input
                id="resetTime"
                type="time"
                value={resetTime}
                onChange={(e) => setResetTime(e.target.value)}
                className="w-32"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}
