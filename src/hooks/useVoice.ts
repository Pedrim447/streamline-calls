import { useCallback, useRef, useState } from 'react';

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

  // Thousands
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

  // Hundreds
  if (num >= 100) {
    result += hundreds[Math.floor(num / 100)];
    num %= 100;
    if (num > 0) result += ' e ';
  }

  // Tens and units
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

export function useVoice(settings: Partial<VoiceSettings> = {}) {
  const voiceSettings = { ...defaultSettings, ...settings };
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((ticketCode: string, counterNumber: number | string, isSoft = false) => {
    if (!voiceSettings.enabled || !window.speechSynthesis) {
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Parse ticket code (e.g., "P-850" -> type "P", number 850)
    const match = ticketCode.match(/^([A-Z]+)-(\d+)$/);
    if (!match) {
      console.warn('Invalid ticket code format:', ticketCode);
      return;
    }

    const [, ticketType, ticketNumberStr] = match;
    const ticketNumber = parseInt(ticketNumberStr, 10);
    const counterNum = typeof counterNumber === 'string' ? parseInt(counterNumber, 10) : counterNumber;

    // Convert to spoken format
    const ticketTypeSpoken = ticketType === 'P' ? 'preferencial' : 'normal';
    const ticketNumberSpoken = numberToWords(ticketNumber);
    const counterSpoken = numberToWords(counterNum);

    // Build the message
    let message = voiceSettings.template
      .replace('{ticket}', `${ticketTypeSpoken} ${ticketNumberSpoken}`)
      .replace('{counter}', counterSpoken);

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = voiceSettings.lang;
    
    // Softer voice for repeat calls: slower, lower pitch
    if (isSoft) {
      utterance.rate = voiceSettings.speed * 0.85; // 15% slower
      utterance.pitch = 0.9; // Slightly lower pitch
      utterance.volume = 0.8; // Slightly quieter
    } else {
      utterance.rate = voiceSettings.speed;
      utterance.pitch = 1;
      utterance.volume = 1;
    }

    // Try to find a Portuguese voice
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith('pt'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [voiceSettings]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Original alert sound - more attention-grabbing
  const playAlertSound = useCallback(() => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    oscillator.start();
    
    // Fade out
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.stop(audioContext.currentTime + 0.5);
  }, []);

  // Soft chime sound - gentle and calming for repeat calls
  const playSoftChime = useCallback(() => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a gentle two-note chime
    const playNote = (frequency: number, startTime: number, duration: number, volume: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      // Gentle envelope
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + startTime);
      gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + startTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);

      oscillator.start(audioContext.currentTime + startTime);
      oscillator.stop(audioContext.currentTime + startTime + duration);
    };

    // Play soft chime notes (C5 and E5 - pleasant interval)
    playNote(523.25, 0, 0.6, 0.15);      // C5 - quiet
    playNote(659.25, 0.15, 0.7, 0.12);   // E5 - even quieter
  }, []);

  const callTicket = useCallback((ticketCode: string, counterNumber: number | string, withSound = true) => {
    if (withSound) {
      playAlertSound();
      // Small delay before voice
      setTimeout(() => {
        speak(ticketCode, counterNumber, false);
      }, 600);
    } else {
      speak(ticketCode, counterNumber, false);
    }
  }, [speak, playAlertSound]);

  // Soft repeat call with gentle chime and calmer voice
  const repeatCallSoft = useCallback((ticketCode: string, counterNumber: number | string) => {
    playSoftChime();
    // Small delay before soft voice
    setTimeout(() => {
      speak(ticketCode, counterNumber, true);
    }, 500);
  }, [speak, playSoftChime]);

  return {
    speak,
    stop,
    callTicket,
    repeatCallSoft,
    playAlertSound,
    playSoftChime,
    isSpeaking,
  };
}
