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
  message: string;
  rate: number;
  pitch: number;
  volume: number;
  alertType: 'normal' | 'soft' | 'none';
}

export function useVoice(settings: Partial<VoiceSettings> = {}) {
  const voiceSettings = { ...defaultSettings, ...settings };
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  
  // Sequential queue
  const queueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!window.speechSynthesis) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setVoicesLoaded(true);
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const playAlertSound = useCallback(() => {
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
  }, []);

  const playSoftChime = useCallback(() => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playNote = (frequency: number, startTime: number, duration: number, vol: number) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.value = frequency;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, audioContext.currentTime + startTime);
      gain.gain.linearRampToValueAtTime(vol, audioContext.currentTime + startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
      osc.start(audioContext.currentTime + startTime);
      osc.stop(audioContext.currentTime + startTime + duration);
    };
    playNote(523.25, 0, 0.6, 0.15);
    playNote(659.25, 0.15, 0.7, 0.12);
  }, []);

  // Process the queue sequentially - one at a time
  const processQueue = useCallback(() => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) {
      setIsSpeaking(false);
      return;
    }

    isProcessingRef.current = true;
    setIsSpeaking(true);

    const item = queueRef.current.shift()!;

    // Play alert sound first
    const playAlert = (): Promise<void> => {
      return new Promise((resolve) => {
        if (item.alertType === 'normal') {
          playAlertSound();
          setTimeout(resolve, 600);
        } else if (item.alertType === 'soft') {
          playSoftChime();
          setTimeout(resolve, 500);
        } else {
          resolve();
        }
      });
    };

    // Speak the message and wait for it to finish
    const speakMessage = (): Promise<void> => {
      return new Promise((resolve) => {
        if (!window.speechSynthesis) {
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(item.message);
        utterance.lang = voiceSettings.lang;
        utterance.rate = item.rate;
        utterance.pitch = item.pitch;
        utterance.volume = item.volume;

        const voices = window.speechSynthesis.getVoices();
        const ptVoice = voices.find(v => v.lang.startsWith('pt'));
        if (ptVoice) utterance.voice = ptVoice;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();

        // Safety timeout (max 15s per utterance)
        const timeout = setTimeout(() => {
          window.speechSynthesis.cancel();
          resolve();
        }, 15000);

        utterance.onend = () => { clearTimeout(timeout); resolve(); };
        utterance.onerror = () => { clearTimeout(timeout); resolve(); };

        setTimeout(() => {
          window.speechSynthesis.speak(utterance);
        }, 100);
      });
    };

    playAlert()
      .then(() => speakMessage())
      .then(() => {
        // Small gap between announcements
        return new Promise<void>(resolve => setTimeout(resolve, 800));
      })
      .then(() => {
        isProcessingRef.current = false;
        processQueue(); // Process next in queue
      });
  }, [voiceSettings.lang, playAlertSound, playSoftChime]);

  // Enqueue a voice announcement
  const enqueue = useCallback((item: QueueItem) => {
    console.log('[Voice Queue] Enqueuing:', item.message, '| Queue size:', queueRef.current.length);
    queueRef.current.push(item);
    processQueue();
  }, [processQueue]);

  const buildMessage = (ticketCode: string, counterNumber: number | string): string | null => {
    const match = ticketCode.match(/^([A-Z]+)-(\d+)$/);
    if (!match) return null;
    const ticketNumber = parseInt(match[2], 10);
    const counterNum = typeof counterNumber === 'string' ? parseInt(counterNumber, 10) : counterNumber;
    return `Senha ${numberToWords(ticketNumber)}, guichê ${numberToWords(counterNum)}.`;
  };

  const speak = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { isSoft?: boolean; ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
  ) => {
    if (!voiceSettings.enabled || !window.speechSynthesis) return;
    const message = buildMessage(ticketCode, counterNumber);
    if (!message) return;

    enqueue({
      message,
      rate: options.isSoft ? voiceSettings.speed * 0.85 : voiceSettings.speed,
      pitch: options.isSoft ? 0.9 : 1,
      volume: options.isSoft ? 0.8 : 1,
      alertType: 'none',
    });
  }, [voiceSettings, enqueue]);

  const callTicket = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: CallTicketOptions = {}
  ) => {
    if (!voiceSettings.enabled || !window.speechSynthesis) return;
    const message = buildMessage(ticketCode, counterNumber);
    if (!message) return;

    enqueue({
      message,
      rate: voiceSettings.speed,
      pitch: 1,
      volume: 1,
      alertType: options.withSound !== false ? 'normal' : 'none',
    });
  }, [voiceSettings, enqueue]);

  const repeatCallSoft = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
  ) => {
    if (!voiceSettings.enabled || !window.speechSynthesis) return;
    const message = buildMessage(ticketCode, counterNumber);
    if (!message) return;

    enqueue({
      message,
      rate: voiceSettings.speed * 0.85,
      pitch: 0.9,
      volume: 0.8,
      alertType: 'soft',
    });
  }, [voiceSettings, enqueue]);

  const stop = useCallback(() => {
    queueRef.current = [];
    isProcessingRef.current = false;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return {
    speak,
    stop,
    callTicket,
    repeatCallSoft,
    playAlertSound,
    playSoftChime,
    isSpeaking,
    voicesLoaded,
  };
}
