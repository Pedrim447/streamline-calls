/**
 * API Types
 * 
 * Type definitions for the REST API.
 * These types should match the backend Oracle database schema.
 */

// ============================================
// Enums
// ============================================

export type AppRole = 'admin' | 'attendant' | 'recepcao';
export type TicketStatus = 'waiting' | 'called' | 'in_service' | 'completed' | 'cancelled' | 'skipped';
export type TicketType = 'normal' | 'preferential';

// ============================================
// Base Entity (common fields)
// ============================================

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// User / Profile
// ============================================

export interface User extends BaseEntity {
  user_id: string;
  email: string;
  full_name: string;
  matricula?: string;
  cpf?: string;
  birth_date?: string;
  avatar_url?: string;
  is_active: boolean;
  unit_id?: string;
  last_login_at?: string;
  current_session_id?: string;
}

export interface UserWithRoles extends User {
  roles: AppRole[];
}

export interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  unit_id: string;
  matricula?: string;
  cpf?: string;
  birth_date?: string;
}

export interface UpdateUserRequest {
  full_name?: string;
  matricula?: string;
  cpf?: string;
  birth_date?: string;
  avatar_url?: string;
  is_active?: boolean;
  unit_id?: string;
}

// ============================================
// Authentication
// ============================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LdapLoginRequest {
  username: string;  // LDAP username (e.g., sAMAccountName)
  password: string;
  domain?: string;   // Optional AD domain
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserWithRoles;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================
// Unit
// ============================================

export interface Unit extends BaseEntity {
  name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  voice_enabled: boolean;
  voice_speed: number;
  voice_message_template?: string;
}

export interface UpdateUnitRequest {
  name?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  voice_enabled?: boolean;
  voice_speed?: number;
  voice_message_template?: string;
}

// ============================================
// Settings
// ============================================

export interface Settings extends BaseEntity {
  unit_id: string;
  normal_priority: number;
  preferential_priority: number;
  auto_reset_daily: boolean;
  reset_time?: string;
  lock_timeout_seconds: number;
  max_retry_attempts: number;
}

export interface UpdateSettingsRequest {
  normal_priority?: number;
  preferential_priority?: number;
  auto_reset_daily?: boolean;
  reset_time?: string;
  lock_timeout_seconds?: number;
  max_retry_attempts?: number;
}

// ============================================
// Counter (Guichê)
// ============================================

export interface Counter extends BaseEntity {
  unit_id: string;
  number: number;
  name?: string;
  is_active: boolean;
  current_attendant_id?: string;
}

export interface CreateCounterRequest {
  unit_id: string;
  number: number;
  name?: string;
}

export interface UpdateCounterRequest {
  number?: number;
  name?: string;
  is_active?: boolean;
}

export interface AssignCounterRequest {
  attendant_id: string;
}

// ============================================
// Ticket
// ============================================

export interface Ticket extends BaseEntity {
  unit_id: string;
  ticket_type: TicketType;
  ticket_number: number;
  display_code: string;
  status: TicketStatus;
  priority: number;
  client_name?: string;
  client_cpf?: string;
  attendant_id?: string;
  counter_id?: string;
  called_at?: string;
  service_started_at?: string;
  completed_at?: string;
  skip_reason?: string;
  cancel_reason?: string;
  locked_at?: string;
  locked_by?: string;
}

export interface CreateTicketRequest {
  unit_id: string;
  ticket_type: TicketType;
  client_name?: string;
  client_cpf?: string;
}

export interface CreateTicketResponse {
  ticket: Ticket;
}

export interface CallNextTicketRequest {
  counter_id: string;
  attendant_id: string;
}

export interface CallNextTicketResponse {
  ticket: Ticket;
}

export interface SkipTicketRequest {
  reason: string;
}

export interface TicketFilter {
  unit_id?: string;
  status?: TicketStatus | TicketStatus[];
  ticket_type?: TicketType;
  attendant_id?: string;
  date_from?: string;
  date_to?: string;
}

// ============================================
// Ticket Counter (Daily Sequence)
// ============================================

export interface TicketCounter extends BaseEntity {
  unit_id: string;
  ticket_type: TicketType;
  counter_date: string;
  last_number: number;
}

// ============================================
// Audit Log
// ============================================

export interface AuditLog extends BaseEntity {
  user_id?: string;
  unit_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditLogFilter {
  user_id?: string;
  unit_id?: string;
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
}

// ============================================
// User Role
// ============================================

export interface UserRole extends BaseEntity {
  user_id: string;
  role: AppRole;
}

// ============================================
// WebSocket Events
// ============================================

export interface TicketCalledEvent {
  ticket: Ticket;
  counter: Counter;
}

export interface TicketUpdatedEvent {
  ticket: Ticket;
  action: 'created' | 'called' | 'started' | 'completed' | 'skipped' | 'cancelled';
}

// ============================================
// API Error
// ============================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
