import type { AudioPlayer } from "expo-audio";
import { useEffect, useSyncExternalStore } from "react";
import { getSnapshot as getCallSnapshot, subscribe as subscribeCall } from "./call-session";
import { getVoicePlaybackState, subscribeVoicePlayback } from "./voice";
import type { WeatherSceneConfig } from "./weather-scene";
import type { WeatherSoundTrack } from "./weather-sound-model";
import {
  computeThunderVolume,
  computeWeatherSoundGain,
  resolveWeatherSoundTrack,
} from "./weather-sound-model";

const TRACK_ASSETS: Record<WeatherSoundTrack, number> = {
  drizzle: require("../assets/sounds/weather-drizzle.m4a"),
  rain: require("../assets/sounds/weather-rain.m4a"),
  "heavy-rain": require("../assets/sounds/weather-heavy-rain.m4a"),
  snow: require("../assets/sounds/weather-snow.m4a"),
  breeze: require("../assets/sounds/weather-breeze.m4a"),
  night: require("../assets/sounds/weather-night.m4a"),
};

const THUNDER_ASSET: number = require("../assets/sounds/weather-thunder.m4a");

const FADE_DURATION_MS = 220;
const FADE_STEPS = 6;
const THUNDER_MAX_MS = 5_200;

let ambientPlayer: AudioPlayer | null = null;
let ambientTrack: WeatherSoundTrack | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let sessionConfigured = false;
let syncEpoch = 0;

let activeThunder: { player: AudioPlayer; cleanup: () => void } | null = null;

function clearFadeTimer(): void {
  if (fadeTimer !== null) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function stopActiveThunder(): void {
  const current = activeThunder;
  activeThunder = null;
  if (!current) return;
  current.cleanup();
  try {
    current.player.pause();
    current.player.remove();
  } catch {
    // Player may already be released on native teardown.
  }
}

function fadePlayerVolume(
  player: AudioPlayer,
  targetVolume: number,
  onComplete?: () => void,
): void {
  clearFadeTimer();
  const startVolume =
    typeof player.volume === "number" && Number.isFinite(player.volume) ? player.volume : 0;
  if (Math.abs(targetVolume - startVolume) < 0.015) {
    player.volume = targetVolume;
    onComplete?.();
    return;
  }
  let step = 0;
  fadeTimer = setInterval(
    () => {
      step += 1;
      const ratio = step / FADE_STEPS;
      try {
        player.volume = Math.max(
          0,
          Math.min(1, startVolume + (targetVolume - startVolume) * ratio),
        );
      } catch {
        clearFadeTimer();
        onComplete?.();
        return;
      }
      if (step >= FADE_STEPS) {
        clearFadeTimer();
        onComplete?.();
      }
    },
    Math.round(FADE_DURATION_MS / FADE_STEPS),
  );
}

function disposePlayer(player: AudioPlayer | null): void {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // Ignore already-disposed native player.
  }
}

async function ensureAmbientAudioMode(): Promise<void> {
  if (sessionConfigured) return;
  // Never disturb an active voice call or recording session.
  if (getCallSnapshot() !== null || getVoicePlaybackState().status === "playing") return;
  try {
    const { setAudioModeAsync } = await import("expo-audio");
    if (getCallSnapshot() !== null) return;
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
    sessionConfigured = true;
  } catch {
    // Ignore in non-native or sandboxed environments.
  }
}

export async function syncWeatherAmbientPlayback(params: {
  track: WeatherSoundTrack | null;
  targetGain: number;
  immediateVolume?: boolean;
}): Promise<void> {
  const epoch = ++syncEpoch;
  const { track, targetGain, immediateVolume = false } = params;

  if (!track || targetGain <= 0) {
    stopActiveThunder();
    const existing = ambientPlayer;
    if (!existing) {
      ambientTrack = null;
      return;
    }
    if (immediateVolume) {
      clearFadeTimer();
      ambientPlayer = null;
      ambientTrack = null;
      disposePlayer(existing);
      return;
    }
    fadePlayerVolume(existing, 0, () => {
      if (ambientPlayer === existing) {
        ambientPlayer = null;
        ambientTrack = null;
        disposePlayer(existing);
      }
    });
    return;
  }

  // Same track already loaded — just update volume smoothly (or instantly while dragging slider).
  if (ambientPlayer && ambientTrack === track) {
    if (immediateVolume) {
      clearFadeTimer();
      try {
        ambientPlayer.volume = targetGain;
        if (!ambientPlayer.playing) ambientPlayer.play();
      } catch {
        // Recover on next sync cycle.
      }
    } else {
      try {
        if (!ambientPlayer.playing) ambientPlayer.play();
      } catch {
        // Ignore transient native play failure.
      }
      fadePlayerVolume(ambientPlayer, targetGain);
    }
    return;
  }

  // Switching track: dispose previous ambient player before starting the new seamless loop.
  const previous = ambientPlayer;
  ambientPlayer = null;
  ambientTrack = null;
  clearFadeTimer();
  disposePlayer(previous);

  await ensureAmbientAudioMode();
  if (epoch !== syncEpoch) return;

  try {
    const { createAudioPlayer } = await import("expo-audio");
    if (epoch !== syncEpoch) return;
    const player = createAudioPlayer(TRACK_ASSETS[track], { keepAudioSessionActive: true });
    player.loop = true;
    player.volume = immediateVolume ? targetGain : 0;
    ambientPlayer = player;
    ambientTrack = track;
    player.play();
    if (!immediateVolume) {
      fadePlayerVolume(player, targetGain);
    }
  } catch {
    // Non-native / unsupported audio environment — fail silently without disturbing visuals.
  }
}

