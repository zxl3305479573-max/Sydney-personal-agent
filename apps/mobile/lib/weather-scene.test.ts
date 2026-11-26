import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveActiveWeatherScene,
  weatherOverlayOpacityScale,
} from "./weather-atmosphere-helpers";
import {
  buildWeatherSceneConfig,
  classifyWmoWeatherScene,
  classifyWwoWeatherScene,
  createCloudWisps,
  createRainParticles,
  createRainSplashes,
  createSnowParticles,
  createStarParticles,
  generateLightningBolt,
  resolveWeatherSceneKind,
  weatherSceneLabel,
} from "./weather-scene";
import {
  getWeatherScenePreferences,
  resetWeatherScenePreferencesForTest,
  setWeatherSceneEnabled,
  setWeatherScenePreview,
} from "./weather-scene-state";

beforeEach(() => {
  resetWeatherScenePreferencesForTest();
});

afterEach(() => {
  resetWeatherScenePreferencesForTest();
});

describe("weather-scene classification & physics", () => {
  it("maps WMO codes and real-time precipitation rates to distinct rain/thunder/snow/fog/clear scenes", () => {
    expect(classifyWmoWeatherScene(0, { isDay: true })).toBe("clear-day");
    expect(classifyWmoWeatherScene(0, { isDay: false })).toBe("clear-night");
    expect(classifyWmoWeatherScene(3, { isDay: true })).toBe("cloudy");
    expect(classifyWmoWeatherScene(45, { isDay: true })).toBe("fog");
    expect(classifyWmoWeatherScene(51, { isDay: true, precipitationMm: 0.4 })).toBe("drizzle");
    expect(classifyWmoWeatherScene(63, { isDay: true, precipitationMm: 4.2 })).toBe("rain");
    expect(classifyWmoWeatherScene(65, { isDay: true, precipitationMm: 12.0 })).toBe("heavy-rain");
    expect(classifyWmoWeatherScene(95, { isDay: true, precipitationMm: 9.0 })).toBe("thunderstorm");
    expect(classifyWmoWeatherScene(71, { isDay: false, snowfallCm: 0.4 })).toBe("light-snow");
    expect(classifyWmoWeatherScene(75, { isDay: false, snowfallCm: 2.5 })).toBe("heavy-snow");
    // Escalates light-rain code when live rainfall rate is heavy.
    expect(classifyWmoWeatherScene(61, { isDay: true, precipitationMm: 9.5 })).toBe("heavy-rain");
  });

  it("maps wttr.in WWO codes to thunderstorm, fog, rain intensity, snow, and clear night", () => {
    expect(classifyWwoWeatherScene(113, { isDay: false })).toBe("clear-night");
    expect(classifyWwoWeatherScene(248, { isDay: true })).toBe("fog");
    expect(classifyWwoWeatherScene(296, { isDay: true })).toBe("drizzle");
    expect(classifyWwoWeatherScene(308, { isDay: true })).toBe("heavy-rain");
    expect(classifyWwoWeatherScene(389, { isDay: true })).toBe("thunderstorm");
    expect(classifyWwoWeatherScene(338, { isDay: false })).toBe("heavy-snow");
  });

  it("scales raindrop count, size, speed, and ground splashes continuously with rainfall intensity", () => {
    const drizzle = buildWeatherSceneConfig("drizzle", { precipitationMm: 0.3, windSpeedKmh: 6 });
    const moderate = buildWeatherSceneConfig("rain", { precipitationMm: 4.5, windSpeedKmh: 16 });
    const heavy = buildWeatherSceneConfig("heavy-rain", {
      precipitationMm: 14.0,
      windSpeedKmh: 28,
    });
    const storm = buildWeatherSceneConfig("thunderstorm", {
      precipitationMm: 18.0,
      windSpeedKmh: 38,
    });

    expect(drizzle.hasRain).toBe(true);
    expect(drizzle.hasSplashes).toBe(true);
    expect(drizzle.hasLightning).toBe(false);
    expect(storm.hasLightning).toBe(true);

    // Rain density & splash count strictly increase with real rainfall rate.
    expect(drizzle.rainDropCount).toBeLessThan(moderate.rainDropCount);
    expect(moderate.rainDropCount).toBeLessThan(heavy.rainDropCount);
    expect(drizzle.rainSplashCount).toBeLessThan(moderate.rainSplashCount);
    expect(moderate.rainSplashCount).toBeLessThan(heavy.rainSplashCount);

    // Raindrops grow longer/thicker and fall faster as rain intensifies.
    expect(drizzle.rainLengthRange[1]).toBeLessThan(heavy.rainLengthRange[1]);
    expect(drizzle.rainWidthRange[1]).toBeLessThan(heavy.rainWidthRange[1]);
    expect(drizzle.rainDurationMsRange[0]).toBeGreaterThan(heavy.rainDurationMsRange[0]);

    // Wind slant deepens with wind speed.
    expect(drizzle.windAngleDeg).toBeLessThan(moderate.windAngleDeg);
    expect(moderate.windAngleDeg).toBeLessThan(storm.windAngleDeg);

    // Deterministic particle & splash builders honor configured counts and bounds.
    const drops = createRainParticles(heavy);
    const splashes = createRainSplashes(heavy);
    expect(drops).toHaveLength(heavy.rainDropCount);
    expect(splashes).toHaveLength(heavy.rainSplashCount);
    for (const splash of splashes) {
      expect(splash.xRatio).toBeGreaterThanOrEqual(0.04);
      expect(splash.xRatio).toBeLessThanOrEqual(0.96);
      expect(splash.rippleWidth).toBeGreaterThanOrEqual(16);
      expect(splash.bounceHeight).toBeGreaterThanOrEqual(8);
    }
  });

  it("scales snowfall particles, size, sway, and frost band from light snow to heavy snow", () => {
    const lightSnow = buildWeatherSceneConfig("light-snow", { snowfallCm: 0.3, windSpeedKmh: 8 });
    const heavySnow = buildWeatherSceneConfig("heavy-snow", { snowfallCm: 3.0, windSpeedKmh: 24 });

    expect(lightSnow.hasSnow).toBe(true);
    expect(lightSnow.hasRain).toBe(false);
    expect(lightSnow.snowFlakeCount).toBeLessThan(heavySnow.snowFlakeCount);
    expect(lightSnow.groundFrostOpacity).toBeLessThan(heavySnow.groundFrostOpacity);
    expect(createSnowParticles(heavySnow)).toHaveLength(heavySnow.snowFlakeCount);
  });

  it("generates lightning bolt SVG paths, night stars, and cloud/fog wisps cleanly", () => {
    const bolt = generateLightningBolt(390, 844, 42);
    expect(bolt.mainPath.startsWith("M")).toBe(true);
    expect(bolt.mainPath).toContain("L");
    expect(bolt.branchPath?.startsWith("M")).toBe(true);

    const starry = buildWeatherSceneConfig("clear-night");
    expect(createStarParticles(starry)).toHaveLength(starry.starCount);

    const fog = buildWeatherSceneConfig("fog");
    expect(createCloudWisps(fog).length).toBeGreaterThanOrEqual(4);
    expect(weatherSceneLabel("thunderstorm", "zh-CN")).toBe("雷阵雨");
    expect(weatherSceneLabel("heavy-rain", "en")).toBe("Heavy rain");
  });

  it("resolves active app-wide scene, reading-route opacity softening, preview override, and toggle state", async () => {
    expect(weatherOverlayOpacityScale("/image")).toBe(0);
    expect(weatherOverlayOpacityScale("/weather")).toBe(1);
    expect(weatherOverlayOpacityScale("/thread")).toBeLessThan(weatherOverlayOpacityScale("/"));

    const liveRain = resolveActiveWeatherScene({
      enabled: true,
      previewScene: null,
      weather: {
        temperatureC: 16,
        condition: "rainy",
        isDay: true,
        fetchedAt: Date.now(),
        weatherCode: 65,
        scene: "heavy-rain",
        precipitationMm: 10.2,
        windSpeedKmh: 22,
      },
      pathname: "/",
    });
    expect(liveRain.visible).toBe(true);
    expect(liveRain.isPreview).toBe(false);
    expect(liveRain.config?.kind).toBe("heavy-rain");

    // Preview overrides live weather and enables the overlay automatically.
    await setWeatherSceneEnabled(false);
    expect(getWeatherScenePreferences().enabled).toBe(false);
    await setWeatherScenePreview("thunderstorm");
    expect(getWeatherScenePreferences()).toEqual({ enabled: true, previewScene: "thunderstorm" });

    const previewed = resolveActiveWeatherScene({
      enabled: true,
      previewScene: "thunderstorm",
      weather: null,
      pathname: "/chats",
    });
    expect(previewed.visible).toBe(true);
    expect(previewed.isPreview).toBe(true);
    expect(previewed.config?.hasLightning).toBe(true);
    expect(resolveWeatherSceneKind({ condition: "snowy", snowfallCm: 2.0 })).toBe("heavy-snow");
  });
});
