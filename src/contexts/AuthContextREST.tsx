/**
 * Authentication Context with JWT/LDAP Support
 * 
 * Provides authentication state and methods for the application.
 * Designed for on-premise deployment with LDAP/Active Directory integration.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '@/services/auth.service';
import type { UserWithRoles, AppRole, LoginRequest, LdapLoginRequest } from '@/types/api.types';

interface AuthContextType {
  user: UserWithRoles | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAttendant: boolean;
  isRecepcao: boolean;
  profile: UserWithRoles | null; // Alias for user, for compatibility
  roles: AppRole[];
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithLdap: (username: string, password: string, domain?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserWithRoles | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (authService.isAuthenticated()) {
        const { data, error } = await authService.getCurrentUser();
        if (data && !error) {
          setUser(data);
        } else {
          // Token invalid, clear it
          await authService.logout();
        }
      }
      setIsLoading(false);
    };

    checkAuth();

    // Listen for logout events (e.g., token expiration)
    const handleLogout = () => {
      setUser(null);
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string): Promise<{ error: Error | null }> => {
    const credentials: LoginRequest = { email, password };
    const { data, error } = await authService.login(credentials);
    
    if (data?.user) {
      setUser(data.user);
      return { error: null };
    }
    
    return { error: new Error(error || 'Falha na autenticação') };
  }, []);

  // Sign in with LDAP/Active Directory
  const signInWithLdap = useCallback(async (
    username: string,
    password: string,
    domain?: string
  ): Promise<{ error: Error | null }> => {
    const credentials: LdapLoginRequest = { username, password, domain };
    const { data, error } = await authService.ldapLogin(credentials);
    
    if (data?.user) {
      setUser(data.user);
      return { error: null };
    }
    
    return { error: new Error(error || 'Falha na autenticação LDAP') };
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  // Refresh profile
  const refreshProfile = useCallback(async () => {
    if (authService.isAuthenticated()) {
      const { data } = await authService.getCurrentUser();
      if (data) {
        setUser(data);
      }
    }
  }, []);

  // Derived values
  const isAuthenticated = !!user;
  const roles = user?.roles || [];
  const isAdmin = roles.includes('admin');
  const isAttendant = roles.includes('attendant') || isAdmin;
  const isRecepcao = roles.includes('recepcao') || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        isAdmin,
        isAttendant,
        isRecepcao,
        profile: user, // Alias for compatibility
        roles,
        signIn,
        signInWithLdap,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
