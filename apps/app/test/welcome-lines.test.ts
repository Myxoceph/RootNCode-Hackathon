import type { WeatherResponse } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { inCity } from "../src/lib/place-names";
import { dayLabel, outing } from "../src/lib/welcome-lines";

describe("a city with its locative ending", () => {
  it("follows the city's last sounds", () => {
    expect(["Bursa", "Edirne", "Sinop", "Konya", "Hatay", "Kayseri", "İstanbul"].map(inCity)).toEqual([
      "Bursa'da",
      "Edirne'de",
      "Sinop'ta",
      "Konya'da",
      "Hatay'da",
      "Kayseri'de",
      "İstanbul'da",
    ]);
  });
});

describe("a forecast day's name", () => {
  const today = new Date(2026, 10, 6, 21, 30);
  it("is today, tomorrow, then the short weekday", () => {
    expect(dayLabel("2026-11-06", today, "tr")).toBe("Bugün");
    expect(dayLabel("2026-11-07", today, "tr")).toBe("Yarın");
    expect(dayLabel("2026-11-08", today, "tr")).toBe("Paz");
  });
});

const weather = (condition: WeatherResponse["daily"][number]["condition"], temperatureC: number, { isDay = true, rainLater = 0, available = true } = {}): WeatherResponse =>
  ({
    version: "0.3.29",
    lang: "tr",
    city: { code: "here", label: "Konumun" },
    available,
    current: available ? { temperatureC, precipitationMm: 0, condition, weatherCode: 0, isDay, observedAt: "2026-11-06T12:00" } : null,
    daily: [{ date: "2026-11-06", highC: temperatureC + 3, lowC: temperatureC - 4, precipitationProbability: rainLater, condition, weatherCode: 0, afternoonPrecipitationProbability: rainLater, afternoonRain: rainLater >= 50 }],
    advice: "none",
    attribution: "Open-Meteo",
  }) as WeatherResponse;

describe("whether it is a day to go out", () => {
  it("is a good day when it is mild and dry", () => {
    expect(outing(weather("clear", 21))).toEqual({ level: "good", reason: "perfect" });
    expect(outing(weather("cloudy", 12))).toEqual({ level: "good", reason: "cloudy" });
    expect(outing(weather("clear", 9, { isDay: false }))).toEqual({ level: "good", reason: "evening" });
  });

  it("calls for care in rain, snow, fog, cold, heat and rain on the way", () => {
    expect(outing(weather("rain", 14))?.reason).toBe("rain");
    expect(outing(weather("snow", -1))?.reason).toBe("snow");
    expect(outing(weather("fog", 8))?.reason).toBe("fog");
    expect(outing(weather("clear", 2))?.reason).toBe("cold");
    expect(outing(weather("clear", 33))?.reason).toBe("hot");
    expect(outing(weather("cloudy", 16, { rainLater: 70 }))).toEqual({ level: "fair", reason: "rainLater" });
  });

  it("is no day to go out in a storm, a hard frost or great heat", () => {
    expect(outing(weather("storm", 18))?.level).toBe("poor");
    expect(outing(weather("clear", -7))?.level).toBe("poor");
    expect(outing(weather("clear", 38))?.level).toBe("poor");
  });

  it("is left out without the weather", () => {
    expect(outing(null)).toBeNull();
    expect(outing(weather("clear", 20, { available: false }))).toBeNull();
  });
});
