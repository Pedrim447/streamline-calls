// Local IndexedDB Database Layer
// Replaces Supabase for fully offline operation

const DB_NAME = 'CallFlowDB';
const DB_VERSION = 1;

// Types
export type AppRole = 'admin' | 'attendant' | 'reception' | 'painel';
export type TicketStatus = 'waiting' | 'called' | 'in_service' | 'completed' | 'cancelled' | 'skipped';
export type TicketType = 'normal' | 'preferential';

export interface Unit {
  id: string;
  name: string;
  code: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  unit_id: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  current_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Counter {
  id: string;
  unit_id: string;
  number: number;
  name: string | null;
  is_active: boolean;
  current_attendant_id: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  unit_id: string;
  ticket_type: TicketType;
  ticket_number: number;
  display_code: string;
  status: TicketStatus;
  priority: number;
  client_name: string | null;
  client_cpf: string | null;
  attendant_id: string | null;
  counter_id: string | null;
  called_at: string | null;
  service_started_at: string | null;
  completed_at: string | null;
  skip_reason: string | null;
  service_type: string | null;
  completion_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketCounter {
  id: string;
  unit_id: string;
  ticket_type: TicketType;
  counter_date: string;
  last_number: number;
  created_at: string;
}

export interface Settings {
  id: string;
  unit_id: string;
  normal_priority: number;
  preferential_priority: number;
  manual_mode_enabled: boolean;
  manual_mode_min_number: number;
  manual_mode_min_number_preferential: number;
  calling_system_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface LocalUser {
  id: string;
  email: string;
  password: string; // In production, use proper hashing
  created_at: string;
}

// Event system for realtime-like updates
type EventCallback = (data: any) => void;
const eventListeners: Map<string, Set<EventCallback>> = new Map();

export function subscribeToEvent(event: string, callback: EventCallback): () => void {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event)!.add(callback);
  
  return () => {
    eventListeners.get(event)?.delete(callback);
  };
}

function emitEvent(event: string, data: any) {
  eventListeners.get(event)?.forEach(callback => callback(data));
}

// Database instance
let dbInstance: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('units')) {
        db.createObjectStore('units', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('profiles')) {
        const store = db.createObjectStore('profiles', { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: true });
        store.createIndex('email', 'email', { unique: true });
      }
      if (!db.objectStoreNames.contains('user_roles')) {
        const store = db.createObjectStore('user_roles', { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('counters')) {
        const store = db.createObjectStore('counters', { keyPath: 'id' });
        store.createIndex('unit_id', 'unit_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('tickets')) {
        const store = db.createObjectStore('tickets', { keyPath: 'id' });
        store.createIndex('unit_id', 'unit_id', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains('ticket_counters')) {
        const store = db.createObjectStore('ticket_counters', { keyPath: 'id' });
        store.createIndex('unit_id', 'unit_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        const store = db.createObjectStore('settings', { keyPath: 'id' });
        store.createIndex('unit_id', 'unit_id', { unique: true });
      }
      if (!db.objectStoreNames.contains('audit_logs')) {
        db.createObjectStore('audit_logs', { keyPath: 'id' });
      }
    };
  });
}

// Generic CRUD helpers
async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T extends { id: string }>(storeName: string, item: T): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => {
      emitEvent(`${storeName}_change`, { type: 'UPDATE', data: item });
      resolve(item);
    };
    request.onerror = () => reject(request.error);
  });
}

