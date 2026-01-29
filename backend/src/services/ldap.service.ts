/**
 * Serviço de Autenticação LDAP/Active Directory
 * 
 * Gerencia autenticação de usuários via LDAP/AD.
 * Mapeia grupos do AD para roles da aplicação.
 */

import ldap from 'ldapjs';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface LdapUser {
  dn: string;
  sAMAccountName: string;
  displayName: string;
  mail: string;
  memberOf: string[];
  employeeID?: string;
  department?: string;
  telephoneNumber?: string;
}

export interface LdapAuthResult {
  success: boolean;
  user?: LdapUser;
  roles: string[];
  error?: string;
}

class LdapService {
  private client: ldap.Client | null = null;

  /**
   * Cria cliente LDAP
   */
  private createClient(): ldap.Client {
    const options: ldap.ClientOptions = {
      url: config.ldap.url,
      timeout: 10000,
      connectTimeout: 10000,
    };

    // Configurar TLS se habilitado
    if (config.ldap.tls.enabled) {
      const fs = require('fs');
      options.tlsOptions = {
        ca: config.ldap.tls.certPath ? [fs.readFileSync(config.ldap.tls.certPath)] : undefined,
        rejectUnauthorized: config.ldap.tls.rejectUnauthorized,
      };
    }

    return ldap.createClient(options);
  }

  /**
   * Autentica usuário via LDAP
   */
  async authenticate(username: string, password: string): Promise<LdapAuthResult> {
    if (!config.ldap.enabled) {
      return { 
        success: false, 
        roles: [],
        error: 'Autenticação LDAP não está habilitada' 
      };
    }

    const client = this.createClient();

    return new Promise((resolve) => {
      // Timeout handler
      const timeout = setTimeout(() => {
        client.destroy();
        resolve({ 
          success: false, 
          roles: [],
          error: 'Timeout na conexão LDAP' 
        });
      }, 15000);

      client.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('Erro de conexão LDAP:', err);
        client.destroy();
        resolve({ 
          success: false, 
          roles: [],
          error: 'Erro de conexão com servidor LDAP' 
        });
      });

      // Primeiro, bind como service account para buscar o usuário
      client.bind(config.ldap.bindDN, config.ldap.bindPassword, async (bindErr) => {
        if (bindErr) {
          clearTimeout(timeout);
          logger.error('Erro ao fazer bind do service account:', bindErr);
          client.destroy();
          resolve({ 
            success: false, 
            roles: [],
            error: 'Erro de autenticação no servidor LDAP' 
          });
          return;
        }

        try {
          // Buscar usuário
          const user = await this.findUser(client, username);
          
          if (!user) {
            clearTimeout(timeout);
            client.destroy();
            resolve({ 
              success: false, 
              roles: [],
              error: 'Usuário não encontrado' 
            });
            return;
          }

          // Verificar senha do usuário fazendo bind com suas credenciais
          const userClient = this.createClient();
          
          userClient.bind(user.dn, password, (userBindErr) => {
            clearTimeout(timeout);
            userClient.destroy();
            client.destroy();

            if (userBindErr) {
              logger.warn(`Falha de autenticação LDAP para ${username}`);
              resolve({ 
                success: false, 
                roles: [],
                error: 'Usuário ou senha inválidos' 
              });
              return;
            }

            // Determinar roles baseado nos grupos
            const roles = this.mapGroupsToRoles(user.memberOf);
            
            logger.info(`Usuário ${username} autenticado via LDAP com roles: ${roles.join(', ')}`);
            
            resolve({
              success: true,
              user,
              roles,
            });
          });

        } catch (err) {
          clearTimeout(timeout);
          client.destroy();
          logger.error('Erro ao buscar usuário LDAP:', err);
          resolve({ 
            success: false, 
            roles: [],
            error: 'Erro ao buscar usuário' 
          });
        }
      });
    });
  }

  /**
   * Busca usuário no LDAP
   */
  private findUser(client: ldap.Client, username: string): Promise<LdapUser | null> {
    return new Promise((resolve, reject) => {
      const searchFilter = config.ldap.userSearchFilter.replace('{{username}}', username);
      
      const searchOptions: ldap.SearchOptions = {
        scope: 'sub',
        filter: searchFilter,
        attributes: [
          'dn',
          'sAMAccountName',
          'displayName',
          'mail',
          'memberOf',
          'employeeID',
          'department',
          'telephoneNumber',
        ],
      };

      const searchBase = `${config.ldap.userSearchBase},${config.ldap.baseDN}`;

      client.search(searchBase, searchOptions, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        let user: LdapUser | null = null;

        res.on('searchEntry', (entry) => {
          const attrs = entry.pojo.attributes;
          
          user = {
            dn: entry.pojo.objectName,
            sAMAccountName: this.getAttrValue(attrs, 'sAMAccountName'),
            displayName: this.getAttrValue(attrs, 'displayName'),
            mail: this.getAttrValue(attrs, 'mail'),
            memberOf: this.getAttrValues(attrs, 'memberOf'),
            employeeID: this.getAttrValue(attrs, 'employeeID'),
            department: this.getAttrValue(attrs, 'department'),
            telephoneNumber: this.getAttrValue(attrs, 'telephoneNumber'),
          };
        });

        res.on('error', (searchErr) => {
          reject(searchErr);
        });

        res.on('end', () => {
          resolve(user);
        });
      });
    });
  }

  /**
   * Mapeia grupos LDAP para roles da aplicação
   */
  private mapGroupsToRoles(groups: string[]): string[] {
    const roles: string[] = [];
    
    for (const group of groups) {
      const groupLower = group.toLowerCase();
      
      if (config.ldap.adminGroup && groupLower.includes(config.ldap.adminGroup.toLowerCase())) {
        roles.push('admin');
      }
      
      if (config.ldap.attendantGroup && groupLower.includes(config.ldap.attendantGroup.toLowerCase())) {
        roles.push('attendant');
      }
      
      if (config.ldap.recepcaoGroup && groupLower.includes(config.ldap.recepcaoGroup.toLowerCase())) {
        roles.push('recepcao');
      }
    }

    // Se nenhum grupo foi mapeado, atribuir role padrão de attendant
    if (roles.length === 0) {
      roles.push('attendant');
    }

    return [...new Set(roles)]; // Remover duplicatas
  }

  /**
   * Helper para extrair valor de atributo
   */
  private getAttrValue(attrs: any[], name: string): string {
    const attr = attrs.find(a => a.type === name);
    return attr?.values?.[0] || '';
  }

  /**
   * Helper para extrair múltiplos valores de atributo
   */
  private getAttrValues(attrs: any[], name: string): string[] {
    const attr = attrs.find(a => a.type === name);
    return attr?.values || [];
  }

  /**
   * Testa conectividade com servidor LDAP
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!config.ldap.enabled) {
      return { success: false, message: 'LDAP não está habilitado' };
    }

    const client = this.createClient();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.destroy();
        resolve({ success: false, message: 'Timeout na conexão' });
      }, 10000);

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.destroy();
        resolve({ success: false, message: `Erro: ${err.message}` });
      });

      client.bind(config.ldap.bindDN, config.ldap.bindPassword, (err) => {
        clearTimeout(timeout);
        client.destroy();

        if (err) {
          resolve({ success: false, message: `Falha no bind: ${err.message}` });
        } else {
          resolve({ success: true, message: 'Conexão LDAP OK' });
        }
      });
    });
  }
}

export const ldapService = new LdapService();
export default ldapService;
