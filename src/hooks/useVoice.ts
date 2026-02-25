import { useCallback, useEffect, useRef, useState } from 'react';

interface VoiceSettings {
  enabled: boolean;
  speed: number;
  template: string;
  lang: string;
}

const defaultSettings: VoiceSettings = {
  enabled: true,
  speed: 1.0,
  template: 'Senha {ticket}, guichê {counter}',
  lang: 'pt-BR',
};

// Convert number to Portuguese words
function numberToWords(num: number): string {
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  if (num === 0) return 'zero';
  if (num === 100) return 'cem';

  let result = '';

  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    if (thousands === 1) {
      result += 'mil';
    } else {
      result += numberToWords(thousands) + ' mil';
    }
    num %= 1000;
    if (num > 0) result += ' e ';
  }

  if (num >= 100) {
    result += hundreds[Math.floor(num / 100)];
    num %= 100;
    if (num > 0) result += ' e ';
  }

  if (num >= 20) {
    result += tens[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) result += ' e ' + units[num];
  } else if (num >= 10) {
    result += teens[num - 10];
  } else if (num > 0) {
    result += units[num];
  }

  return result;
}

export interface CallTicketOptions {
  withSound?: boolean;
  ticketType?: 'normal' | 'preferential';
  clientName?: string | null;
  organName?: string | null;
}

interface QueueItem {
  ticketCode: string;
  counterNumber: number | string;
  options: CallTicketOptions;
  isRepeat?: boolean;
}

