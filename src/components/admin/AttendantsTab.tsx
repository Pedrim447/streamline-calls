import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Shield, User, Users, Building2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];

interface ProfileWithRoles extends Profile {
  roles: AppRole[];
  organ_ids: string[];
}

interface Organ {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

const DEFAULT_UNIT_ID = "a0000000-0000-0000-0000-000000000001";

const roleLabels: Record<AppRole, string> = {
  admin: "Administrador",
  attendant: "Atendente",
  recepcao: "Recepção",
  painel: "Painel TV",
};

const roleBadgeVariants: Record<AppRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  attendant: "secondary",
  recepcao: "outline",
  painel: "outline",
};

export function AttendantsTab() {
  const { toast } = useToast();
  const { profile: authProfile } = useAuth();
  const [profiles, setProfiles] = useState<ProfileWithRoles[]>([]);
  const [organs, setOrgans] = useState<Organ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOrgansDialogOpen, setIsOrgansDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileWithRoles | null>(null);
  const [selectedOrgans, setSelectedOrgans] = useState<string[]>([]);

  // Form state
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<AppRole>("attendant");
  const [formMatricula, setFormMatricula] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formBirthDate, setFormBirthDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const unitId = authProfile?.unit_id || DEFAULT_UNIT_ID;

  const fetchOrgans = async () => {
    const { data } = await supabase
      .from('organs')
      .select('*')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('name');
    
    if (data) {
      setOrgans(data);
    }
  };

  const fetchProfiles = async () => {
    setIsLoading(true);

    // Fetch profiles
    const { data: profilesData, error: profilesError } = await supabase.from("profiles").select("*").order("full_name");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      setIsLoading(false);
      return;
    }

    // Fetch roles for each profile
    const { data: rolesData, error: rolesError } = await supabase.from("user_roles").select("*");

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
    }

    // Fetch organ assignments for each profile
    const { data: attendantOrgansData } = await supabase.from("attendant_organs").select("*");

    const profilesWithRoles: ProfileWithRoles[] = (profilesData || []).map((profile) => ({
      ...profile,
      roles: (rolesData || []).filter((r) => r.user_id === profile.user_id).map((r) => r.role),
      organ_ids: (attendantOrgansData || []).filter((ao) => ao.user_id === profile.user_id).map((ao) => ao.organ_id),
    }));

    setProfiles(profilesWithRoles);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
    fetchOrgans();
  }, [unitId]);

  const openOrgansDialog = (profile: ProfileWithRoles) => {
    setSelectedProfile(profile);
    setSelectedOrgans(profile.organ_ids);
    setIsOrgansDialogOpen(true);
  };

  const handleSaveOrgans = async () => {
    if (!selectedProfile) return;
    
    setIsSubmitting(true);
    
    try {
      // Remove all existing organ assignments
      await supabase
        .from('attendant_organs')
        .delete()
        .eq('user_id', selectedProfile.user_id);
      
      // Add new assignments
      if (selectedOrgans.length > 0) {
        const { error } = await supabase
          .from('attendant_organs')
          .insert(
            selectedOrgans.map(organId => ({
              user_id: selectedProfile.user_id,
              organ_id: organId,
            }))
          );
        
        if (error) throw error;
      }
      
      toast({
        title: 'Sucesso',
        description: 'Órgãos atualizados com sucesso',
      });
      
      setIsOrgansDialogOpen(false);
      fetchProfiles();
    } catch (error) {
      console.error('Error saving organs:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao salvar órgãos',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleOrgan = (organId: string) => {
    setSelectedOrgans(prev => 
      prev.includes(organId) 
        ? prev.filter(id => id !== organId)
        : [...prev, organId]
    );
  };

  // Format CPF as user types
  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormCpf(formatCpf(e.target.value));
  };

  const handleCreateUser = async () => {
    if (!formEmail || !formName || !formPassword) {
      toast({
        title: "Erro",
        description: "Preencha os campos obrigatórios (nome, email e senha)",
        variant: "destructive",
      });
      return;
    }

    if (formPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create user via edge function
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: formEmail,
          password: formPassword,
          full_name: formName,
          role: formRole,
          unit_id: DEFAULT_UNIT_ID,
          matricula: formMatricula || undefined,
          cpf: formCpf || undefined,
          birth_date: formBirthDate || undefined,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Erro",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Sucesso",
        description: "Usuário criado com sucesso",
      });

      setIsDialogOpen(false);
      resetForm();
      fetchProfiles();
    } catch (err) {
      console.error("Error creating user:", err);
      toast({
        title: "Erro",
        description: "Falha ao criar usuário",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (profile: ProfileWithRoles) => {
    const { error } = await supabase.from("profiles").update({ is_active: !profile.is_active }).eq("id", profile.id);

    if (error) {
      toast({
        title: "Erro",
        description: "Falha ao atualizar status",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Sucesso",
      description: `Usuário ${profile.is_active ? "desativado" : "ativado"}`,
    });

    fetchProfiles();
  };

  const handleUpdateRole = async (profile: ProfileWithRoles, newRole: AppRole) => {
    // Remove old roles
    await supabase.from("user_roles").delete().eq("user_id", profile.user_id);

    // Add new role
    const { error } = await supabase.from("user_roles").insert({ user_id: profile.user_id, role: newRole });

    if (error) {
      toast({
        title: "Erro",
        description: "Falha ao atualizar permissão",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Sucesso",
      description: "Permissão atualizada",
    });

    fetchProfiles();
  };

  const resetForm = () => {
    setFormEmail("");
    setFormName("");
    setFormPassword("");
    setFormRole("attendant");
    setFormMatricula("");
    setFormCpf("");
    setFormBirthDate("");
  };

  const getRoleIcon = (role: AppRole) => {
    switch (role) {
      case "admin":
        return <Shield className="h-5 w-5 text-primary" />;
      case "recepcao":
        return <Users className="h-5 w-5 text-blue-500" />;
      default:
        return <User className="h-5 w-5 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
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
            <CardTitle>Gerenciar Usuários</CardTitle>
            <CardDescription>Adicione, edite ou remova usuários do sistema</CardDescription>
          </div>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
                <DialogDescription>Preencha os dados para criar um novo usuário no sistema</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Nome Completo *</Label>
                    <Input
                      id="name"
                      placeholder="João da Silva"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="matricula">Matrícula</Label>
                    <Input
                      id="matricula"
                      placeholder="123456"
                      value={formMatricula}
                      onChange={(e) => setFormMatricula(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      placeholder="000.000.000-00"
                      value={formCpf}
                      onChange={handleCpfChange}
                      maxLength={14}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birth_date">Data de Nascimento</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={formBirthDate}
                      onChange={(e) => setFormBirthDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Tipo de Usuário *</Label>
                    <Select value={formRole} onValueChange={(v) => setFormRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="attendant">Atendente</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="recepcao">Recepção</SelectItem>
                        <SelectItem value="painel">Painel TV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="joao@exemplo.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="password">Senha *</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">* Campos obrigatórios</p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateUser} disabled={isSubmitting}>
                  {isSubmitting ? "Criando..." : "Criar Usuário"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {profiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum usuário cadastrado</p>
            </div>
          ) : (
            profiles.map((profile) => {
              const primaryRole = profile.roles[0] || "attendant";
              return (
                <div key={profile.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        primaryRole === "admin"
                          ? "bg-primary/10"
                          : primaryRole === "recepcao"
                            ? "bg-blue-500/10"
                            : "bg-muted"
                      }`}
                    >
                      {getRoleIcon(primaryRole)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{profile.full_name}</span>
                        <Badge variant={roleBadgeVariants[primaryRole]} className="text-xs">
                          {roleLabels[primaryRole]}
                        </Badge>
                        {!profile.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{profile.email}</span>
                        {(profile as any).matricula && <span>• Mat: {(profile as any).matricula}</span>}
                        {profile.organ_ids.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {organs.filter(o => profile.organ_ids.includes(o.id)).map(o => o.code).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Select value={primaryRole} onValueChange={(v) => handleUpdateRole(profile, v as AppRole)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="attendant">Atendente</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="recepcao">Recepção</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${profile.id}`} className="text-sm">
                        Ativo
                      </Label>
                      <Switch
                        id={`active-${profile.id}`}
                        checked={profile.is_active ?? false}
                        onCheckedChange={() => handleToggleActive(profile)}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
