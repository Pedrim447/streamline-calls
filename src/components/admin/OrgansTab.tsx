import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Building2, Plus, Trash2, Edit } from 'lucide-react';

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

interface Organ {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  unit_id: string;
  created_at: string;
  min_number_normal: number;
  min_number_preferential: number;
}

export function OrgansTab() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [organs, setOrgans] = useState<Organ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrgan, setEditingOrgan] = useState<Organ | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '' });
  const [isSaving, setIsSaving] = useState(false);

  const unitId = profile?.unit_id || DEFAULT_UNIT_ID;

  const fetchOrgans = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('organs')
      .select('*')
      .eq('unit_id', unitId)
      .order('name', { ascending: true });

    if (data) {
      setOrgans(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchOrgans();
  }, [unitId]);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome e código são obrigatórios',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      if (editingOrgan) {
        const { error } = await supabase
          .from('organs')
          .update({ name: formData.name, code: formData.code.toUpperCase() })
          .eq('id', editingOrgan.id);

        if (error) throw error;
        toast({ title: 'Órgão atualizado com sucesso' });
      } else {
        const { error } = await supabase
          .from('organs')
          .insert({
            name: formData.name,
            code: formData.code.toUpperCase(),
            unit_id: unitId,
            is_active: true,
          });

        if (error) throw error;
        toast({ title: 'Órgão criado com sucesso' });
      }

      setIsDialogOpen(false);
      setEditingOrgan(null);
      setFormData({ name: '', code: '' });
      fetchOrgans();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar órgão',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (organ: Organ) => {
    const { error } = await supabase
      .from('organs')
      .update({ is_active: !organ.is_active })
      .eq('id', organ.id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar órgão',
        variant: 'destructive',
      });
    } else {
      fetchOrgans();
    }
  };

  const handleDelete = async (organ: Organ) => {
    if (!confirm(`Deseja realmente excluir o órgão "${organ.name}"?`)) return;

    const { error } = await supabase
      .from('organs')
      .delete()
      .eq('id', organ.id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao excluir órgão. Pode haver senhas vinculadas.',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Órgão excluído com sucesso' });
      fetchOrgans();
    }
  };

  const openEditDialog = (organ: Organ) => {
    setEditingOrgan(organ);
    setFormData({ name: organ.name, code: organ.code });
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingOrgan(null);
    setFormData({ name: '', code: '' });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Órgãos
            </CardTitle>
            <CardDescription>
              Gerencie os órgãos disponíveis para atendimento (TRE, DPU, INSS, etc.)
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Órgão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingOrgan ? 'Editar Órgão' : 'Novo Órgão'}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados do órgão
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Tribunal Regional Eleitoral"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Código (sigla)</Label>
                  <Input
                    id="code"
                    placeholder="Ex: TRE"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    maxLength={10}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {organs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum órgão cadastrado</p>
            <p className="text-sm">Clique em "Novo Órgão" para adicionar</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organs.map((organ) => (
                <TableRow key={organ.id}>
                  <TableCell>
                    <Badge variant="outline">{organ.code}</Badge>
                  </TableCell>
                  <TableCell>{organ.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={organ.is_active}
                      onCheckedChange={() => handleToggleActive(organ)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(organ)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(organ)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}