import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Monitor, Edit2, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Counter = Database['public']['Tables']['counters']['Row'];

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

export function CountersTab() {
  const { toast } = useToast();
  const [counters, setCounters] = useState<Counter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null);
  
  // Form state
  const [formNumber, setFormNumber] = useState('');
  const [formName, setFormName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCounters = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('counters')
      .select('*')
      .eq('unit_id', DEFAULT_UNIT_ID)
      .order('number');

    if (error) {
      console.error('Error fetching counters:', error);
    } else {
      setCounters(data || []);
    }
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCounters();
  }, []);

  const handleCreateCounter = async () => {
    if (!formNumber) {
      toast({
        title: 'Erro',
        description: 'Informe o número do guichê',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingCounter) {
        // Update existing
        const { error } = await supabase
          .from('counters')
          .update({
            number: parseInt(formNumber),
            name: formName || `Guichê ${formNumber}`,
          })
          .eq('id', editingCounter.id);

        if (error) throw error;

        toast({
          title: 'Sucesso',
          description: 'Guichê atualizado',
        });
      } else {
        // Create new
        const { error } = await supabase
          .from('counters')
          .insert({
            unit_id: DEFAULT_UNIT_ID,
            number: parseInt(formNumber),
            name: formName || `Guichê ${formNumber}`,
            is_active: true,
          });

        if (error) throw error;

        toast({
          title: 'Sucesso',
          description: 'Guichê criado',
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchCounters();
    } catch (err: any) {
      console.error('Error saving counter:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao salvar guichê',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (counter: Counter) => {
    const { error } = await supabase
      .from('counters')
      .update({ is_active: !counter.is_active })
      .eq('id', counter.id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar status',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Sucesso',
      description: `Guichê ${counter.is_active ? 'desativado' : 'ativado'}`,
    });
    
    fetchCounters();
  };

  const handleDeleteCounter = async (counter: Counter) => {
    if (counter.current_attendant_id) {
      toast({
        title: 'Erro',
        description: 'Não é possível excluir um guichê em uso',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('counters')
      .delete()
      .eq('id', counter.id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao excluir guichê',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Sucesso',
      description: 'Guichê excluído',
    });
    
    fetchCounters();
  };

  const handleEdit = (counter: Counter) => {
    setEditingCounter(counter);
    setFormNumber(counter.number.toString());
    setFormName(counter.name || '');
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormNumber('');
    setFormName('');
    setEditingCounter(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gerenciar Guichês</CardTitle>
            <CardDescription>
              Configure os guichês de atendimento da unidade
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Guichê
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCounter ? 'Editar Guichê' : 'Criar Novo Guichê'}
                </DialogTitle>
                <DialogDescription>
                  Configure o número e nome do guichê
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="number">Número *</Label>
                  <Input
                    id="number"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={formNumber}
                    onChange={(e) => setFormNumber(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name">Nome (opcional)</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Caixa 1, Atendimento Geral..."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateCounter} disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : (editingCounter ? 'Salvar' : 'Criar')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {counters.length === 0 ? (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum guichê cadastrado</p>
            </div>
          ) : (
            counters.map((counter) => (
              <div
                key={counter.id}
                className={`p-4 rounded-lg border ${
                  counter.is_active 
                    ? 'bg-card border-border' 
                    : 'bg-muted/30 border-muted'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${
                      counter.is_active ? 'bg-primary/10' : 'bg-muted'
                    }`}>
                      <Monitor className={`h-5 w-5 ${
                        counter.is_active ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div>
                      <div className="font-bold text-lg">
                        Guichê {counter.number}
                      </div>
                      {counter.name && counter.name !== `Guichê ${counter.number}` && (
                        <div className="text-sm text-muted-foreground">
                          {counter.name}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(counter)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteCounter(counter)}
                      disabled={!!counter.current_attendant_id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    {counter.current_attendant_id ? (
                      <Badge variant="secondary">Em uso</Badge>
                    ) : counter.is_active ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Disponível
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${counter.id}`} className="text-sm">
                      Ativo
                    </Label>
                    <Switch
                      id={`active-${counter.id}`}
                      checked={counter.is_active ?? false}
                      onCheckedChange={() => handleToggleActive(counter)}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
