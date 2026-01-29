import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContextREST';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Shield, Clock, Users, Network } from 'lucide-react';
import { z } from 'zod';
import treLogo from '@/assets/tre-logo.png';

const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres');
const usernameSchema = z.string().min(1, 'Usuário obrigatório');

export default function Auth() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, signIn, signInWithLdap, roles } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageLoaded, setIsPageLoaded] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMethod, setAuthMethod] = useState<'local' | 'ldap'>('ldap');
  
  // Login form - local
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Login form - LDAP
  const [ldapUsername, setLdapUsername] = useState('');
  const [ldapPassword, setLdapPassword] = useState('');

  useEffect(() => {
    // Trigger page load animation
    const timer = setTimeout(() => setIsPageLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user && !authLoading) {
      setIsLoggingIn(true);
      // Redirect based on role
      const isRecepcao = roles.includes('recepcao');
      const targetRoute = isRecepcao ? '/recepcao' : '/dashboard';
      setTimeout(() => navigate(targetRoute), 800);
    }
  }, [user, authLoading, navigate, roles]);

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);

      const { error } = await signIn(loginEmail, loginPassword);
      
      if (error) {
        setError(error.message || 'Erro ao fazer login');
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

  const handleLdapLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      usernameSchema.parse(ldapUsername);
      passwordSchema.parse(ldapPassword);

      const { error } = await signInWithLdap(ldapUsername, ldapPassword);
      
      if (error) {
        setError(error.message || 'Erro na autenticação LDAP');
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
    { icon: Shield, label: 'Seguro' },
    { icon: Clock, label: 'Controle de Fila' },
    { icon: Users, label: 'Multiusuário' },
    { icon: Network, label: 'Integrado ao AD' },
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
    <div className={`min-h-screen flex flex-col items-center justify-center py-8 bg-gradient-to-br from-primary/10 via-background to-accent/5 relative overflow-hidden transition-opacity duration-700 ${isPageLoaded ? 'opacity-100' : 'opacity-0'}`}>
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

      {/* Center content - Logo, Title, Features */}
      <div className={`flex flex-col items-center space-y-6 mb-8 transition-all duration-1000 delay-300 ${isPageLoaded ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
        {/* Logo */}
        <div className={`transition-all duration-1000 delay-200 ${isPageLoaded ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          <div className="relative w-28 h-28">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
            <img 
              src={treLogo} 
              alt="TRE-MA Logo" 
              className="w-28 h-28 object-contain relative z-10 drop-shadow-xl hover:scale-110 transition-transform duration-300"
            />
          </div>
        </div>
        
        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Tribunal Regional Eleitoral
          </h1>
          <p className="text-xl font-medium text-primary">Maranhão</p>
          <p className="text-sm text-muted-foreground">Sistema de Chamada de Senhas</p>
        </div>

        {/* Features - horizontal layout */}
        <div className="flex justify-center gap-6 mt-4">
          {features.map((feature, index) => (
            <div 
              key={feature.label}
              className={`group flex flex-col items-center gap-1 cursor-default transition-all duration-300 ${isPageLoaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
              style={{ transitionDelay: `${600 + index * 100}ms` }}
            >
              <div className="p-2 rounded-xl group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300">
                <feature.icon className="h-5 w-5 text-primary group-hover:text-primary transition-colors duration-300" />
              </div>
              <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors duration-300">{feature.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Login Card */}
      <div className={`w-full max-w-md transition-all duration-1000 delay-500 ${isPageLoaded ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        <div className="bg-card backdrop-blur-xl rounded-2xl shadow-2xl border border-border overflow-hidden">
          {/* Card header with gradient */}
          <div className="h-2 bg-gradient-to-r from-primary via-accent to-primary" />
          
          <div className="px-8 py-6 space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold text-foreground">Acesso ao Sistema</h2>
              <p className="text-sm text-muted-foreground">Entre com suas credenciais</p>
            </div>

            {error && (
              <Alert variant="destructive" className="animate-fade-in">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as 'local' | 'ldap')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ldap" className="gap-2">
                  <Network className="h-4 w-4" />
                  Rede (AD)
                </TabsTrigger>
                <TabsTrigger value="local" className="gap-2">
                  <Shield className="h-4 w-4" />
                  Local
                </TabsTrigger>
              </TabsList>

              {/* LDAP Login */}
              <TabsContent value="ldap">
                <form onSubmit={handleLdapLogin} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="ldap-username" className="text-sm font-medium">Usuário de Rede</Label>
                    <div className="relative group">
                      <Input
                        id="ldap-username"
                        type="text"
                        placeholder="joao.silva"
                        value={ldapUsername}
                        onChange={(e) => setLdapUsername(e.target.value)}
                        disabled={isLoading}
                        required
                        autoComplete="username"
                        className="h-11 text-sm pl-4 pr-4 bg-background/50 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-primary/50"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Use seu login do Windows/Active Directory</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ldap-password" className="text-sm font-medium">Senha de Rede</Label>
                    <div className="relative group">
                      <Input
                        id="ldap-password"
                        type="password"
                        placeholder="••••••••"
                        value={ldapPassword}
                        onChange={(e) => setLdapPassword(e.target.value)}
                        disabled={isLoading}
                        required
                        autoComplete="current-password"
                        className="h-11 text-sm pl-4 pr-4 bg-background/50 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-primary/50"
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-11 text-sm font-semibold relative overflow-hidden group transition-all duration-300 hover:shadow-lg hover:shadow-primary/25" 
                    disabled={isLoading}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Autenticando...
                        </>
                      ) : (
                        <>
                          <Network className="h-4 w-4" />
                          Entrar com Rede
                        </>
                      )}
                    </span>
                  </Button>
                </form>
              </TabsContent>

              {/* Local Login */}
              <TabsContent value="local">
                <form onSubmit={handleLocalLogin} className="space-y-4 mt-4">
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
                        autoComplete="email"
                        className="h-11 text-sm pl-4 pr-4 bg-background/50 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-primary/50"
                      />
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
                        autoComplete="current-password"
                        className="h-11 text-sm pl-4 pr-4 bg-background/50 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-primary/50"
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-11 text-sm font-semibold relative overflow-hidden group transition-all duration-300 hover:shadow-lg hover:shadow-primary/25" 
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
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* API Status indicator */}
        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Conectando a: <code className="bg-muted px-1 py-0.5 rounded text-xs">{import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}</code>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className={`text-center mt-8 transition-all duration-1000 delay-700 ${isPageLoaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} TRE-MA • Sistema de Chamada de Senhas
        </p>
      </div>
    </div>
  );
}
