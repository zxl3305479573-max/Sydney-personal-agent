import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assets = await vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(`${process.cwd()}/package.json`);
  const originalLoader = require.extensions[".m4a"];
  let assetCounter = 10;
  require.extensions[".m4a"] = (assetModule) => {
    assetCounter += 1;
    assetModule.exports = assetCounter;
  };
  return { require, originalLoader };
});

const audioMocks = vi.hoisted(() => ({
  callActive: false,
  voiceStatus: "idle" as "idle" | "playing" | "paused",
}));

vi.mock("expo-audio", () => ({
  createAudioPlayer: vi.fn(),
  setAudioModeAsync: vi.fn(async () => undefined),
}));

vi.mock("./call-session", () => ({
  getSnapshot: () => (audioMocks.callActive ? { botId: "bot-1", phase: "listening" } : null),
  subscribe: () => () => undefined,
}));

vi.mock("./voice", () => ({
  getVoicePlaybackState: () => ({ status: audioMocks.voiceStatus, canPause: false }),
  subscribeVoicePlayback: () => () => undefined,
}));

import {
  releaseWeatherSound,
  syncWeatherAmbientPlayback,
  triggerWeatherThunderclap,
} from "./weather-sound";
import {
  computeThunderVolume,
  computeWeatherSoundGain,
  resolveWeatherSoundTrack,
  weatherSoundDescription,
} from "./weather-sound-model";

function makeMockPlayer() {
  return {
    loop: false,
    volume: 1,
    playing: false,
    play: vi.fn(function (this: { playing: boolean }) {
      this.playing = true;
    }),
    pause: vi.fn(function (this: { playing: boolean }) {
      this.playing = false;
    }),
    remove: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  audioMocks.callActive = false;
  audioMocks.voiceStatus = "idle";
});

afterEach(() => {
  releaseWeatherSound();
  vi.useRealTimers();
});

afterAll(() => {
  if (assets.originalLoader) assets.require.extensions[".m4a"] = assets.originalLoader;
  else delete assets.require.extensions[".m4a"];
});

describe("weather ambient sound model & player", () => {
  it("maps all 10 scenes to distinct ambient tracks and localized descriptions", () => {
    expect(resolveWeatherSoundTrack("drizzle")).toBe("drizzle");
    expect(resolveWeatherSoundTrack("rain")).toBe("rain");
    expect(resolveWeatherSoundTrack("heavy-rain")).toBe("heavy-rain");
    expect(resolveWeatherSoundTrack("thunderstorm")).toBe("heavy-rain");
    expect(resolveWeatherSoundTrack("light-snow")).toBe("snow");
    expect(resolveWeatherSoundTrack("heavy-snow")).toBe("snow");
    expect(resolveWeatherSoundTrack("cloudy")).toBe("breeze");
    expect(resolveWeatherSoundTrack("fog")).toBe("breeze");
    expect(resolveWeatherSoundTrack("clear-day")).toBe("breeze");
    expect(resolveWeatherSoundTrack("clear-night")).toBe("night");

    expect(weatherSoundDescription("thunderstorm", "zh-CN")).toBe("暴雨雷鸣");
    expect(weatherSoundDescription("clear-night", "zh-CN")).toBe("星夜虫鸣");
    expect(weatherSoundDescription("drizzle", "en")).toBe("Soft drizzle");
  });

  it("scales ambient gain by master volume, weather intensity, suspension, and TTS ducking", () => {
    const drizzle = computeWeatherSoundGain({
      kind: "drizzle",
      intensity: 0.25,
      masterVolume: 0.6,
      soundEnabled: true,
      sceneEnabled: true,
      active: true,
      suspended: false,
      ducked: false,
    });
    const heavyRain = computeWeatherSoundGain({
      kind: "heavy-rain",
      intensity: 0.95,
      masterVolume: 0.6,
      soundEnabled: true,
      sceneEnabled: true,
      active: true,
      suspended: false,
      ducked: false,
    });
    const duckedRain = computeWeatherSoundGain({
      kind: "heavy-rain",
      intensity: 0.95,
      masterVolume: 0.6,
      soundEnabled: true,
      sceneEnabled: true,
      active: true,
      suspended: false,
      ducked: true,
    });

    expect(drizzle).toBeGreaterThan(0);
    expect(heavyRain).toBeGreaterThan(drizzle);
    expect(duckedRain).toBeGreaterThan(0);
    expect(duckedRain).toBeLessThan(heavyRain * 0.25);

    // Muted, scene disabled, backgrounded, or during voice call -> strict 0.
    expect(
      computeWeatherSoundGain({
        kind: "rain",
        intensity: 0.7,
        masterVolume: 0.8,
        soundEnabled: false,
        sceneEnabled: true,
        active: true,
        suspended: false,
        ducked: false,
      }),
    ).toBe(0);
    expect(
      computeWeatherSoundGain({
        kind: "rain",
        intensity: 0.7,
        masterVolume: 0.8,
        soundEnabled: true,
        sceneEnabled: true,
        active: true,
        suspended: true,
        ducked: false,
      }),
    ).toBe(0);
    expect(
      computeThunderVolume({
        masterVolume: 0.8,
        soundEnabled: true,
        sceneEnabled: true,
        active: true,
        suspended: false,
        ducked: false,
      }),
    ).toBeGreaterThan(0.5);
    expect(
      computeThunderVolume({
        masterVolume: 0.8,
        soundEnabled: true,
        sceneEnabled: true,
        active: true,
        suspended: false,
        ducked: true,
      }),
    ).toBe(0);
  });

  it("creates looping ambient player with mixWithOthers, updates volume live, switches tracks cleanly, and triggers thunder", async () => {
    const rainPlayer = makeMockPlayer();
    const snowPlayer = makeMockPlayer();
    const thunderPlayer = makeMockPlayer();
    vi.mocked(createAudioPlayer)
      .mockReturnValueOnce(rainPlayer as unknown as ReturnType<typeof createAudioPlayer>)
      .mockReturnValueOnce(thunderPlayer as unknown as ReturnType<typeof createAudioPlayer>)
      .mockReturnValueOnce(snowPlayer as unknown as ReturnType<typeof createAudioPlayer>);

    await syncWeatherAmbientPlayback({ track: "rain", targetGain: 0.42 });
    expect(setAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
    expect(rainPlayer.loop).toBe(true);
    expect(rainPlayer.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(rainPlayer.volume).toBeCloseTo(0.42, 2);

    // Dragging volume slider updates existing player immediately without recreating it.
    await syncWeatherAmbientPlayback({ track: "rain", targetGain: 0.75, immediateVolume: true });
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(rainPlayer.volume).toBe(0.75);

    // Lightning strike triggers one-shot thunderclap.
    await triggerWeatherThunderclap(0.68);
    expect(thunderPlayer.loop).toBe(false);
    expect(thunderPlayer.volume).toBe(0.68);
    expect(thunderPlayer.play).toHaveBeenCalledTimes(1);

    // Switching weather disposes previous ambient player and starts new loop.
    await syncWeatherAmbientPlayback({ track: "snow", targetGain: 0.3 });
    expect(rainPlayer.pause).toHaveBeenCalled();
    expect(rainPlayer.remove).toHaveBeenCalled();
    expect(snowPlayer.loop).toBe(true);
    expect(snowPlayer.play).toHaveBeenCalledTimes(1);

    // Active voice call blocks thunderclap and audio mode takeover.
    audioMocks.callActive = true;
    await triggerWeatherThunderclap(0.8);
    expect(createAudioPlayer).toHaveBeenCalledTimes(3);
  });
});
