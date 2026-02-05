import { useState, useEffect, useCallback, useRef } from 'react';

interface UseCallCooldownOptions {
  callDuration?: number; // cooldown after calling next ticket (in seconds)
  repeatDuration?: number; // cooldown before repeat is allowed (in seconds)
  speakingDuration?: number; // estimated voice duration to block actions (in seconds)
}

export function useCallCooldown(options: UseCallCooldownOptions = {}) {
  const { callDuration = 3, repeatDuration = 10, speakingDuration = 8 } = options;
  
  const [callCooldownRemaining, setCallCooldownRemaining] = useState(0);
  const [repeatCooldownRemaining, setRepeatCooldownRemaining] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const repeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mark as speaking and clear after estimated duration
  const markSpeaking = useCallback(() => {
    setIsSpeaking(true);
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
    }
    speakingTimeoutRef.current = setTimeout(() => {
      setIsSpeaking(false);
    }, speakingDuration * 1000);
  }, [speakingDuration]);

  // Start cooldown after calling a new ticket
  const startCallCooldown = useCallback(() => {
    setCallCooldownRemaining(callDuration);
    markSpeaking();
  }, [callDuration, markSpeaking]);

  // Start repeat cooldown (10 seconds before allowing repeat)
  const startRepeatCooldown = useCallback(() => {
    setRepeatCooldownRemaining(repeatDuration);
    markSpeaking();
  }, [repeatDuration, markSpeaking]);

  const clearCooldowns = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (repeatTimerRef.current) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    setCallCooldownRemaining(0);
    setRepeatCooldownRemaining(0);
    setIsSpeaking(false);
  }, []);

  // Call cooldown timer
  useEffect(() => {
    if (callCooldownRemaining > 0) {
      callTimerRef.current = setInterval(() => {
        setCallCooldownRemaining(prev => {
          if (prev <= 1) {
            if (callTimerRef.current) {
              clearInterval(callTimerRef.current);
              callTimerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callCooldownRemaining]);

  // Repeat cooldown timer
  useEffect(() => {
    if (repeatCooldownRemaining > 0) {
      repeatTimerRef.current = setInterval(() => {
        setRepeatCooldownRemaining(prev => {
          if (prev <= 1) {
            if (repeatTimerRef.current) {
              clearInterval(repeatTimerRef.current);
              repeatTimerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current);
      }
    };
  }, [repeatCooldownRemaining]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, []);

  return {
    callCooldownRemaining,
    repeatCooldownRemaining,
    isSpeaking,
    isCallBlocked: callCooldownRemaining > 0 || isSpeaking,
    isRepeatBlocked: repeatCooldownRemaining > 0 || isSpeaking,
    startCallCooldown,
    startRepeatCooldown,
    clearCooldowns,
  };
}
