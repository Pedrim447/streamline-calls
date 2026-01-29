/**
 * API Configuration for On-Premise Backend
 * 
 * This configuration defines the API endpoints for the on-premise backend.
 * The backend should be a Node.js/Express or NestJS server with:
 * - JWT authentication (integrated with LDAP/AD)
 * - Oracle database connection
 * - Audit logging middleware
 */

export const API_CONFIG = {
  // Base URL for the API - configure this for your on-premise environment
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  
  // API version
  VERSION: 'v1',
  
  // Request timeout in milliseconds
  TIMEOUT: 30000,
  
  // Token storage key
  TOKEN_KEY: 'filafacil_token',
  REFRESH_TOKEN_KEY: 'filafacil_refresh_token',
  
  // Endpoints
  ENDPOINTS: {
    // Authentication
    AUTH: {
      LOGIN: '/auth/login',
      LOGOUT: '/auth/logout',
      REFRESH: '/auth/refresh',
      ME: '/auth/me',
      LDAP_LOGIN: '/auth/ldap',
    },
    
    // Users/Profiles
    USERS: {
      BASE: '/users',
      PROFILE: '/users/profile',
      ROLES: '/users/roles',
    },
    
    // Tickets
    TICKETS: {
      BASE: '/tickets',
      CREATE: '/tickets',
      CALL_NEXT: '/tickets/call-next',
      REPEAT_CALL: '/tickets/:id/repeat',
      START_SERVICE: '/tickets/:id/start',
      COMPLETE: '/tickets/:id/complete',
      SKIP: '/tickets/:id/skip',
      CANCEL: '/tickets/:id/cancel',
    },
    
    // Counters (Guichês)
    COUNTERS: {
      BASE: '/counters',
      ASSIGN: '/counters/:id/assign',
      RELEASE: '/counters/:id/release',
    },
    
    // Units
    UNITS: {
      BASE: '/units',
      SETTINGS: '/units/:id/settings',
    },
    
    // Settings
    SETTINGS: {
      BASE: '/settings',
    },
    
    // Audit Logs
    AUDIT: {
      BASE: '/audit-logs',
    },
    
    // Ticket Counters (daily sequence)
    TICKET_COUNTERS: {
      BASE: '/ticket-counters',
      RESET: '/ticket-counters/reset',
    },
  },
  
  // Headers
  HEADERS: {
    CONTENT_TYPE: 'application/json',
    AUTHORIZATION: 'Authorization',
    X_REQUEST_ID: 'X-Request-ID',
    X_CLIENT_INFO: 'X-Client-Info',
  },
};

// Build full URL helper
export function buildUrl(endpoint: string, params?: Record<string, string>): string {
  let url = `${API_CONFIG.BASE_URL}/${API_CONFIG.VERSION}${endpoint}`;
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, value);
    });
  }
  
  return url;
}

export default API_CONFIG;
