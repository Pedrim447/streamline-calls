/**
 * Serviço de Autenticação
 * 
 * Gerencia login, logout, geração e validação de tokens JWT.
 * Suporta autenticação local e via LDAP/AD.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { Database } from '../database';
import { ldapService } from './ldap.service';
import { logger, logAudit } from '../utils/logger';
import { AppError, Errors } from '../middleware/errorHandler';
import type { JwtPayload } from '../middleware/auth';

export interface LoginRequest {
  email?: string;
  password: string;
  username?: string; // Para LDAP
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    unitId: string;
    roles: string[];
  };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  private readonly SALT_ROUNDS = 12;

  /**
   * Login com email e senha (autenticação local)
   */
  async loginLocal(email: string, password: string, ipAddress?: string): Promise<LoginResponse> {
    // Buscar usuário no banco
    const result = await Database.execute<any>(
      `SELECT 
        p.id,
        p.user_id,
        p.email,
        p.full_name,
        p.unit_id,
        p.is_active,
        u.password_hash
      FROM profiles p
      JOIN users u ON p.user_id = u.id
      WHERE LOWER(p.email) = LOWER(:email)`,
      { email }
    );

    const user = result.rows?.[0];

    if (!user) {
      logAudit({
        action: 'LOGIN_FAILED',
        entityType: 'auth',
        details: { email, reason: 'user_not_found' },
        ipAddress,
        success: false,
      });
      throw Errors.Unauthorized('Usuário ou senha inválidos');
    }

    if (!user.IS_ACTIVE) {
      throw Errors.Unauthorized('Conta desativada');
    }

    // Verificar senha
    const passwordValid = await bcrypt.compare(password, user.PASSWORD_HASH);
    
    if (!passwordValid) {
      logAudit({
        action: 'LOGIN_FAILED',
        entityType: 'auth',
        userId: user.USER_ID,
        details: { reason: 'invalid_password' },
        ipAddress,
        success: false,
      });
      throw Errors.Unauthorized('Usuário ou senha inválidos');
    }

    // Buscar roles
    const rolesResult = await Database.execute<any>(
      `SELECT role FROM user_roles WHERE user_id = :userId`,
      { userId: user.USER_ID }
    );
    
    const roles = rolesResult.rows?.map((r: any) => r.ROLE) || [];

    // Gerar sessão e tokens
    const sessionId = uuidv4();
    const tokens = this.generateTokens({
      userId: user.USER_ID,
      email: user.EMAIL,
      fullName: user.FULL_NAME,
      unitId: user.UNIT_ID,
      roles,
      sessionId,
    });

    // Atualizar sessão no banco
    await Database.execute(
      `UPDATE profiles SET 
        current_session_id = :sessionId,
        last_login_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
      WHERE user_id = :userId`,
      { sessionId, userId: user.USER_ID }
    );

    logAudit({
      action: 'LOGIN_SUCCESS',
      entityType: 'auth',
      userId: user.USER_ID,
      unitId: user.UNIT_ID,
      ipAddress,
      success: true,
    });

    return {
      ...tokens,
      expiresIn: this.parseExpiresIn(config.jwt.expiresIn),
      user: {
        id: user.USER_ID,
        email: user.EMAIL,
        fullName: user.FULL_NAME,
        unitId: user.UNIT_ID,
        roles,
      },
    };
  }

  /**
   * Login via LDAP/Active Directory
   */
  async loginLdap(username: string, password: string, ipAddress?: string): Promise<LoginResponse> {
    // Autenticar via LDAP
    const ldapResult = await ldapService.authenticate(username, password);

    if (!ldapResult.success || !ldapResult.user) {
      logAudit({
        action: 'LDAP_LOGIN_FAILED',
        entityType: 'auth',
        details: { username, error: ldapResult.error },
        ipAddress,
        success: false,
      });
      throw Errors.Unauthorized(ldapResult.error || 'Falha na autenticação LDAP');
    }

    const ldapUser = ldapResult.user;

    // Buscar ou criar perfil no banco local
    let profile = await this.findOrCreateLdapProfile(ldapUser, ldapResult.roles);

    // Gerar sessão e tokens
    const sessionId = uuidv4();
    const tokens = this.generateTokens({
      userId: profile.userId,
      email: profile.email,
      fullName: profile.fullName,
      unitId: profile.unitId,
      roles: ldapResult.roles,
      sessionId,
    });

    // Atualizar sessão
    await Database.execute(
      `UPDATE profiles SET 
        current_session_id = :sessionId,
        last_login_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
      WHERE user_id = :userId`,
      { sessionId, userId: profile.userId }
    );

    logAudit({
      action: 'LDAP_LOGIN_SUCCESS',
      entityType: 'auth',
      userId: profile.userId,
      unitId: profile.unitId,
      ipAddress,
      details: { ldapDN: ldapUser.dn },
      success: true,
    });

    return {
      ...tokens,
      expiresIn: this.parseExpiresIn(config.jwt.expiresIn),
      user: {
        id: profile.userId,
        email: profile.email,
        fullName: profile.fullName,
        unitId: profile.unitId,
        roles: ldapResult.roles,
      },
    };
  }

  /**
   * Busca ou cria perfil para usuário LDAP
   */
  private async findOrCreateLdapProfile(ldapUser: any, roles: string[]): Promise<{
    userId: string;
    email: string;
    fullName: string;
    unitId: string;
  }> {
    // Buscar perfil existente por email ou employeeID
    const existing = await Database.execute<any>(
      `SELECT user_id, email, full_name, unit_id 
       FROM profiles 
       WHERE LOWER(email) = LOWER(:email) OR matricula = :matricula`,
      { email: ldapUser.mail, matricula: ldapUser.employeeID || '' }
    );

    if (existing.rows && existing.rows.length > 0) {
      const profile = existing.rows[0];
      return {
        userId: profile.USER_ID,
        email: profile.EMAIL,
        fullName: profile.FULL_NAME,
        unitId: profile.UNIT_ID,
      };
    }

    // Criar novo usuário e perfil
    const userId = uuidv4();
    const profileId = uuidv4();

    // Buscar unidade padrão (primeira disponível)
    const defaultUnit = await Database.execute<any>(
      `SELECT id FROM units WHERE ROWNUM = 1`
    );
    const unitId = defaultUnit.rows?.[0]?.ID;

    if (!unitId) {
      throw Errors.Internal('Nenhuma unidade configurada no sistema');
    }

    await Database.executeInTransaction(async (conn) => {
      // Criar usuário sem senha (autenticação via LDAP)
      await conn.execute(
        `INSERT INTO users (id, ldap_dn, created_at, updated_at)
         VALUES (:id, :ldapDn, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { id: userId, ldapDn: ldapUser.dn }
      );

      // Criar perfil
      await conn.execute(
        `INSERT INTO profiles (id, user_id, email, full_name, matricula, unit_id, is_active, created_at, updated_at)
         VALUES (:id, :userId, :email, :fullName, :matricula, :unitId, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          id: profileId,
          userId,
          email: ldapUser.mail,
          fullName: ldapUser.displayName,
          matricula: ldapUser.employeeID || null,
          unitId,
        }
      );

      // Criar roles
      for (const role of roles) {
        await conn.execute(
          `INSERT INTO user_roles (id, user_id, role, created_at)
           VALUES (:id, :userId, :role, SYSTIMESTAMP)`,
          { id: uuidv4(), userId, role }
        );
      }
    });

    logger.info(`Novo usuário LDAP criado: ${ldapUser.mail}`);

    return {
      userId,
      email: ldapUser.mail,
      fullName: ldapUser.displayName,
      unitId,
    };
  }

  /**
   * Gera par de tokens JWT
   */
  generateTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>): TokenPair {
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    const refreshToken = jwt.sign(
      { userId: payload.userId, sessionId: payload.sessionId, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Renova tokens usando refresh token
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

      if (decoded.type !== 'refresh') {
        throw Errors.Unauthorized('Token inválido');
      }

      // Buscar usuário e validar sessão
      const result = await Database.execute<any>(
        `SELECT 
          p.user_id, p.email, p.full_name, p.unit_id, p.current_session_id,
          (SELECT LISTAGG(role, ',') WITHIN GROUP (ORDER BY role) FROM user_roles WHERE user_id = p.user_id) as roles
        FROM profiles p
        WHERE p.user_id = :userId`,
        { userId: decoded.userId }
      );

      const user = result.rows?.[0];

      if (!user || user.CURRENT_SESSION_ID !== decoded.sessionId) {
        throw Errors.Unauthorized('Sessão inválida');
      }

      const roles = user.ROLES ? user.ROLES.split(',') : [];

      return this.generateTokens({
        userId: user.USER_ID,
        email: user.EMAIL,
        fullName: user.FULL_NAME,
        unitId: user.UNIT_ID,
        roles,
        sessionId: decoded.sessionId,
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw Errors.Unauthorized('Refresh token expirado');
      }
      throw error;
    }
  }

  /**
   * Logout - invalida sessão
   */
  async logout(userId: string, sessionId?: string): Promise<void> {
    await Database.execute(
      `UPDATE profiles SET 
        current_session_id = NULL,
        updated_at = SYSTIMESTAMP
      WHERE user_id = :userId`,
      { userId }
    );

    logAudit({
      action: 'LOGOUT',
      entityType: 'auth',
      userId,
      success: true,
    });
  }

  /**
   * Verifica se sessão está válida
   */
  async validateSession(userId: string, sessionId: string): Promise<boolean> {
    const result = await Database.execute<any>(
      `SELECT current_session_id FROM profiles WHERE user_id = :userId`,
      { userId }
    );

    return result.rows?.[0]?.CURRENT_SESSION_ID === sessionId;
  }

  /**
   * Hash de senha
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Converte string de expiração para segundos
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 28800; // 8h default

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 28800;
    }
  }
}

export const authService = new AuthService();
export default authService;
