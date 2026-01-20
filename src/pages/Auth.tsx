import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users, Shield, Zap, Volume2, Clock, BarChart3 } from 'lucide-react';
import { z } from 'zod';
import treLogo from '@/assets/tre-logo.png';

const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres');

export default function Auth() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, signIn } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageLoaded, setIsPageLoaded] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    // Trigger page load animation
    const timer = setTimeout(() => setIsPageLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user && !authLoading) {
      setIsLoggingIn(true);
      setTimeout(() => navigate('/dashboard'), 800);
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);

      const { error } = await signIn(loginEmail, loginPassword);
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('Email ou senha incorretos');
        } else {
          setError(error.message);
        }
        setIsLoading(false);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError('Erro ao fazer login');
      }
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Users, label: 'Multi-atendente' },
    { icon: Shield, label: 'Seguro' },
    { icon: Zap, label: 'Tempo Real' },
    { icon: Volume2, label: 'Chamada por Voz' },
    { icon: Clock, label: 'Controle de Fila' },
    { icon: BarChart3, label: 'Relatórios' },
  ];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full h-16 w-16 bg-primary/20" />
          <Loader2 className="h-16 w-16 animate-spin text-primary relative z-10" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/5 relative overflow-hidden transition-opacity duration-700 ${isPageLoaded ? 'opacity-100' : 'opacity-0'}`}>
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Login success overlay */}
      <div className={`fixed inset-0 bg-primary z-50 flex items-center justify-center transition-all duration-700 ${isLoggingIn ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto bg-primary-foreground/20 rounded-full flex items-center justify-center animate-bounce">
            <svg className="w-12 h-12 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-primary-foreground text-2xl font-semibold animate-pulse">Entrando...</p>
        </div>
      </div>

      {/* Main content - Two column layout */}
      <div className={`relative z-10 w-full max-w-5xl flex flex-col lg:flex-row items-center gap-8 lg:gap-16 transition-all duration-1000 ${isPageLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        
        {/* Left side - Features */}
        <div className={`flex-1 space-y-8 transition-all duration-1000 delay-300 ${isPageLoaded ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'}`}>
          <div className="text-center lg:text-left space-y-4">
            <div className={`transition-all duration-1000 delay-200 ${isPageLoaded ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
              <div className="relative mx-auto lg:mx-0 w-32 h-32 mb-6">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                <img 
                  src={treLogo} 
                  alt="TRE-MA Logo" 
                  className="w-32 h-32 object-contain relative z-10 drop-shadow-xl hover:scale-110 transition-transform duration-300"
                />
              </div>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Tribunal Regional Eleitoral
            </h1>
            <p className="text-xl font-medium text-primary">Maranhão</p>
            <p className="text-base text-muted-foreground">Sistema de Chamada de Senhas</p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <div 
                key={feature.label}
                className={`group flex items-center gap-4 p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 cursor-default hover:bg-primary/5 hover:border-primary/30 transition-all duration-300 ${isPageLoaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
                style={{ transitionDelay: `${600 + index * 100}ms` }}
              >
                <div className="p-4 bg-primary/10 rounded-xl group-hover:bg-primary group-hover:scale-110 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/25">
                  <feature.icon className="h-7 w-7 text-primary group-hover:text-primary-foreground transition-colors duration-300" />
                </div>
                <span className="text-base font-medium text-foreground group-hover:text-primary transition-colors duration-300">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right side - Login Card */}
        <div className={`w-full lg:w-[420px] transition-all duration-1000 delay-500 ${isPageLoaded ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-10 opacity-0 scale-95'}`}>
          <div className="bg-card/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
            {/* Card header with gradient */}
            <div className="h-2 bg-gradient-to-r from-primary via-accent to-primary" />
            
            <form onSubmit={handleLogin} className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">Acesso ao Sistema</h2>
                <p className="text-sm text-muted-foreground">Entre com suas credenciais</p>
              </div>

              {error && (
                <Alert variant="destructive" className="animate-fade-in">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-medium">Email</Label>
                  <div className="relative group">
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      disabled={isLoading}
                      required
                      className="h-12 pl-4 pr-4 bg-background/50 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-primary/50"
                    />
                    <div className="absolute inset-0 rounded-md bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-sm font-medium">Senha</Label>
                  <div className="relative group">
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      className="h-12 pl-4 pr-4 bg-background/50 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-primary/50"
                    />
                    <div className="absolute inset-0 rounded-md bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold relative overflow-hidden group transition-all duration-300 hover:shadow-lg hover:shadow-primary/25" 
                disabled={isLoading}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Button>
            </form>
          </div>

          {/* Footer */}
          <div className={`text-center mt-6 transition-all duration-1000 delay-700 ${isPageLoaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} TRE-MA • Sistema de Chamada de Senhas
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
