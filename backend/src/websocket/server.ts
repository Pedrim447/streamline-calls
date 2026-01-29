/**
 * Servidor WebSocket
 * 
 * Gerencia conexões WebSocket para atualizações em tempo real.
 */

import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { JwtPayload } from '../middleware/auth';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  unitId?: string;
  isAlive?: boolean;
}

interface WebSocketMessage {
  type: string;
  data?: any;
}

// Singleton para broadcast
let wsServerInstance: WebSocketServer | null = null;

export class WebSocketServer {
  private wss: WSServer | null = null;
  private clients: Map<string, Set<AuthenticatedWebSocket>> = new Map(); // unitId -> clients
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(private server: Server) {
    wsServerInstance = this;
  }

  start() {
    this.wss = new WSServer({ 
      server: this.server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: AuthenticatedWebSocket, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });

    // Heartbeat para detectar conexões mortas
    this.heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.isAlive === false) {
          this.removeClient(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, config.websocket.heartbeatInterval);

    logger.info('WebSocket server started on /ws');
  }

  private handleConnection(ws: AuthenticatedWebSocket, request: any) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Token required');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      
      ws.userId = decoded.userId;
      ws.unitId = decoded.unitId;
      ws.isAlive = true;

      // Adicionar ao grupo da unidade
      this.addClient(ws);

      logger.info(`WebSocket connected: user=${decoded.userId}, unit=${decoded.unitId}`);

      // Enviar confirmação
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        data: {
          userId: decoded.userId,
          unitId: decoded.unitId,
        },
      }));

      // Event handlers
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        this.handleMessage(ws, data.toString());
      });

      ws.on('close', () => {
        this.removeClient(ws);
        logger.info(`WebSocket disconnected: user=${ws.userId}`);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for user=${ws.userId}:`, error);
        this.removeClient(ws);
      });

    } catch (error) {
      logger.warn('WebSocket auth failed:', error);
      ws.close(4003, 'Invalid token');
    }
  }

  private addClient(ws: AuthenticatedWebSocket) {
    if (!ws.unitId) return;

    if (!this.clients.has(ws.unitId)) {
      this.clients.set(ws.unitId, new Set());
    }
    this.clients.get(ws.unitId)!.add(ws);
  }

  private removeClient(ws: AuthenticatedWebSocket) {
    if (!ws.unitId) return;

    const unitClients = this.clients.get(ws.unitId);
    if (unitClients) {
      unitClients.delete(ws);
      if (unitClients.size === 0) {
        this.clients.delete(ws.unitId);
      }
    }
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: string) {
    try {
      const data = JSON.parse(message) as WebSocketMessage;
      
      switch (data.type) {
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
          
        case 'SUBSCRIBE':
          // Cliente já está inscrito na unidade pelo token
          ws.send(JSON.stringify({ 
            type: 'SUBSCRIBED', 
            data: { unitId: ws.unitId } 
          }));
          break;
          
        default:
          logger.debug(`Unknown WebSocket message type: ${data.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Envia mensagem para todos os clientes de uma unidade
   */
  broadcast(unitId: string, message: WebSocketMessage) {
    const unitClients = this.clients.get(unitId);
    
    if (!unitClients || unitClients.size === 0) {
      return;
    }

    const messageStr = JSON.stringify(message);
    let sent = 0;

    unitClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
        sent++;
      }
    });

    logger.debug(`Broadcast to unit ${unitId}: ${message.type} (${sent} clients)`);
  }

  /**
   * Envia mensagem para um usuário específico
   */
  sendToUser(userId: string, message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);

    this.clients.forEach((unitClients) => {
      unitClients.forEach((client) => {
        if (client.userId === userId && client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    });
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss?.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    this.wss?.close();
    logger.info('WebSocket server stopped');
  }
}

/**
 * Função helper para broadcast global
 */
export function websocketBroadcast(unitId: string, message: WebSocketMessage) {
  wsServerInstance?.broadcast(unitId, message);
}

export function websocketSendToUser(userId: string, message: WebSocketMessage) {
  wsServerInstance?.sendToUser(userId, message);
}

export default WebSocketServer;