export function useVoice(settings: Partial<VoiceSettings> = {}) {
  const voiceSettings = { ...defaultSettings, ...settings };
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  
  const queueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);

  // Initialize voices on mount
  useEffect(() => {
    if (!window.speechSynthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoicesLoaded(true);
        console.log('Voices loaded:', voices.length);
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const buildMessage = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { isSoft?: boolean; ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
  ): string | null => {
    const { ticketType, clientName, organName } = options;

    const match = ticketCode.match(/^([A-Z]+)-(\d+)$/);
    if (!match) {
      console.warn('Invalid ticket code format:', ticketCode);
      return null;
    }

    const [, ticketPrefix, ticketNumberStr] = match;
    const ticketNumber = parseInt(ticketNumberStr, 10);
    const counterNum = typeof counterNumber === 'string' ? parseInt(counterNumber, 10) : counterNumber;

    let ticketTypeSpoken: string;
    if (ticketType) {
      ticketTypeSpoken = ticketType === 'preferential' ? 'atendimento preferencial' : 'atendimento';
    } else {
      ticketTypeSpoken = ticketPrefix === 'P' ? 'atendimento preferencial' : 'atendimento';
    }

    const ticketNumberSpoken = numberToWords(ticketNumber);
    const counterSpoken = numberToWords(counterNum);

    let message = '';

    if (organName && organName.trim().length > 0) {
      message = `${ticketTypeSpoken} número ${ticketNumberSpoken}, ${organName}, dirija-se ao guichê ${counterSpoken}.`;
    } else {
      if (clientName && clientName.trim().length > 0) {
        const firstName = clientName.trim().split(' ')[0];
        message = `Atenção ${firstName}. `;
      }
      message += `${ticketTypeSpoken} número ${ticketNumberSpoken}, dirija-se ao guichê ${counterSpoken}.`;
    }

    return message;
  }, []);

  const speakMessage = useCallback((message: string, isSoft: boolean = false): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = voiceSettings.lang;

      if (isSoft) {
        utterance.rate = voiceSettings.speed * 0.85;
        utterance.pitch = 0.9;
        utterance.volume = 0.8;
      } else {
        utterance.rate = voiceSettings.speed;
        utterance.pitch = 1;
        utterance.volume = 1;
      }

      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt'));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utterance.onstart = () => {
        console.log('[VoiceQueue] Speech started:', message.substring(0, 50));
        setIsSpeaking(true);
      };
      utterance.onend = () => {
        console.log('[VoiceQueue] Speech ended');
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = (event) => {
        console.error('[VoiceQueue] Speech error:', event.error);
        setIsSpeaking(false);
        resolve(); // Resolve even on error to continue queue
      };

      // Chrome bug workaround
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 100);

      // Safety timeout - resolve after 15s max to avoid stuck queue
      setTimeout(() => {
        if (window.speechSynthesis.speaking) {
          console.warn('[VoiceQueue] Safety timeout, cancelling stuck speech');
          window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        resolve();
      }, 15000);
    });
  }, [voiceSettings]);

  // Process the queue sequentially
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    console.log('[VoiceQueue] Processing queue, items:', queueRef.current.length);

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      setQueueLength(queueRef.current.length);

      const { ticketCode, counterNumber, options, isRepeat } = item;
      const { ticketType, clientName, organName } = options;

      const message = buildMessage(ticketCode, counterNumber, { ticketType, clientName, organName });
      if (!message) continue;

      console.log('[VoiceQueue] Announcing:', ticketCode, '- Queue remaining:', queueRef.current.length);

      // Play sound
      if (options.withSound !== false) {
        if (isRepeat) {
          playSoftChimeInternal();
        } else {
          playAlertSoundInternal();
        }
        // Wait for sound to finish
        await new Promise(r => setTimeout(r, 600));
      }

      // Speak and wait for completion
      await speakMessage(message, isRepeat ?? false);

      // Small gap between announcements
      if (queueRef.current.length > 0) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    isProcessingRef.current = false;
    setQueueLength(0);
    console.log('[VoiceQueue] Queue empty, done processing');
  }, [buildMessage, speakMessage]);

  const enqueueCall = useCallback((item: QueueItem) => {
    if (!voiceSettings.enabled) {
      console.log('[VoiceQueue] Voice disabled in settings');
      return;
    }

    console.log('[VoiceQueue] Enqueueing:', item.ticketCode, '- Current queue:', queueRef.current.length);
    queueRef.current.push(item);
    setQueueLength(queueRef.current.length);
    processQueue();
  }, [voiceSettings.enabled, processQueue]);

  // Alert sound (internal, no state)
  const playAlertSoundInternal = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;

      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.error('[VoiceQueue] Alert sound error:', e);
    }
  };

  // Soft chime (internal, no state)
  const playSoftChimeInternal = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      const playNote = (frequency: number, startTime: number, duration: number, volume: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0, audioContext.currentTime + startTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
        oscillator.start(audioContext.currentTime + startTime);
        oscillator.stop(audioContext.currentTime + startTime + duration);
      };

      playNote(523.25, 0, 0.6, 0.15);
      playNote(659.25, 0.15, 0.7, 0.12);
    } catch (e) {
      console.error('[VoiceQueue] Soft chime error:', e);
    }
  };

  // Public API - same signatures as before
  const playAlertSound = useCallback(() => {
    playAlertSoundInternal();
  }, []);

  const playSoftChime = useCallback(() => {
    playSoftChimeInternal();
  }, []);

  const callTicket = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: CallTicketOptions = {}
  ) => {
    enqueueCall({ ticketCode, counterNumber, options, isRepeat: false });
  }, [enqueueCall]);

  const repeatCallSoft = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
  ) => {
    enqueueCall({ ticketCode, counterNumber, options: { ...options, withSound: true }, isRepeat: true });
  }, [enqueueCall]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    queueRef.current = [];
    setQueueLength(0);
    isProcessingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Also expose speak for backward compat (direct, non-queued)
  const speak = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { isSoft?: boolean; ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
  ) => {
    // Legacy: cancel and speak directly (used by dashboard, not panel)
    if (!voiceSettings.enabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const message = buildMessage(ticketCode, counterNumber, options);
    if (message) speakMessage(message, options.isSoft);
  }, [voiceSettings, buildMessage, speakMessage]);

  return {
    speak,
    stop,
    callTicket,
    repeatCallSoft,
    playAlertSound,
    playSoftChime,
    isSpeaking,
    voicesLoaded,
    queueLength,
  };
}
