import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  PhoneForwarded, 
  Monitor, 
  Volume2, 
  Users, 
  Shield,
  ArrowRight
} from 'lucide-react';

const features = [
  {
    icon: PhoneForwarded,
    title: 'Chamada Inteligente',
    description: 'Sistema de fila com prioridades e controle anti-concorrência',
  },
  {
    icon: Monitor,
    title: 'Painel para TV',
    description: 'Exibição em tempo real para monitores públicos',
  },
  {
    icon: Volume2,
    title: 'Chamada por Voz',
    description: 'Anúncio automático em português com Web Speech API',
  },
  {
    icon: Users,
    title: 'Multi-Atendentes',
    description: 'Suporte a múltiplos guichês simultâneos',
  },
  {
    icon: Shield,
    title: 'Auditoria Completa',
    description: 'Registro imutável de todas as ações do sistema',
  },
];

const Index = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/dashboard');
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneForwarded className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">FilaFácil</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/painel">
                <Button variant="ghost">Painel Público</Button>
              </Link>
              <Link to="/auth">
                <Button>Entrar</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Sistema de Chamador de Senhas
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Gerencie filas de atendimento com eficiência. 
            Perfeito para hospitais, órgãos públicos e empresas de grande porte.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Começar Agora
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/painel">
              <Button size="lg" variant="outline">
                Ver Painel Público
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Recursos Principais
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} FilaFácil. Sistema de Gerenciamento de Filas.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