async function add<T extends { id: string }>(storeName: string, item: T): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.add(item);
    request.onsuccess = () => {
      emitEvent(`${storeName}_change`, { type: 'INSERT', data: item });
      resolve(item);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(storeName: string, id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => {
      emitEvent(`${storeName}_change`, { type: 'DELETE', id });
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => {
      emitEvent(`${storeName}_change`, { type: 'CLEAR' });
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

// Initialize default data
export async function initializeDatabase(): Promise<void> {
  const db = await openDatabase();
  
  // Check if we have a default unit
  const units = await getAll<Unit>('units');
  if (units.length === 0) {
    const defaultUnit: Unit = {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Unidade Principal',
      code: 'UP001',
      address: null,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    await add('units', defaultUnit);

    // Create default settings
    const defaultSettings: Settings = {
      id: generateId(),
      unit_id: defaultUnit.id,
      normal_priority: 5,
      preferential_priority: 10,
      manual_mode_enabled: false,
      manual_mode_min_number: 500,
      manual_mode_min_number_preferential: 0,
      calling_system_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await add('settings', defaultSettings);

    // Create default counters
    for (let i = 1; i <= 3; i++) {
      const counter: Counter = {
        id: generateId(),
        unit_id: defaultUnit.id,
        number: i,
        name: `Guichê ${i}`,
        is_active: true,
        current_attendant_id: null,
        created_at: new Date().toISOString(),
      };
      await add('counters', counter);
    }

    // Create default admin user
    const adminUserId = generateId();
    const adminUser: LocalUser = {
      id: adminUserId,
      email: 'admin@local.com',
      password: 'admin123', // In production, hash this
      created_at: new Date().toISOString(),
    };
    await add('users', adminUser);

    const adminProfile: Profile = {
      id: generateId(),
      user_id: adminUserId,
      unit_id: defaultUnit.id,
      full_name: 'Administrador',
      email: 'admin@local.com',
      avatar_url: null,
      is_active: true,
      current_session_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await add('profiles', adminProfile);

    const adminRole: UserRole = {
      id: generateId(),
      user_id: adminUserId,
      role: 'admin',
      created_at: new Date().toISOString(),
    };
    await add('user_roles', adminRole);

    console.log('[LocalDB] Default data initialized');
    console.log('[LocalDB] Admin credentials: admin@local.com / admin123');
  }
}

// =====================
// API-like functions
// =====================

// Auth
export async function signIn(email: string, password: string): Promise<{ user: LocalUser | null; error: string | null }> {
  const users = await getAll<LocalUser>('users');
  const user = users.find(u => u.email === email && u.password === password);
  
  if (!user) {
    return { user: null, error: 'Email ou senha inválidos' };
  }
  
  // Store session
  localStorage.setItem('local_user_id', user.id);
  
  return { user, error: null };
}

export async function signUp(email: string, password: string, fullName: string): Promise<{ user: LocalUser | null; error: string | null }> {
  const users = await getAll<LocalUser>('users');
  
  if (users.find(u => u.email === email)) {
    return { user: null, error: 'Email já cadastrado' };
  }
  
  const userId = generateId();
  const user: LocalUser = {
    id: userId,
    email,
    password,
    created_at: new Date().toISOString(),
  };
  await add('users', user);
  
  const profile: Profile = {
    id: generateId(),
    user_id: userId,
    unit_id: 'a0000000-0000-0000-0000-000000000001',
    full_name: fullName,
    email,
    avatar_url: null,
    is_active: true,
    current_session_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await add('profiles', profile);
  
  // Default role: attendant
  const role: UserRole = {
    id: generateId(),
    user_id: userId,
    role: 'attendant',
    created_at: new Date().toISOString(),
  };
  await add('user_roles', role);
  
  localStorage.setItem('local_user_id', userId);
  
  return { user, error: null };
}

export function signOut(): void {
  localStorage.removeItem('local_user_id');
}

export function getCurrentUserId(): string | null {
  return localStorage.getItem('local_user_id');
}

export async function getCurrentUser(): Promise<LocalUser | null> {
  const userId = getCurrentUserId();
  if (!userId) return null;
  return getById<LocalUser>('users', userId) || null;
}

// Profiles
export async function getProfile(userId: string): Promise<Profile | null> {
  const profiles = await getByIndex<Profile>('profiles', 'user_id', userId);
  return profiles[0] || null;
}

export async function getAllProfiles(): Promise<Profile[]> {
  return getAll<Profile>('profiles');
}

export async function updateProfile(id: string, updates: Partial<Profile>): Promise<Profile | null> {
  const profile = await getById<Profile>('profiles', id);
  if (!profile) return null;
  
  const updated = { ...profile, ...updates, updated_at: new Date().toISOString() };
  return put('profiles', updated);
}

// User Roles
export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const roles = await getByIndex<UserRole>('user_roles', 'user_id', userId);
  return roles.map(r => r.role);
}

export async function addUserRole(userId: string, role: AppRole): Promise<void> {
  const existingRoles = await getByIndex<UserRole>('user_roles', 'user_id', userId);
  if (existingRoles.find(r => r.role === role)) return;
  
  const newRole: UserRole = {
    id: generateId(),
    user_id: userId,
    role,
    created_at: new Date().toISOString(),
  };
  await add('user_roles', newRole);
}

export async function removeUserRole(userId: string, role: AppRole): Promise<void> {
  const roles = await getByIndex<UserRole>('user_roles', 'user_id', userId);
  const toRemove = roles.find(r => r.role === role);
  if (toRemove) {
    await deleteItem('user_roles', toRemove.id);
  }
}

// Counters
export async function getCounters(unitId: string): Promise<Counter[]> {
  const counters = await getByIndex<Counter>('counters', 'unit_id', unitId);
  return counters.filter(c => c.is_active).sort((a, b) => a.number - b.number);
}

export async function getCounter(id: string): Promise<Counter | null> {
  return getById<Counter>('counters', id) || null;
}

export async function updateCounter(id: string, updates: Partial<Counter>): Promise<Counter | null> {
  const counter = await getById<Counter>('counters', id);
  if (!counter) return null;
  
  const updated = { ...counter, ...updates };
  return put('counters', updated);
}

export async function createCounter(unitId: string, number: number, name?: string): Promise<Counter> {
  const counter: Counter = {
    id: generateId(),
    unit_id: unitId,
    number,
    name: name || `Guichê ${number}`,
    is_active: true,
    current_attendant_id: null,
    created_at: new Date().toISOString(),
  };
  return add('counters', counter);
}

// Settings
export async function getSettings(unitId: string): Promise<Settings | null> {
  const settings = await getByIndex<Settings>('settings', 'unit_id', unitId);
  return settings[0] || null;
}

export async function updateSettings(unitId: string, updates: Partial<Settings>): Promise<Settings | null> {
  const settings = await getSettings(unitId);
  if (!settings) return null;
  
  const updated = { ...settings, ...updates, updated_at: new Date().toISOString() };
  const result = await put('settings', updated);
  emitEvent('settings_updated', result);
  return result;
}

// Tickets
export async function getTickets(unitId: string, options?: { status?: TicketStatus[]; limit?: number }): Promise<Ticket[]> {
  const tickets = await getByIndex<Ticket>('tickets', 'unit_id', unitId);
  
  let filtered = tickets;
  
  if (options?.status && options.status.length > 0) {
    filtered = filtered.filter(t => options.status!.includes(t.status));
  }
  
  // Sort by priority desc, created_at asc
  filtered.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }
  
  return filtered;
}

export async function getTicket(id: string): Promise<Ticket | null> {
  return getById<Ticket>('tickets', id) || null;
}

export async function updateTicket(id: string, updates: Partial<Ticket>): Promise<Ticket | null> {
  const ticket = await getById<Ticket>('tickets', id);
  if (!ticket) return null;
  
  const updated = { ...ticket, ...updates, updated_at: new Date().toISOString() };
  const result = await put('tickets', updated);
  emitEvent('ticket_updated', result);
  return result;
}

export async function createTicket(data: {
  unit_id: string;
  ticket_type: TicketType;
  client_name?: string;
  client_cpf?: string;
  manual_ticket_number?: number;
}): Promise<{ ticket: Ticket | null; error: string | null }> {
  const settings = await getSettings(data.unit_id);
  
  if (!settings?.calling_system_active) {
    return { ticket: null, error: 'Sistema de chamadas não está ativo' };
  }
  
  const today = new Date().toISOString().split('T')[0];
  const tickets = await getByIndex<Ticket>('tickets', 'unit_id', data.unit_id);
  const todayTickets = tickets.filter(t => t.created_at.startsWith(today) && t.ticket_type === data.ticket_type);
  
  let nextNumber: number;
  
  if (settings.manual_mode_enabled && data.manual_ticket_number !== undefined) {
    const effectiveMinNumber = data.ticket_type === 'preferential' 
      ? settings.manual_mode_min_number_preferential 
      : settings.manual_mode_min_number;
    
    if (data.manual_ticket_number < effectiveMinNumber) {
      return { 
        ticket: null, 
        error: `Número mínimo permitido para ${data.ticket_type === 'preferential' ? 'preferencial' : 'normal'} é ${effectiveMinNumber}` 
      };
    }
    
    if (todayTickets.find(t => t.ticket_number === data.manual_ticket_number)) {
      const prefix = data.ticket_type === 'preferential' ? 'P' : 'N';
      return { 
        ticket: null, 
        error: `Senha ${prefix}-${data.manual_ticket_number} já foi gerada hoje` 
      };
    }
    
    nextNumber = data.manual_ticket_number;
  } else {
    const lastNumber = todayTickets.reduce((max, t) => Math.max(max, t.ticket_number), 0);
    const effectiveMinNumber = data.ticket_type === 'preferential' 
      ? settings.manual_mode_min_number_preferential 
      : settings.manual_mode_min_number;
    
    nextNumber = Math.max(lastNumber + 1, effectiveMinNumber);
  }
  
  const prefix = data.ticket_type === 'preferential' ? 'P' : 'N';
  const displayCode = `${prefix}-${nextNumber.toString().padStart(3, '0')}`;
  
  const priority = data.ticket_type === 'preferential' 
    ? settings.preferential_priority 
    : settings.normal_priority;
  
  const ticket: Ticket = {
    id: generateId(),
    unit_id: data.unit_id,
    ticket_type: data.ticket_type,
    ticket_number: nextNumber,
    display_code: displayCode,
    status: 'waiting',
    priority,
    client_name: data.client_name || null,
    client_cpf: data.client_cpf || null,
    attendant_id: null,
    counter_id: null,
    called_at: null,
    service_started_at: null,
    completed_at: null,
    skip_reason: null,
    service_type: null,
    completion_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  const result = await add('tickets', ticket);
  emitEvent('ticket_created', result);
  
  return { ticket: result, error: null };
}

export async function callNextTicket(unitId: string, counterId: string, attendantId: string): Promise<{ ticket: Ticket | null; error: string | null; queue_empty?: boolean }> {
  const tickets = await getTickets(unitId, { status: ['waiting'] });
  
  if (tickets.length === 0) {
    return { ticket: null, error: 'Não há senhas na fila', queue_empty: true };
  }
  
  const nextTicket = tickets[0];
  
  const updated = await updateTicket(nextTicket.id, {
    status: 'called',
    called_at: new Date().toISOString(),
    counter_id: counterId,
    attendant_id: attendantId,
  });
  
  emitEvent('ticket_called', updated);
  
  return { ticket: updated, error: null };
}

export async function repeatCall(ticketId: string): Promise<{ ticket: Ticket | null; error: string | null }> {
  const ticket = await getTicket(ticketId);
  if (!ticket) {
    return { ticket: null, error: 'Ticket não encontrado' };
  }
  
  const updated = await updateTicket(ticketId, {
    called_at: new Date().toISOString(),
  });
  
  emitEvent('ticket_called', updated);
  
  return { ticket: updated, error: null };
}

export async function skipTicket(ticketId: string, reason: string): Promise<{ ticket: Ticket | null; error: string | null }> {
  const ticket = await getTicket(ticketId);
  if (!ticket) {
    return { ticket: null, error: 'Ticket não encontrado' };
  }
  
  const updated = await updateTicket(ticketId, {
    status: 'skipped',
    skip_reason: reason,
  });
  
  return { ticket: updated, error: null };
}

// Reset system (clear today's tickets)
export async function resetSystem(unitId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const tickets = await getByIndex<Ticket>('tickets', 'unit_id', unitId);
  const todayTickets = tickets.filter(t => t.created_at.startsWith(today));
  
  for (const ticket of todayTickets) {
    await deleteItem('tickets', ticket.id);
  }
  
  // Clear ticket counters for today
  const counters = await getAll<TicketCounter>('ticket_counters');
  const todayCounters = counters.filter(c => c.counter_date === today && c.unit_id === unitId);
  
  for (const counter of todayCounters) {
    await deleteItem('ticket_counters', counter.id);
  }
  
  emitEvent('system_reset', { unit_id: unitId });
}

// Create user with roles (admin function)
export async function createUser(
  email: string, 
  password: string, 
  fullName: string, 
  unitId: string, 
  roles: AppRole[]
): Promise<{ user: LocalUser | null; error: string | null }> {
  const users = await getAll<LocalUser>('users');
  
  if (users.find(u => u.email === email)) {
    return { user: null, error: 'Email já cadastrado' };
  }
  
  const userId = generateId();
  const user: LocalUser = {
    id: userId,
    email,
    password,
    created_at: new Date().toISOString(),
  };
  await add('users', user);
  
  const profile: Profile = {
    id: generateId(),
    user_id: userId,
    unit_id: unitId,
    full_name: fullName,
    email,
    avatar_url: null,
    is_active: true,
    current_session_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await add('profiles', profile);
  
  for (const role of roles) {
    await addUserRole(userId, role);
  }
  
  return { user, error: null };
}

// Get tickets called today (for public panel history)
export async function getCalledTicketsToday(unitId: string, limit: number = 6): Promise<Ticket[]> {
  const today = new Date().toISOString().split('T')[0];
  const tickets = await getByIndex<Ticket>('tickets', 'unit_id', unitId);
  
  return tickets
    .filter(t => t.called_at && t.called_at.startsWith(today))
    .sort((a, b) => new Date(b.called_at!).getTime() - new Date(a.called_at!).getTime())
    .slice(0, limit);
}

// Get user by counter
export async function getCounterByAttendant(attendantId: string): Promise<Counter | null> {
  const counters = await getAll<Counter>('counters');
  return counters.find(c => c.current_attendant_id === attendantId) || null;
}

// Export for initialization
export { openDatabase, generateId };
