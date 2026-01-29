/**
 * Users Service
 * 
 * Handles all user/profile related API operations.
 */

import api from '@/lib/api';
import { API_CONFIG } from '@/config/api.config';
import type {
  User,
  UserWithRoles,
  CreateUserRequest,
  UpdateUserRequest,
  UserRole,
  AppRole,
} from '@/types/api.types';

class UsersService {
  /**
   * Get all users
   */
  async getUsers(): Promise<{ data?: UserWithRoles[]; error?: string }> {
    const response = await api.get<UserWithRoles[]>(API_CONFIG.ENDPOINTS.USERS.BASE);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao buscar usuários' };
  }

  /**
   * Get a single user by ID
   */
  async getUser(id: string): Promise<{ data?: UserWithRoles; error?: string }> {
    const response = await api.get<UserWithRoles>(`${API_CONFIG.ENDPOINTS.USERS.BASE}/${id}`);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Usuário não encontrado' };
  }

  /**
   * Create a new user
   */
  async createUser(request: CreateUserRequest): Promise<{ data?: User; error?: string }> {
    const response = await api.post<User>(API_CONFIG.ENDPOINTS.USERS.BASE, request);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao criar usuário' };
  }

  /**
   * Update a user
   */
  async updateUser(id: string, request: UpdateUserRequest): Promise<{ data?: User; error?: string }> {
    const response = await api.patch<User>(
      `${API_CONFIG.ENDPOINTS.USERS.BASE}/${id}`,
      request
    );
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao atualizar usuário' };
  }

  /**
   * Toggle user active status
   */
  async toggleUserActive(id: string, isActive: boolean): Promise<{ data?: User; error?: string }> {
    return this.updateUser(id, { is_active: isActive });
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<{ data?: UserRole[]; error?: string }> {
    const response = await api.get<UserRole[]>(`${API_CONFIG.ENDPOINTS.USERS.ROLES}/${userId}`);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao buscar permissões' };
  }

  /**
   * Update user role
   */
  async updateUserRole(userId: string, role: AppRole): Promise<{ success: boolean; error?: string }> {
    const response = await api.put(`${API_CONFIG.ENDPOINTS.USERS.ROLES}/${userId}`, { role });
    
    if (response.success) {
      return { success: true };
    }
    
    return { success: false, error: response.error || 'Falha ao atualizar permissão' };
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<{ data?: UserWithRoles; error?: string }> {
    const response = await api.get<UserWithRoles>(API_CONFIG.ENDPOINTS.USERS.PROFILE);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao buscar perfil' };
  }

  /**
   * Update current user profile
   */
  async updateProfile(request: UpdateUserRequest): Promise<{ data?: User; error?: string }> {
    const response = await api.patch<User>(API_CONFIG.ENDPOINTS.USERS.PROFILE, request);
    
    if (response.success && response.data) {
      return { data: response.data };
    }
    
    return { error: response.error || 'Falha ao atualizar perfil' };
  }
}

export const usersService = new UsersService();
export default usersService;
