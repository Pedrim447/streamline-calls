import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

interface ManualModeSettings {
  manualModeEnabled: boolean;
  manualModeMinNumber: number;
  manualModeMinNumberPreferential: number;
  callingSystemActive: boolean;
  lastGeneratedNormal: number | null;
  lastGeneratedPreferential: number | null;
  isLoading: boolean;
}

// Cache to avoid duplicate fetches across hook instances
const settingsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

export function useManualModeSettings(unitId?: string): ManualModeSettings {
  const [manualModeEnabled, setManualModeEnabled] = useState(false);
  const [manualModeMinNumber, setManualModeMinNumber] = useState(500);
  const [manualModeMinNumberPreferential, setManualModeMinNumberPreferential] = useState(0);
  const [callingSystemActive, setCallingSystemActive] = useState(false);
  const [lastGeneratedNormal, setLastGeneratedNormal] = useState<number | null>(null);
  const [lastGeneratedPreferential, setLastGeneratedPreferential] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const effectiveUnitId = unitId || DEFAULT_UNIT_ID;

  const fetchSettings = useCallback(async () => {
    const cacheKey = `settings-${effectiveUnitId}`;
    const cached = settingsCache.get(cacheKey);
    
    // Use cache if fresh
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      if (isMountedRef.current) {
        const data = cached.data;
        setManualModeEnabled(data.manual_mode_enabled ?? false);
        setManualModeMinNumber(data.manual_mode_min_number ?? 500);
        setManualModeMinNumberPreferential(data.manual_mode_min_number_preferential ?? 0);
        setCallingSystemActive(data.calling_system_active ?? false);
        setLastGeneratedNormal(data.lastNormal);
        setLastGeneratedPreferential(data.lastPreferential);
        setIsLoading(false);
      }
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Fetch all data in parallel
    const [settingsResult, normalResult, preferentialResult] = await Promise.all([
      supabase
        .from('settings')
        .select('manual_mode_enabled, manual_mode_min_number, manual_mode_min_number_preferential, calling_system_active')
        .eq('unit_id', effectiveUnitId)
        .maybeSingle(),
      supabase
        .from('tickets')
        .select('ticket_number')
        .eq('unit_id', effectiveUnitId)
        .eq('ticket_type', 'normal')
        .gte('created_at', `${today}T00:00:00`)
        .order('ticket_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('tickets')
        .select('ticket_number')
        .eq('unit_id', effectiveUnitId)
        .eq('ticket_type', 'preferential')
        .gte('created_at', `${today}T00:00:00`)
        .order('ticket_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (!isMountedRef.current) return;

    const settingsData = settingsResult.data;
    const lastNormal = normalResult.data?.ticket_number ?? null;
    const lastPreferential = preferentialResult.data?.ticket_number ?? null;

    // Update cache
    settingsCache.set(cacheKey, {
      data: {
        ...(settingsData || {}),
        lastNormal,
        lastPreferential
      },
      timestamp: Date.now()
    });

    if (settingsData) {
      setManualModeEnabled(settingsData.manual_mode_enabled ?? false);
      setManualModeMinNumber(settingsData.manual_mode_min_number ?? 500);
      // @ts-ignore - new columns
      setManualModeMinNumberPreferential(settingsData.manual_mode_min_number_preferential ?? 0);
      // @ts-ignore - new columns
      setCallingSystemActive(settingsData.calling_system_active ?? false);
    }
    
    setLastGeneratedNormal(lastNormal);
    setLastGeneratedPreferential(lastPreferential);
    setIsLoading(false);
  }, [effectiveUnitId]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchSettings();

    // Single combined channel for all realtime updates
    const channel = supabase
      .channel(`manual-mode-${effectiveUnitId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'settings',
          filter: `unit_id=eq.${effectiveUnitId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData.manual_mode_enabled !== undefined) {
            setManualModeEnabled(newData.manual_mode_enabled);
          }
          if (newData.manual_mode_min_number !== undefined) {
            setManualModeMinNumber(newData.manual_mode_min_number);
          }
          if (newData.manual_mode_min_number_preferential !== undefined) {
            setManualModeMinNumberPreferential(newData.manual_mode_min_number_preferential);
          }
          if (newData.calling_system_active !== undefined) {
            setCallingSystemActive(newData.calling_system_active);
          }
          // Invalidate cache
          settingsCache.delete(`settings-${effectiveUnitId}`);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tickets',
          filter: `unit_id=eq.${effectiveUnitId}`,
        },
        (payload) => {
          const newTicket = payload.new as { ticket_number?: number; ticket_type?: string };
          if (newTicket.ticket_number !== undefined && newTicket.ticket_type) {
            if (newTicket.ticket_type === 'normal') {
              setLastGeneratedNormal(prev => 
                prev === null ? newTicket.ticket_number! : Math.max(prev, newTicket.ticket_number!)
              );
            } else if (newTicket.ticket_type === 'preferential') {
              setLastGeneratedPreferential(prev => 
                prev === null ? newTicket.ticket_number! : Math.max(prev, newTicket.ticket_number!)
              );
            }
            // Invalidate cache
            settingsCache.delete(`settings-${effectiveUnitId}`);
          }
        }
      )
      .on('broadcast', { event: 'system_reset' }, () => {
        console.log('[useManualModeSettings] System reset - clearing lastGeneratedNumbers');
        setLastGeneratedNormal(null);
        setLastGeneratedPreferential(null);
        settingsCache.delete(`settings-${effectiveUnitId}`);
        fetchSettings();
      })
      .subscribe();

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [effectiveUnitId, fetchSettings]);

  return {
    manualModeEnabled,
    manualModeMinNumber,
    manualModeMinNumberPreferential,
    callingSystemActive,
    lastGeneratedNormal,
    lastGeneratedPreferential,
    isLoading,
  };
}
