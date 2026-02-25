export interface VoiceQueueState {
  isSpeaking: boolean;
  queueLength: number;
}

export interface EnqueueVoiceInput {
  message: string;
  isSoft: boolean;
  withSound: boolean;
  lang: string;
  speed: number;
}

type VoiceQueueListener = (state: VoiceQueueState) => void;

const listeners = new Set<VoiceQueueListener>();
const queue: EnqueueVoiceInput[] = [];

let isProcessing = false;
let isSpeaking = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const notify = () => {
  const snapshot: VoiceQueueState = {
    isSpeaking,
    queueLength: queue.length,
  };

  listeners.forEach((listener) => listener(snapshot));
};

const selectVoice = (lang: string): SpeechSynthesisVoice | null => {
  if (!window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const exact = voices.find((voice) => voice.lang === lang);
  if (exact) return exact;

  const langPrefix = lang.split('-')[0]?.toLowerCase();
  const byPrefix = voices.find((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
  if (byPrefix) return byPrefix;

  const fallbackPt = voices.find((voice) => voice.lang.toLowerCase().startsWith('pt'));
  return fallbackPt ?? null;
};

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

const speakItem = (item: EnqueueVoiceInput): Promise<void> => {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(item.message);
    utterance.lang = item.lang;
    utterance.rate = item.isSoft ? item.speed * 0.85 : item.speed;
    utterance.pitch = item.isSoft ? 0.9 : 1;
    utterance.volume = item.isSoft ? 0.8 : 1;

    const selectedVoice = selectVoice(item.lang);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      isSpeaking = false;
      notify();
      resolve();
    };

    utterance.onstart = () => {
      isSpeaking = true;
      notify();
    };

    utterance.onend = () => {
      settle();
    };

    utterance.onerror = (event) => {
      console.error('[VoiceQueue] Speech error:', event.error);
      settle();
    };

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 100);

    const safetyTimer = setTimeout(() => {
      if (window.speechSynthesis.speaking) {
        console.warn('[VoiceQueue] Safety timeout, cancelling stuck speech');
        window.speechSynthesis.cancel();
      }
      settle();
    }, 15000);
  });
};

const processQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const item = queue.shift()!;
    notify();

    if (item.withSound) {
      if (item.isSoft) {
        playSoftChimeInternal();
      } else {
        playAlertSoundInternal();
      }
      await delay(600);
    }

    await speakItem(item);

    if (queue.length > 0) {
      await delay(800);
    }
  }

  isProcessing = false;
  isSpeaking = false;
  notify();
};

export const enqueueVoice = (input: EnqueueVoiceInput) => {
  queue.push(input);
  notify();
  processQueue();
};

export const stopVoiceQueue = () => {
  queue.length = 0;
  isProcessing = false;
  isSpeaking = false;

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  notify();
};

export const getVoiceQueueState = (): VoiceQueueState => ({
  isSpeaking,
  queueLength: queue.length,
});

export const subscribeToVoiceQueue = (listener: VoiceQueueListener) => {
  listeners.add(listener);
  listener(getVoiceQueueState());

  return () => {
    listeners.delete(listener);
  };
};

export const playAlertSoundGlobal = () => {
  playAlertSoundInternal();
};

export const playSoftChimeGlobal = () => {
  playSoftChimeInternal();
};
