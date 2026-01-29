/**
 * WebSocket Context for Real-time Updates
 * 
 * Provides WebSocket connection management for real-time ticket updates.
 * Designed for on-premise deployment without external services.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { API_CONFIG } from '@/config/api.config';
import type { TicketCalledEvent, TicketUpdatedEvent, Ticket } from '@/types/api.types';

interface WebSocketContextType {
  isConnected: boolean;
  subscribe: (event: string, callback: (data: unknown) => void) => () => void;
  broadcast: (event: string, data: unknown) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// WebSocket URL - derived from API URL
function getWebSocketUrl(): string {
  const apiUrl = API_CONFIG.BASE_URL;
  const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws';
  const wsUrl = apiUrl.replace(/^https?/, wsProtocol).replace('/api', '/ws');
  return wsUrl;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = localStorage.getItem(API_CONFIG.TOKEN_KEY);
    if (!token) return;

    try {
      const wsUrl = `${getWebSocketUrl()}?token=${token}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { type, data } = message;
          
          // Notify all listeners for this event type
          const listeners = listenersRef.current.get(type);
          if (listeners) {
            listeners.forEach(callback => callback(data));
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        
        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
    }
  }, []);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  }, []);

  // Subscribe to an event
  const subscribe = useCallback((event: string, callback: (data: unknown) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = listenersRef.current.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          listenersRef.current.delete(event);
        }
      }
    };
  }, []);

  // Broadcast an event
  const broadcast = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: event, data }));
    }
  }, []);

  // Connect when authenticated
  useEffect(() => {
    const token = localStorage.getItem(API_CONFIG.TOKEN_KEY);
    if (token) {
      connect();
    }

    // Listen for auth events
    const handleLogin = () => connect();
    const handleLogout = () => disconnect();

    window.addEventListener('auth:login', handleLogin);
    window.addEventListener('auth:logout', handleLogout);

    return () => {
      window.removeEventListener('auth:login', handleLogin);
      window.removeEventListener('auth:logout', handleLogout);
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe, broadcast }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Hook for ticket events
export function useTicketEvents(callbacks: {
  onTicketCalled?: (event: TicketCalledEvent) => void;
  onTicketUpdated?: (event: TicketUpdatedEvent) => void;
}) {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    if (callbacks.onTicketCalled) {
      unsubscribes.push(
        subscribe('ticket_called', callbacks.onTicketCalled as (data: unknown) => void)
      );
    }

    if (callbacks.onTicketUpdated) {
      unsubscribes.push(
        subscribe('ticket_updated', callbacks.onTicketUpdated as (data: unknown) => void)
      );
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [subscribe, callbacks.onTicketCalled, callbacks.onTicketUpdated]);
}
