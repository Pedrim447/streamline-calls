import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DEFAULT_UNIT_ID = 'a0000000-0000-0000-0000-000000000001';

interface Organ {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  unit_id: string;
}

interface UseOrgansReturn {
  organs: Organ[];
  userOrgans: Organ[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useOrgans(): UseOrgansReturn {
  const { profile, user } = useAuth();
  const [organs, setOrgans] = useState<Organ[]>([]);
  const [userOrgans, setUserOrgans] = useState<Organ[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const unitId = profile?.unit_id || DEFAULT_UNIT_ID;

  const fetchOrgans = async () => {
    setIsLoading(true);

    // Fetch all active organs for this unit
    const { data: allOrgans } = await supabase
      .from('organs')
      .select('*')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (allOrgans) {
      setOrgans(allOrgans);
    }

    // Fetch organs assigned to the current user
    if (user?.id) {
      const { data: attendantOrgans } = await supabase
        .from('attendant_organs')
        .select('organ_id')
        .eq('user_id', user.id);

      if (attendantOrgans && allOrgans) {
        const organIds = attendantOrgans.map(ao => ao.organ_id);
        const filteredOrgans = allOrgans.filter(o => organIds.includes(o.id));
        setUserOrgans(filteredOrgans);
      }
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchOrgans();
  }, [unitId, user?.id]);

  return {
    organs,
    userOrgans,
    isLoading,
    refetch: fetchOrgans,
  };
}