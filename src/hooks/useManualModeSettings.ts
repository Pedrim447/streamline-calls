import { useState, useEffect, useRef } from 'react';
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

export function useManualModeSettings(unitId?: string): ManualModeSettings {
  const [manualModeEnabled, setManualModeEnabled] = useState(false);
  const [manualModeMinNumber, setManualModeMinNumber] = useState(500);
  const [manualModeMinNumberPreferential, setManualModeMinNumberPreferential] = useState(0);
  const [callingSystemActive, setCallingSystemActive] = useState(false);
  const [lastGeneratedNormal, setLastGeneratedNormal] = useState<number | null>(null);
  const [lastGeneratedPreferential, setLastGeneratedPreferential] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);
  const hasFetchedRef = useRef(false);

  const effectiveUnitId = unitId || DEFAULT_UNIT_ID;

  useEffect(() => {
    isMountedRef.current = true;
    hasFetchedRef.current = false;

    const fetchSettings = async () => {
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;

      try {
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

        if (settingsData) {
          setManualModeEnabled(settingsData.manual_mode_enabled ?? false);
          setManualModeMinNumber(settingsData.manual_mode_min_number ?? 500);
          setManualModeMinNumberPreferential((settingsData as any).manual_mode_min_number_preferential ?? 0);
          setCallingSystemActive((settingsData as any).calling_system_active ?? false);
        }
        
        setLastGeneratedNormal(lastNormal);
        setLastGeneratedPreferential(lastPreferential);
      } catch (error) {
        console.error('Error fetching manual mode settings:', error);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

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
          if (!isMountedRef.current) return;
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
          if (!isMountedRef.current) return;
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
          }
        }
      )
      .on('broadcast', { event: 'system_reset' }, () => {
        if (!isMountedRef.current) return;
        console.log('[useManualModeSettings] System reset - clearing lastGeneratedNumbers');
        setLastGeneratedNormal(null);
        setLastGeneratedPreferential(null);
      })
      .subscribe();

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [effectiveUnitId]);

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
