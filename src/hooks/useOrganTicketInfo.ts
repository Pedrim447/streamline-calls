 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 
 interface OrganTicketInfo {
   minNumberNormal: number;
   minNumberPreferential: number;
   lastGeneratedNormal: number | null;
   lastGeneratedPreferential: number | null;
   isLoading: boolean;
   refetch: () => void;
 }
 
 /**
  * Hook to get organ-specific ticket information (minimum numbers and last generated)
  * Used in Modo Ação to show organ-specific numbering instead of global
  */
 export function useOrganTicketInfo(organId: string | null, unitId: string | null): OrganTicketInfo {
   const [minNumberNormal, setMinNumberNormal] = useState(1);
   const [minNumberPreferential, setMinNumberPreferential] = useState(1);
   const [lastGeneratedNormal, setLastGeneratedNormal] = useState<number | null>(null);
   const [lastGeneratedPreferential, setLastGeneratedPreferential] = useState<number | null>(null);
   const [isLoading, setIsLoading] = useState(false);
 
   const fetchInfo = useCallback(async () => {
     if (!organId || !unitId) {
       setMinNumberNormal(1);
       setMinNumberPreferential(1);
       setLastGeneratedNormal(null);
       setLastGeneratedPreferential(null);
       return;
     }
 
     setIsLoading(true);
 
     const today = new Date().toISOString().split('T')[0];
 
     // Fetch organ settings and last tickets in parallel
     const [organResult, lastNormalResult, lastPreferentialResult] = await Promise.all([
       // Get organ min numbers
       supabase
         .from('organs')
         .select('min_number_normal, min_number_preferential')
         .eq('id', organId)
         .single(),
       
       // Get last normal ticket for this organ today
       supabase
         .from('tickets')
         .select('ticket_number')
         .eq('unit_id', unitId)
         .eq('organ_id', organId)
         .eq('ticket_type', 'normal')
         .gte('created_at', `${today}T00:00:00`)
         .order('ticket_number', { ascending: false })
         .limit(1)
         .maybeSingle(),
       
       // Get last preferential ticket for this organ today
       supabase
         .from('tickets')
         .select('ticket_number')
         .eq('unit_id', unitId)
         .eq('organ_id', organId)
         .eq('ticket_type', 'preferential')
         .gte('created_at', `${today}T00:00:00`)
         .order('ticket_number', { ascending: false })
         .limit(1)
         .maybeSingle(),
     ]);
 
     if (organResult.data) {
       setMinNumberNormal(organResult.data.min_number_normal ?? 1);
       setMinNumberPreferential(organResult.data.min_number_preferential ?? 1);
     }
 
     setLastGeneratedNormal(lastNormalResult.data?.ticket_number ?? null);
     setLastGeneratedPreferential(lastPreferentialResult.data?.ticket_number ?? null);
 
     setIsLoading(false);
   }, [organId, unitId]);
 
   useEffect(() => {
     fetchInfo();
 
     // Subscribe to new tickets for this organ to update last generated
     if (!organId || !unitId) return;
 
     const channel = supabase
       .channel(`organ-tickets-${organId}`)
       .on(
         'postgres_changes',
         {
           event: 'INSERT',
           schema: 'public',
           table: 'tickets',
           filter: `organ_id=eq.${organId}`,
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
 
     // Listen for organ settings updates
     const organChannel = supabase
       .channel(`organ-settings-${organId}`)
       .on(
         'postgres_changes',
         {
           event: 'UPDATE',
           schema: 'public',
           table: 'organs',
           filter: `id=eq.${organId}`,
         },
         (payload) => {
           const newData = payload.new as { min_number_normal?: number; min_number_preferential?: number };
           if (newData.min_number_normal !== undefined) {
             setMinNumberNormal(newData.min_number_normal);
           }
           if (newData.min_number_preferential !== undefined) {
             setMinNumberPreferential(newData.min_number_preferential);
           }
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
       supabase.removeChannel(organChannel);
     };
   }, [organId, unitId, fetchInfo]);
 
   return {
     minNumberNormal,
     minNumberPreferential,
     lastGeneratedNormal,
     lastGeneratedPreferential,
     isLoading,
     refetch: fetchInfo,
   };
 }