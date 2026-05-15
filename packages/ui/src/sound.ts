export type SoundName = 'card-play' | 'draw' | 'shuffle' | 'uno-call' | 'countdown' | 'win' | 'button';

export const soundManifest: Record<SoundName, string> = {
  'card-play': '/audio/silence.mp3',
  draw: '/audio/silence.mp3',
  shuffle: '/audio/silence.mp3',
  'uno-call': '/audio/silence.mp3',
  countdown: '/audio/silence.mp3',
  win: '/audio/silence.mp3',
  button: '/audio/silence.mp3',
};

export function createSoundController(prefersReducedMotion = false) {
  let muted = prefersReducedMotion;
  return {
    setMuted(value: boolean) { muted = value; },
    play(name: SoundName) {
      if (muted || typeof Audio === 'undefined') return;
      const audio = new Audio(soundManifest[name]);
      void audio.play().catch(() => undefined);
    },
  };
}
