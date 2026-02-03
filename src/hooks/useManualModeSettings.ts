import { useState, useEffect } from 'react';
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

  const effectiveUnitId = unitId || DEFAULT_UNIT_ID;

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      
      // Fetch settings
      const { data, error } = await supabase
        .from('settings')
        .select('manual_mode_enabled, manual_mode_min_number, manual_mode_min_number_preferential, calling_system_active')
        .eq('unit_id', effectiveUnitId)
        .maybeSingle();

      if (data) {
        setManualModeEnabled(data.manual_mode_enabled ?? false);
        setManualModeMinNumber(data.manual_mode_min_number ?? 500);
        // @ts-ignore - new columns
        setManualModeMinNumberPreferential(data.manual_mode_min_number_preferential ?? 0);
        // @ts-ignore - new columns
        setCallingSystemActive(data.calling_system_active ?? false);
      }
      
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch last generated NORMAL ticket number for today
      const { data: lastNormalTicket } = await supabase
        .from('tickets')
        .select('ticket_number')
        .eq('unit_id', effectiveUnitId)
        .eq('ticket_type', 'normal')
        .gte('created_at', `${today}T00:00:00`)
        .order('ticket_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastNormalTicket) {
        setLastGeneratedNormal(lastNormalTicket.ticket_number);
      } else {
        setLastGeneratedNormal(null);
      }
      
      // Fetch last generated PREFERENTIAL ticket number for today
      const { data: lastPreferentialTicket } = await supabase
        .from('tickets')
        .select('ticket_number')
        .eq('unit_id', effectiveUnitId)
        .eq('ticket_type', 'preferential')
        .gte('created_at', `${today}T00:00:00`)
        .order('ticket_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastPreferentialTicket) {
        setLastGeneratedPreferential(lastPreferentialTicket.ticket_number);
      } else {
        setLastGeneratedPreferential(null);
      }
      
      setIsLoading(false);
    };

    fetchSettings();

    // Listen to realtime changes on settings table
    const settingsChannel = supabase
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
    
    // Listen to new tickets to update last generated numbers by type
    const ticketsChannel = supabase
      .channel(`tickets-last-number-${effectiveUnitId}`)
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
          }
        }
      )
      .subscribe();

    // Listen for system reset broadcast to zero out lastGeneratedNumbers
    const resetChannel = supabase
      .channel(`system-reset-${DEFAULT_UNIT_ID}`)
      .on('broadcast', { event: 'system_reset' }, () => {
        console.log('[useManualModeSettings] System reset - clearing lastGeneratedNumbers');
        setLastGeneratedNormal(null);
        setLastGeneratedPreferential(null);
        fetchSettings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(ticketsChannel);
      supabase.removeChannel(resetChannel);
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
