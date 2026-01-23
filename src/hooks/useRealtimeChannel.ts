import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeChannelOptions {
  channelName: string;
  unitId: string | null;
  onTicketChange?: (payload: any) => void;
  onBroadcast?: (payload: any) => void;
  enabled?: boolean;
}

export function useRealtimeChannel(options: UseRealtimeChannelOptions) {
  const { channelName, unitId, onTicketChange, onBroadcast, enabled = true } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Send broadcast message to all connected clients
  const broadcast = useCallback((event: string, payload: any) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event,
        payload,
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled || !unitId) return;

    const channel = supabase
      .channel(`${channelName}-${unitId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: unitId },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `unit_id=eq.${unitId}`,
        },
        (payload) => {
          console.log('[Realtime] Ticket change:', payload.eventType, payload);
          onTicketChange?.(payload);
        }
      )
      .on('broadcast', { event: 'ticket_called' }, (payload) => {
        console.log('[Realtime] Broadcast received:', payload);
        onBroadcast?.(payload);
      })
      .on('broadcast', { event: 'ticket_updated' }, (payload) => {
        console.log('[Realtime] Ticket updated broadcast:', payload);
        onBroadcast?.(payload);
      })
      .subscribe((status) => {
        console.log(`[Realtime] Channel ${channelName} status:`, status);
      });

    channelRef.current = channel;

    return () => {
      console.log(`[Realtime] Cleaning up channel ${channelName}`);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [channelName, unitId, enabled, onTicketChange, onBroadcast]);

  return { broadcast };
}
