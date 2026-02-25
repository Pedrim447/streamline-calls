import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getVoiceQueueState,
  playAlertSoundGlobal,
  playSoftChimeGlobal,
  stopVoiceQueue,
  subscribeToVoiceQueue,
  type EnqueueVoiceInput,
  enqueueVoice,
} from '@/lib/voiceQueueManager';

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

export function useVoice(settings: Partial<VoiceSettings> = {}) {
  const voiceSettings = useMemo(() => ({ ...defaultSettings, ...settings }), [settings]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(getVoiceQueueState().isSpeaking);
  const [queueLength, setQueueLength] = useState(getVoiceQueueState().queueLength);

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
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  useEffect(() => {
    return subscribeToVoiceQueue((state) => {
      setIsSpeaking(state.isSpeaking);
      setQueueLength(state.queueLength);
    });
  }, []);

  const buildMessage = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
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

  const enqueueMessage = useCallback((input: Omit<EnqueueVoiceInput, 'lang' | 'speed'>) => {
    enqueueVoice({
      ...input,
      lang: voiceSettings.lang,
      speed: voiceSettings.speed,
    });
  }, [voiceSettings.lang, voiceSettings.speed]);

  const playAlertSound = useCallback(() => {
    playAlertSoundGlobal();
  }, []);

  const playSoftChime = useCallback(() => {
    playSoftChimeGlobal();
  }, []);

  const callTicket = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: CallTicketOptions = {}
  ) => {
    if (!voiceSettings.enabled) return;

    const message = buildMessage(ticketCode, counterNumber, {
      ticketType: options.ticketType,
      clientName: options.clientName,
      organName: options.organName,
    });

    if (!message) return;

    enqueueMessage({
      message,
      isSoft: false,
      withSound: options.withSound !== false,
    });
  }, [voiceSettings.enabled, buildMessage, enqueueMessage]);

  const repeatCallSoft = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
  ) => {
    if (!voiceSettings.enabled) return;

    const message = buildMessage(ticketCode, counterNumber, options);
    if (!message) return;

    enqueueMessage({
      message,
      isSoft: true,
      withSound: true,
    });
  }, [voiceSettings.enabled, buildMessage, enqueueMessage]);

  const stop = useCallback(() => {
    stopVoiceQueue();
  }, []);

  // Backward compatibility (direct/priority speech): clear queue and speak now
  const speak = useCallback((
    ticketCode: string,
    counterNumber: number | string,
    options: { isSoft?: boolean; ticketType?: 'normal' | 'preferential'; clientName?: string | null; organName?: string | null } = {}
  ) => {
    if (!voiceSettings.enabled) return;

    const message = buildMessage(ticketCode, counterNumber, options);
    if (!message) return;

    stopVoiceQueue();
    enqueueMessage({
      message,
      isSoft: options.isSoft ?? false,
      withSound: false,
    });
  }, [voiceSettings.enabled, buildMessage, enqueueMessage]);

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
