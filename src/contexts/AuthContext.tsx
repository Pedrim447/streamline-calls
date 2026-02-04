import React, { createContext, useContext, useEffect, useState } from 'react';
import * as localDb from '@/lib/localDatabase';

type AppRole = localDb.AppRole;

interface Profile {
  id: string;
  user_id: string;
  unit_id: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  current_session_id: string | null;
}

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  session: any | null;
  profile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  isAdmin: boolean;
  isAttendant: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      const profileData = await localDb.getProfile(userId);
      if (profileData) {
        setProfile(profileData);
      }

      const rolesData = await localDb.getUserRoles(userId);
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      // Initialize database
      await localDb.initializeDatabase();
      
      // Check for existing session
      const currentUser = await localDb.getCurrentUser();
      
      if (currentUser) {
        setUser({ id: currentUser.id, email: currentUser.email });
        await fetchUserData(currentUser.id);
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { user: localUser, error } = await localDb.signIn(email, password);
    
    if (error) {
      return { error: new Error(error) };
    }
    
    if (localUser) {
      setUser({ id: localUser.id, email: localUser.email });
      await fetchUserData(localUser.id);
    }
    
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { user: localUser, error } = await localDb.signUp(email, password, fullName);
    
    if (error) {
      return { error: new Error(error) };
    }
    
    if (localUser) {
      setUser({ id: localUser.id, email: localUser.email });
      await fetchUserData(localUser.id);
    }
    
    return { error: null };
  };

  const signOut = async () => {
    localDb.signOut();
    setUser(null);
    setProfile(null);
    setRoles([]);
  };

  const isAdmin = roles.includes('admin');
  const isAttendant = roles.includes('attendant') || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        session: user ? {} : null,
        profile,
        roles,
        isLoading,
        isAdmin,
        isAttendant,
        signIn,
        signUp,
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
