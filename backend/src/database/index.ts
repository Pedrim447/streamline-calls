/**
 * Módulo de Conexão com Banco de Dados Oracle
 * 
 * Este módulo gerencia o pool de conexões Oracle.
 * Para usar, configure as variáveis de ambiente no arquivo .env
 * 
 * INSTALAÇÃO DO ORACLE INSTANT CLIENT:
 * 1. Baixe o Oracle Instant Client em: https://www.oracle.com/database/technologies/instant-client.html
 * 2. Extraia e configure a variável de ambiente LD_LIBRARY_PATH (Linux) ou PATH (Windows)
 * 3. Detalhes em: https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html
 */

import oracledb from 'oracledb';
import { config } from '../config';
import { logger } from '../utils/logger';

// Configurações do cliente Oracle
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;
oracledb.fetchAsString = [oracledb.CLOB];

class DatabaseConnection {
  private pool: oracledb.Pool | null = null;
  private isInitialized = false;

  /**
   * Inicializa o pool de conexões Oracle
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Pool de conexões já inicializado');
      return;
    }

    try {
      // Construir connection string se não fornecida diretamente
      let connectString = config.oracle.connectionString;
      
      if (!connectString) {
        if (config.oracle.sid) {
          // Usando SID
          connectString = `${config.oracle.host}:${config.oracle.port}:${config.oracle.sid}`;
        } else {
          // Usando Service Name
          connectString = `${config.oracle.host}:${config.oracle.port}/${config.oracle.serviceName}`;
        }
      }

      logger.info(`Conectando ao Oracle: ${connectString.replace(/:[^:]+@/, ':***@')}`);

      this.pool = await oracledb.createPool({
        user: config.oracle.user,
        password: config.oracle.password,
        connectString: connectString,
        poolMin: config.oracle.pool.min,
        poolMax: config.oracle.pool.max,
        poolIncrement: config.oracle.pool.increment,
        poolAlias: 'filafacil',
        queueTimeout: 60000,
        enableStatistics: true,
      });

      this.isInitialized = true;
      logger.info(`Pool Oracle criado: min=${config.oracle.pool.min}, max=${config.oracle.pool.max}`);

      // Testar conexão
      const connection = await this.getConnection();
      const result = await connection.execute<{ SYSDATE: Date }>('SELECT SYSDATE FROM DUAL');
      await connection.close();
      
      logger.info(`Conexão Oracle validada. Data do servidor: ${result.rows?.[0]?.SYSDATE}`);

    } catch (error) {
      logger.error('Erro ao inicializar pool Oracle:', error);
      throw error;
    }
  }

  /**
   * Obtém uma conexão do pool
   */
  async getConnection(): Promise<oracledb.Connection> {
    if (!this.pool) {
      throw new Error('Pool de conexões não inicializado. Chame initialize() primeiro.');
    }
    return this.pool.getConnection();
  }

  /**
   * Executa uma query e retorna os resultados
   */
  async execute<T = any>(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: oracledb.ExecuteOptions = {}
  ): Promise<oracledb.Result<T>> {
    const connection = await this.getConnection();
    
    try {
      const defaultOptions: oracledb.ExecuteOptions = {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        ...options,
      };
      
      const result = await connection.execute<T>(sql, binds, defaultOptions);
      return result;
    } finally {
      await connection.close();
    }
  }

  /**
   * Executa uma query com transação
   */
  async executeInTransaction<T>(
    callback: (connection: oracledb.Connection) => Promise<T>
  ): Promise<T> {
    const connection = await this.getConnection();
    
    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  }

  /**
   * Executa múltiplas queries em uma transação
   */
  async executeMany(
    sql: string,
    binds: oracledb.BindParameters[],
    options: oracledb.ExecuteManyOptions = {}
  ): Promise<oracledb.Result<unknown>> {
    const connection = await this.getConnection();
    
    try {
      const result = await connection.executeMany(sql, binds, {
        autoCommit: true,
        ...options,
      });
      return result;
    } finally {
      await connection.close();
    }
  }

  /**
   * Fecha o pool de conexões
   */
  async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.close(10); // Aguarda até 10 segundos
        this.pool = null;
        this.isInitialized = false;
        logger.info('Pool Oracle fechado com sucesso');
      } catch (error) {
        logger.error('Erro ao fechar pool Oracle:', error);
        throw error;
      }
    }
  }

  /**
   * Retorna estatísticas do pool
   */
  getPoolStatistics(): oracledb.PoolStatistics | null {
    if (!this.pool) return null;
    return this.pool.getStatistics();
  }

  /**
   * Verifica se o pool está saudável
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string; stats?: any }> {
    try {
      if (!this.pool) {
        return { healthy: false, message: 'Pool não inicializado' };
      }

      const connection = await this.getConnection();
      const result = await connection.execute('SELECT 1 FROM DUAL');
      await connection.close();

      const stats = this.getPoolStatistics();

      return {
        healthy: true,
        message: 'Conexão Oracle OK',
        stats: {
          connectionsOpen: stats?.connectionsOpen,
          connectionsInUse: stats?.connectionsInUse,
          poolMin: config.oracle.pool.min,
          poolMax: config.oracle.pool.max,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Erro na conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }
}

// Singleton
export const Database = new DatabaseConnection();

export default Database;
