import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from 'react';

/**
 * Sound and haptics — SPEC §30/§31.
 *
 * Meaningful money actions get sound AND haptics. Navigation gets micro-feedback
 * only. Nothing here is decoration: the motifs are how a Grow becomes memorable.
 *
 * M6 — `expo-haptics` is officially web-supported in SDK 57 via the Web
 * Vibration API, so these are called unguarded with no `Platform.OS` check. The
 * real limit is narrower: iOS Safari exposes no Vibration API and silently
 * no-ops, which is exactly the degradation you would want anyway.
 *
 * Browsers block audio before a user gesture, so the players are primed on the
 * first real tap rather than at mount.
 */
type Feedback = {
  /** Money added. Subtle upward organic motif. */
  grow(): void;
  /** Milestone crossed. Richer resolution, distinct haptic. */
  unlock(): void;
  /** Navigation and selection. Haptic only — never a sound. */
  tap(): void;
};

/**
 * Playback level, on top of the already-quiet source files.
 *
 * The motifs are deliberately soft: money actions should be *noticed*, not
 * announced, and a savings app that startles you is one you mute. Turn these
 * down rather than regenerating the audio.
 */
const VOLUME = { grow: 0.55, unlock: 0.6 } as const;

const FeedbackContext = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const growPlayer = useAudioPlayer(require('../../assets/sfx/grow.wav'));
  const unlockPlayer = useAudioPlayer(require('../../assets/sfx/unlock.wav'));
  const primed = useRef(false);

  const play = useCallback((player: ReturnType<typeof useAudioPlayer>, volume: number) => {
    try {
      player.volume = volume;
      // seekTo(0) then play() is what retriggers a one-shot that is already
      // at its end — without it a second Grow in a row is silent.
      player.seekTo(0);
      player.play();
      primed.current = true;
    } catch {
      // A blocked or unavailable audio context must never break the money path.
    }
  }, []);

  const value = useMemo<Feedback>(
    () => ({
      grow() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        play(growPlayer, VOLUME.grow);
      },
      unlock() {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        play(unlockPlayer, VOLUME.unlock);
      },
      tap() {
        Haptics.selectionAsync().catch(() => {});
      },
    }),
    [growPlayer, unlockPlayer, play],
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback(): Feedback {
  const ctx = useContext(FeedbackContext);
  // Feedback is never load-bearing — a missing provider must not crash a screen.
  return ctx ?? { grow() {}, unlock() {}, tap() {} };
}
