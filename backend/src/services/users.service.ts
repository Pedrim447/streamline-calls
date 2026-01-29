/**
 * Serviço de Usuários
 * 
 * Gerencia CRUD de usuários e perfis.
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Database } from '../database';
import { logger, logAudit } from '../utils/logger';
import { AppError, Errors } from '../middleware/errorHandler';

export interface User {
  id: string;
  email: string;
  full_name: string;
  matricula?: string;
  cpf?: string;
  birth_date?: string;
  avatar_url?: string;
  unit_id?: string;
  is_active: boolean;
  roles: string[];
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  matricula?: string;
  cpf?: string;
  birth_date?: string;
  unit_id: string;
  role: 'admin' | 'attendant' | 'recepcao';
}

export interface UpdateUserRequest {
  full_name?: string;
  matricula?: string;
  cpf?: string;
  birth_date?: string;
  avatar_url?: string;
  unit_id?: string;
  is_active?: boolean;
}

class UsersService {
  private readonly SALT_ROUNDS = 12;

  /**
   * Cria um novo usuário
   */
  async create(request: CreateUserRequest, createdBy: string): Promise<User> {
    const { email, password, full_name, matricula, cpf, birth_date, unit_id, role } = request;

    // Verificar duplicidade
    const existing = await Database.execute<any>(
      `SELECT id FROM profiles WHERE LOWER(email) = LOWER(:email) OR matricula = :matricula OR cpf = :cpf`,
      { email, matricula: matricula || '', cpf: cpf || '' }
    );

    if (existing.rows && existing.rows.length > 0) {
      throw Errors.Conflict('Usuário já existe com este email, matrícula ou CPF');
    }

    const userId = uuidv4();
    const profileId = uuidv4();
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    await Database.executeInTransaction(async (conn) => {
      // Criar usuário
      await conn.execute(
        `INSERT INTO users (id, password_hash, created_at, updated_at)
         VALUES (:id, :passwordHash, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { id: userId, passwordHash }
      );

      // Criar perfil
      await conn.execute(
        `INSERT INTO profiles (id, user_id, email, full_name, matricula, cpf, birth_date, unit_id, is_active, created_at, updated_at)
         VALUES (:id, :userId, :email, :fullName, :matricula, :cpf, TO_DATE(:birthDate, 'YYYY-MM-DD'), :unitId, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          id: profileId,
          userId,
          email,
          fullName: full_name,
          matricula: matricula || null,
          cpf: cpf || null,
          birthDate: birth_date || null,
          unitId: unit_id,
        }
      );

      // Criar role
      await conn.execute(
        `INSERT INTO user_roles (id, user_id, role, created_at)
         VALUES (:id, :userId, :role, SYSTIMESTAMP)`,
        { id: uuidv4(), userId, role }
      );
    });

    const user = await this.findById(userId);

    logAudit({
      action: 'USER_CREATE',
      entityType: 'user',
      entityId: userId,
      userId: createdBy,
      details: { email, role },
      success: true,
    });

    return user!;
  }

  /**
   * Atualiza um usuário
   */
  async update(userId: string, request: UpdateUserRequest, updatedBy: string): Promise<User> {
    const existingUser = await this.findById(userId);
    
    if (!existingUser) {
      throw Errors.NotFound('Usuário');
    }

    const updates: string[] = [];
    const binds: any = { userId };

    if (request.full_name !== undefined) {
      updates.push('full_name = :fullName');
      binds.fullName = request.full_name;
    }

    if (request.matricula !== undefined) {
      updates.push('matricula = :matricula');
      binds.matricula = request.matricula;
    }

    if (request.cpf !== undefined) {
      updates.push('cpf = :cpf');
      binds.cpf = request.cpf;
    }

    if (request.birth_date !== undefined) {
      updates.push('birth_date = TO_DATE(:birthDate, \'YYYY-MM-DD\')');
      binds.birthDate = request.birth_date;
    }

    if (request.avatar_url !== undefined) {
      updates.push('avatar_url = :avatarUrl');
      binds.avatarUrl = request.avatar_url;
    }

    if (request.unit_id !== undefined) {
      updates.push('unit_id = :unitId');
      binds.unitId = request.unit_id;
    }

    if (request.is_active !== undefined) {
      updates.push('is_active = :isActive');
      binds.isActive = request.is_active ? 1 : 0;
    }

    if (updates.length > 0) {
      updates.push('updated_at = SYSTIMESTAMP');
      
      await Database.execute(
        `UPDATE profiles SET ${updates.join(', ')} WHERE user_id = :userId`,
        binds
      );
    }

    const user = await this.findById(userId);

    logAudit({
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: userId,
      userId: updatedBy,
      details: request,
      success: true,
    });

    return user!;
  }

  /**
   * Altera role do usuário
   */
  async updateRole(userId: string, newRole: string, updatedBy: string): Promise<void> {
    // Remover roles existentes
    await Database.execute(
      `DELETE FROM user_roles WHERE user_id = :userId`,
      { userId }
    );

    // Adicionar nova role
    await Database.execute(
      `INSERT INTO user_roles (id, user_id, role, created_at)
       VALUES (:id, :userId, :role, SYSTIMESTAMP)`,
      { id: uuidv4(), userId, role: newRole }
    );

    logAudit({
      action: 'USER_ROLE_CHANGE',
      entityType: 'user',
      entityId: userId,
      userId: updatedBy,
      details: { newRole },
      success: true,
    });
  }

  /**
   * Altera senha do usuário
   */
  async changePassword(userId: string, newPassword: string, changedBy: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await Database.execute(
      `UPDATE users SET password_hash = :passwordHash, updated_at = SYSTIMESTAMP WHERE id = :userId`,
      { passwordHash, userId }
    );

    logAudit({
      action: 'USER_PASSWORD_CHANGE',
      entityType: 'user',
      entityId: userId,
      userId: changedBy,
      success: true,
    });
  }

  /**
   * Busca usuário por ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await Database.execute<any>(
      `SELECT 
        p.user_id as id,
        p.email,
        p.full_name,
        p.matricula,
        p.cpf,
        TO_CHAR(p.birth_date, 'YYYY-MM-DD') as birth_date,
        p.avatar_url,
        p.unit_id,
        p.is_active,
        p.created_at,
        p.updated_at,
        (SELECT LISTAGG(role, ',') WITHIN GROUP (ORDER BY role) FROM user_roles WHERE user_id = p.user_id) as roles
      FROM profiles p
      WHERE p.user_id = :id`,
      { id }
    );

    return this.mapRowToUser(result.rows?.[0]);
  }

  /**
   * Lista todos os usuários de uma unidade
   */
  async findAll(unitId?: string): Promise<User[]> {
    let sql = `
      SELECT 
        p.user_id as id,
        p.email,
        p.full_name,
        p.matricula,
        p.cpf,
        TO_CHAR(p.birth_date, 'YYYY-MM-DD') as birth_date,
        p.avatar_url,
        p.unit_id,
        p.is_active,
        p.created_at,
        p.updated_at,
        (SELECT LISTAGG(role, ',') WITHIN GROUP (ORDER BY role) FROM user_roles WHERE user_id = p.user_id) as roles
      FROM profiles p
    `;
    
    const binds: any = {};
    
    if (unitId) {
      sql += ' WHERE p.unit_id = :unitId';
      binds.unitId = unitId;
    }
    
    sql += ' ORDER BY p.full_name';

    const result = await Database.execute<any>(sql, binds);
    
    return (result.rows || []).map(this.mapRowToUser).filter(Boolean) as User[];
  }

  /**
   * Busca atendentes de uma unidade
   */
  async findAttendants(unitId: string): Promise<User[]> {
    const result = await Database.execute<any>(
      `SELECT 
        p.user_id as id,
        p.email,
        p.full_name,
        p.matricula,
        p.unit_id,
        p.is_active,
        (SELECT LISTAGG(role, ',') WITHIN GROUP (ORDER BY role) FROM user_roles WHERE user_id = p.user_id) as roles
      FROM profiles p
      WHERE p.unit_id = :unitId
        AND p.is_active = 1
        AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id AND ur.role IN ('attendant', 'admin'))
      ORDER BY p.full_name`,
      { unitId }
    );

    return (result.rows || []).map(this.mapRowToUser).filter(Boolean) as User[];
  }

  /**
   * Mapeia row para objeto User
   */
  private mapRowToUser(row: any): User | null {
    if (!row) return null;

    return {
      id: row.ID,
      email: row.EMAIL,
      full_name: row.FULL_NAME,
      matricula: row.MATRICULA,
      cpf: row.CPF,
      birth_date: row.BIRTH_DATE,
      avatar_url: row.AVATAR_URL,
      unit_id: row.UNIT_ID,
      is_active: row.IS_ACTIVE === 1,
      roles: row.ROLES ? row.ROLES.split(',') : [],
      created_at: row.CREATED_AT,
      updated_at: row.UPDATED_AT,
    };
  }
}

export const usersService = new UsersService();
export default usersService;
