import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  Monitor, 
  Settings, 
  FileText,
  LogOut,
  Shield,
  ArrowLeft,
  Tv
} from 'lucide-react';
import { AttendantsTab } from '@/components/admin/AttendantsTab';
import { CountersTab } from '@/components/admin/CountersTab';
import { SettingsTab } from '@/components/admin/SettingsTab';
import { AuditLogsTab } from '@/components/admin/AuditLogsTab';

export default function Admin() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, isLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('attendants');

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (!isLoading && user && !isAdmin) {
      navigate('/dashboard');
    }
  }, [user, isAdmin, isLoading, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-16 w-16 mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Acesso Negado</h1>
          <p className="text-muted-foreground mb-4">
            Você não tem permissão para acessar esta área.
          </p>
          <Button onClick={() => navigate('/dashboard')}>
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold text-foreground">
                  Painel Administrativo
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {profile?.full_name}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.open('/painel', '_blank')}
                title="Abrir Painel TV"
              >
                <Tv className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="attendants" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Atendentes</span>
            </TabsTrigger>
            <TabsTrigger value="counters" className="gap-2">
              <Monitor className="h-4 w-4" />
              <span className="hidden sm:inline">Guichês</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurações</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendants">
            <AttendantsTab />
          </TabsContent>

          <TabsContent value="counters">
            <CountersTab />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>

          <TabsContent value="logs">
            <AuditLogsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
