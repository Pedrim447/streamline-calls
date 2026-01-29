/**
 * Authentication Service
 * 
 * Handles user authentication with JWT and LDAP/AD integration.
 */

import api from '@/lib/api';
import { API_CONFIG } from '@/config/api.config';
import type {
  LoginRequest,
  LdapLoginRequest,
  LoginResponse,
  RefreshTokenResponse,
  UserWithRoles,
} from '@/types/api.types';

class AuthService {
  /**
   * Login with email and password
   */
  async login(credentials: LoginRequest): Promise<{ data?: LoginResponse; error?: string }> {
    const response = await api.post<LoginResponse>(
      API_CONFIG.ENDPOINTS.AUTH.LOGIN,
      credentials,
      { skipAuth: true }
    );
    
    if (response.success && response.data) {
      api.setTokens(response.data.accessToken, response.data.refreshToken);
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha na autenticação' };
  }

  /**
   * Login with LDAP/Active Directory
   */
  async ldapLogin(credentials: LdapLoginRequest): Promise<{ data?: LoginResponse; error?: string }> {
    const response = await api.post<LoginResponse>(
      API_CONFIG.ENDPOINTS.AUTH.LDAP_LOGIN,
      credentials,
      { skipAuth: true }
    );
    
    if (response.success && response.data) {
      api.setTokens(response.data.accessToken, response.data.refreshToken);
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha na autenticação LDAP' };
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await api.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT);
    } catch {
      // Ignore logout errors
    } finally {
      api.clearTokens();
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ data?: RefreshTokenResponse; error?: string }> {
    const response = await api.post<RefreshTokenResponse>(
      API_CONFIG.ENDPOINTS.AUTH.REFRESH,
      { refreshToken },
      { skipAuth: true }
    );
    
    if (response.success && response.data) {
      api.setTokens(response.data.accessToken, response.data.refreshToken);
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao renovar token' };
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<{ data?: UserWithRoles; error?: string }> {
    const response = await api.get<UserWithRoles>(API_CONFIG.ENDPOINTS.AUTH.ME);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao obter usuário' };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return api.isAuthenticated();
  }

  /**
   * Get stored token
   */
  getToken(): string | null {
    return localStorage.getItem(API_CONFIG.TOKEN_KEY);
  }
}

export const authService = new AuthService();
export default authService;
