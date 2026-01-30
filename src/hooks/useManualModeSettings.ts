import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

interface ManualModeSettings {
  manualModeEnabled: boolean;
  manualModeMinNumber: number;
  isLoading: boolean;
}

export function useManualModeSettings(unitId?: string): ManualModeSettings {
  const [manualModeEnabled, setManualModeEnabled] = useState(false);
  const [manualModeMinNumber, setManualModeMinNumber] = useState(500);
  const [isLoading, setIsLoading] = useState(true);

  const effectiveUnitId = unitId || DEFAULT_UNIT_ID;

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('settings')
        .select('manual_mode_enabled, manual_mode_min_number')
        .eq('unit_id', effectiveUnitId)
        .maybeSingle();

      if (data) {
        setManualModeEnabled(data.manual_mode_enabled ?? false);
        setManualModeMinNumber(data.manual_mode_min_number ?? 500);
      }
      setIsLoading(false);
    };

    fetchSettings();

    // Listen to realtime changes on settings table
    const channel = supabase
      .channel(`settings-manual-mode-${effectiveUnitId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'settings',
          filter: `unit_id=eq.${effectiveUnitId}`,
        },
        (payload) => {
          const newData = payload.new as { manual_mode_enabled?: boolean; manual_mode_min_number?: number };
          if (newData.manual_mode_enabled !== undefined) {
            setManualModeEnabled(newData.manual_mode_enabled);
          }
          if (newData.manual_mode_min_number !== undefined) {
            setManualModeMinNumber(newData.manual_mode_min_number);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveUnitId]);

  return {
    manualModeEnabled,
    manualModeMinNumber,
    isLoading,
  };
}