export async function triggerWeatherThunderclap(volume: number): Promise<void> {
  if (volume <= 0) return;
  if (getCallSnapshot() !== null || getVoicePlaybackState().status === "playing") return;
  stopActiveThunder();
  await ensureAmbientAudioMode();
  if (getCallSnapshot() !== null) return;
  try {
    const { createAudioPlayer } = await import("expo-audio");
    const player = createAudioPlayer(THUNDER_ASSET, { keepAudioSessionActive: true });
    player.loop = false;
    player.volume = Math.min(1, Math.max(0, volume));

    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) finish();
    });
    const cleanup = () => {
      if (finished) return;
      finished = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        subscription.remove();
      } catch {
        // Ignore subscription cleanup errors.
      }
    };
    const finish = () => {
      cleanup();
      if (activeThunder?.player === player) {
        activeThunder = null;
      }
      disposePlayer(player);
    };
    timer = setTimeout(finish, THUNDER_MAX_MS);
    activeThunder = { player, cleanup };
    player.play();
  } catch {
    // Ignore transient playback failure.
  }
}

export function releaseWeatherSound(): void {
  syncEpoch += 1;
  clearFadeTimer();
  stopActiveThunder();
  const existing = ambientPlayer;
  ambientPlayer = null;
  ambientTrack = null;
  sessionConfigured = false;
  disposePlayer(existing);
}

/**
 * Keeps full-app weather ambient sound in sync with live/preview weather, volume,
 * foreground state, active voice calls (full suspend), and Bot TTS speech (smooth duck).
 */
export function useWeatherAmbientSound(input: {
  config: WeatherSceneConfig | null;
  sceneEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  foreground: boolean;
}): {
  onLightningStrike: () => void;
} {
  const callActive = useSyncExternalStore(
    subscribeCall,
    () => getCallSnapshot() !== null,
    () => false,
  );
  const voiceSpeaking = useSyncExternalStore(
    subscribeVoicePlayback,
    () => getVoicePlaybackState().status === "playing",
    () => false,
  );

  const kind = input.config?.kind ?? null;
  const intensity = input.config?.intensity ?? 0;

  useEffect(() => {
    if (!kind) {
      void syncWeatherAmbientPlayback({ track: null, targetGain: 0 });
      return;
    }
    const track = resolveWeatherSoundTrack(kind);
    const targetGain = computeWeatherSoundGain({
      kind,
      intensity,
      masterVolume: input.soundVolume,
      soundEnabled: input.soundEnabled,
      sceneEnabled: input.sceneEnabled,
      active: input.foreground,
      suspended: callActive,
      ducked: voiceSpeaking,
    });
    void syncWeatherAmbientPlayback({
      track,
      targetGain,
      immediateVolume: ambientTrack === track && targetGain > 0 && !voiceSpeaking,
    });
  }, [
    callActive,
    input.foreground,
    input.sceneEnabled,
    input.soundEnabled,
    input.soundVolume,
    intensity,
    kind,
    voiceSpeaking,
  ]);

  useEffect(() => {
    return () => {
      releaseWeatherSound();
    };
  }, []);

  const onLightningStrike = () => {
    const thunderVol = computeThunderVolume({
      masterVolume: input.soundVolume,
      soundEnabled: input.soundEnabled,
      sceneEnabled: input.sceneEnabled,
      active: input.foreground,
      suspended: callActive,
      ducked: voiceSpeaking,
    });
    if (thunderVol <= 0) return;
    void triggerWeatherThunderclap(thunderVol);
  };

  return { onLightningStrike };
}
