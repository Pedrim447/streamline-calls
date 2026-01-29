/**
 * HTTP API Client
 * 
 * A lightweight HTTP client for REST API communication.
 * Handles JWT authentication, token refresh, and audit headers.
 */

import { API_CONFIG, buildUrl } from '@/config/api.config';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl = `${API_CONFIG.BASE_URL}/${API_CONFIG.VERSION}`;
    this.timeout = API_CONFIG.TIMEOUT;
  }

  // Get stored token
  private getToken(): string | null {
    return localStorage.getItem(API_CONFIG.TOKEN_KEY);
  }

  // Get refresh token
  private getRefreshToken(): string | null {
    return localStorage.getItem(API_CONFIG.REFRESH_TOKEN_KEY);
  }

  // Store tokens
  public setTokens(accessToken: string, refreshToken?: string): void {
    localStorage.setItem(API_CONFIG.TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(API_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  // Clear tokens
  public clearTokens(): void {
    localStorage.removeItem(API_CONFIG.TOKEN_KEY);
    localStorage.removeItem(API_CONFIG.REFRESH_TOKEN_KEY);
  }

  // Check if user is authenticated
  public isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    
    try {
      // Check if token is expired (JWT payload)
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  // Generate request ID for audit trail
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Build headers
  private buildHeaders(options?: RequestOptions): Headers {
    const headers = new Headers();
    
    headers.set(API_CONFIG.HEADERS.CONTENT_TYPE, 'application/json');
    headers.set(API_CONFIG.HEADERS.X_REQUEST_ID, this.generateRequestId());
    headers.set(API_CONFIG.HEADERS.X_CLIENT_INFO, 'filafacil-web/1.0');
    
    // Add auth token if available and not skipped
    if (!options?.skipAuth) {
      const token = this.getToken();
      if (token) {
        headers.set(API_CONFIG.HEADERS.AUTHORIZATION, `Bearer ${token}`);
      }
    }
    
    // Merge custom headers
    if (options?.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    
    return headers;
  }

  // Build URL with query params
  private buildUrlWithQuery(endpoint: string, options?: RequestOptions): string {
    let url = options?.params 
      ? buildUrl(endpoint, options.params)
      : `${this.baseUrl}${endpoint}`;
    
    if (options?.query) {
      const params = new URLSearchParams();
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    
    return url;
  }

  // Handle response
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type');
    
    if (!response.ok) {
      // Handle 401 - try to refresh token
      if (response.status === 401) {
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          this.clearTokens();
          window.dispatchEvent(new CustomEvent('auth:logout'));
        }
      }
      
      let errorMessage = 'Erro na requisição';
      
      if (contentType?.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // Ignore parsing errors
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        statusCode: response.status,
      };
    }
    
    if (contentType?.includes('application/json')) {
      try {
        const data = await response.json();
        return {
          success: true,
          data,
          statusCode: response.status,
        };
      } catch {
        return {
          success: true,
          statusCode: response.status,
        };
      }
    }
    
    return {
      success: true,
      statusCode: response.status,
    };
  }

  // Refresh token
  private async refreshToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    
    try {
      const response = await fetch(`${this.baseUrl}${API_CONFIG.ENDPOINTS.AUTH.REFRESH}`, {
        method: 'POST',
        headers: {
          [API_CONFIG.HEADERS.CONTENT_TYPE]: 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });
      
      if (response.ok) {
        const data = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }
    } catch {
      // Ignore refresh errors
    }
    
    return false;
  }

  // GET request
  async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(this.buildUrlWithQuery(endpoint, options), {
        method: 'GET',
        headers: this.buildHeaders(options),
        signal: options?.signal || controller.signal,
      });
      
      return this.handleResponse<T>(response);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { success: false, error: 'Tempo limite excedido' };
      }
      return { success: false, error: 'Erro de conexão' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // POST request
  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(this.buildUrlWithQuery(endpoint, options), {
        method: 'POST',
        headers: this.buildHeaders(options),
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal || controller.signal,
      });
      
      return this.handleResponse<T>(response);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { success: false, error: 'Tempo limite excedido' };
      }
      return { success: false, error: 'Erro de conexão' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // PUT request
  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(this.buildUrlWithQuery(endpoint, options), {
        method: 'PUT',
        headers: this.buildHeaders(options),
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal || controller.signal,
      });
      
      return this.handleResponse<T>(response);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { success: false, error: 'Tempo limite excedido' };
      }
      return { success: false, error: 'Erro de conexão' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // PATCH request
  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(this.buildUrlWithQuery(endpoint, options), {
        method: 'PATCH',
        headers: this.buildHeaders(options),
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal || controller.signal,
      });
      
      return this.handleResponse<T>(response);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { success: false, error: 'Tempo limite excedido' };
      }
      return { success: false, error: 'Erro de conexão' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // DELETE request
  async delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(this.buildUrlWithQuery(endpoint, options), {
        method: 'DELETE',
        headers: this.buildHeaders(options),
        signal: options?.signal || controller.signal,
      });
      
      return this.handleResponse<T>(response);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { success: false, error: 'Tempo limite excedido' };
      }
      return { success: false, error: 'Erro de conexão' };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Export singleton instance
export const api = new ApiClient();
export default api;
