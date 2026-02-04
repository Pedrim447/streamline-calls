import { useState, useEffect, useCallback } from 'react';
import * as localDb from '@/lib/localDatabase';

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

interface ManualModeSettings {
  manualModeEnabled: boolean;
  manualModeMinNumber: number;
  manualModeMinNumberPreferential: number;
  callingSystemActive: boolean;
  lastGeneratedNumber: number | null;
  isLoading: boolean;
}

export function useManualModeSettings(unitId?: string | null): ManualModeSettings {
  const [manualModeEnabled, setManualModeEnabled] = useState(false);
  const [manualModeMinNumber, setManualModeMinNumber] = useState(500);
  const [manualModeMinNumberPreferential, setManualModeMinNumberPreferential] = useState(0);
  const [callingSystemActive, setCallingSystemActive] = useState(true);
  const [lastGeneratedNumber, setLastGeneratedNumber] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const effectiveUnitId = unitId || DEFAULT_UNIT_ID;

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const settings = await localDb.getSettings(effectiveUnitId);
      
      if (settings) {
        setManualModeEnabled(settings.manual_mode_enabled);
        setManualModeMinNumber(settings.manual_mode_min_number);
        setManualModeMinNumberPreferential(settings.manual_mode_min_number_preferential);
        setCallingSystemActive(settings.calling_system_active);
      }
      
      // Fetch last generated ticket number for today
      const today = new Date().toISOString().split('T')[0];
      const tickets = await localDb.getTickets(effectiveUnitId);
      const todayTickets = tickets.filter(t => t.created_at.startsWith(today));
      
      if (todayTickets.length > 0) {
        const maxNumber = Math.max(...todayTickets.map(t => t.ticket_number));
        setLastGeneratedNumber(maxNumber);
      } else {
        setLastGeneratedNumber(null);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
    
    setIsLoading(false);
  }, [effectiveUnitId]);

  useEffect(() => {
    fetchSettings();

    // Subscribe to settings updates
    const unsubscribeSettings = localDb.subscribeToEvent('settings_updated', (settings) => {
      if (settings.unit_id === effectiveUnitId) {
        setManualModeEnabled(settings.manual_mode_enabled);
        setManualModeMinNumber(settings.manual_mode_min_number);
        setManualModeMinNumberPreferential(settings.manual_mode_min_number_preferential);
        setCallingSystemActive(settings.calling_system_active);
      }
    });

    // Subscribe to new tickets
    const unsubscribeTickets = localDb.subscribeToEvent('ticket_created', (ticket) => {
      if (ticket.unit_id === effectiveUnitId) {
        setLastGeneratedNumber(prev => 
          prev === null ? ticket.ticket_number : Math.max(prev, ticket.ticket_number)
        );
      }
    });

    // Subscribe to system reset
    const unsubscribeReset = localDb.subscribeToEvent('system_reset', () => {
      setLastGeneratedNumber(null);
      fetchSettings();
    });

    return () => {
      unsubscribeSettings();
      unsubscribeTickets();
      unsubscribeReset();
    };
  }, [effectiveUnitId, fetchSettings]);

  return {
    manualModeEnabled,
    manualModeMinNumber,
    manualModeMinNumberPreferential,
    callingSystemActive,
    lastGeneratedNumber,
    isLoading,
  };
}
