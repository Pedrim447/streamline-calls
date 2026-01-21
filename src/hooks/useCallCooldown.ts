import { useState, useEffect, useCallback, useRef } from 'react';

interface UseCallCooldownOptions {
  duration?: number; // in seconds
}

export function useCallCooldown(options: UseCallCooldownOptions = {}) {
  const { duration = 5 } = options;
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startCooldown = useCallback(() => {
    setCooldownRemaining(duration);
  }, [duration]);

  const clearCooldown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCooldownRemaining(0);
  }, []);

  useEffect(() => {
    if (cooldownRemaining > 0) {
      timerRef.current = setInterval(() => {
        setCooldownRemaining(prev => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [cooldownRemaining]);

  return {
    cooldownRemaining,
    isCooldownActive: cooldownRemaining > 0,
    startCooldown,
    clearCooldown,
  };
}
