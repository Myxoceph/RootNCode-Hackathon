import type { AssetSummary, MyAchievement, WeatherResponse } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { inCity } from "../src/lib/place-names";
import { dayAsset, dayNumber, nearestBadge, weatherLine, weatherMood } from "../src/lib/welcome-lines";

const badge = (title: string, current: number, target: number, rule: MyAchievement["rule"] = { kind: "visit_count", count: target }, earnedAt: string | null = null) =>
  ({ code: title.toLowerCase(), title, description: "", badge: "🏅", points: 10, rule, imageUrl: null, earnedAt, progress: { current, target } }) as MyAchievement;

/** A day with an even day number (the badge's day) and the next one (the tip's). */
const even = (() => {
  const day = new Date(2026, 10, 6, 12);
  return dayNumber(day) % 2 === 0 ? day : new Date(2026, 10, 7, 12);
})();
const odd = new Date(even.getTime() + 86_400_000);

describe("the badge nearest to hand", () => {
  it("is the one with the fewest steps left, not yet earned", () => {
    const items = [badge("Bronz Gezgin", 3, 5), badge("Gümüş Gezgin", 3, 10), badge("İlk Adım", 1, 1, undefined, "2026-11-01T10:00:00.000Z")];
    expect(nearestBadge(items)).toMatchObject({ title: "Bronz Gezgin", badge: "🏅", left: 2, unit: "asset", current: 3, target: 5 });
  });

  it("is the one further along on a tie", () => {
    expect(nearestBadge([badge("Az", 0, 2), badge("Çok", 6, 8)])?.title).toBe("Çok");
  });

  it("says what it asks for in its rule's words", () => {
    expect(nearestBadge([badge("Mühürcü", 1, 3, { kind: "proven_visits", count: 3 })])?.unit).toBe("seal");
    expect(nearestBadge([badge("Kalem", 0, 1, { kind: "contributions", count: 1, contribution: "notes" })])?.unit).toBe("note");
    expect(nearestBadge([badge("Yolcu", 1, 3, { kind: "within", level: "city", count: 3, hours: 48 })])?.unit).toBe("city");
  });

  it("is none when every badge is earned", () => {
    expect(nearestBadge([badge("İlk Adım", 1, 1, undefined, "2026-11-01T10:00:00.000Z")])).toBeNull();
  });
});

const weather = (condition: WeatherResponse["daily"][number]["condition"], temperatureC: number, available = true): WeatherResponse =>
  ({
    version: "0.3.29",
    lang: "tr",
    city: { code: "bursa", label: "Bursa" },
    available,
    current: available ? { temperatureC, precipitationMm: 0, condition, weatherCode: 0, isDay: true, observedAt: "2026-11-06T12:00" } : null,
    daily: [],
    advice: "none",
    attribution: "Open-Meteo",
  }) as WeatherResponse;

describe("the greeting's weather line", () => {
  it("names the city, the degrees and a word on going out", () => {
    expect(weatherLine(weather("clear", 14.4))).toBe("Bursa'da bugün 14°, gezmek için güzel bir gün.");
  });

  it("sends the visitor indoors in rain, and says so in heat and frost", () => {
    expect(weatherLine(weather("rain", 12))).toBe("Bursa'da bugün 12°, yağmurlu; kapalı eserler için iyi bir gün.");
    expect(weatherLine(weather("clear", 34))).toContain("çok sıcak");
    expect(weatherLine(weather("cloudy", -2))).toContain("soğuk");
  });

  it("speaks of the evening after dark", () => {
    const night = weather("clear", 7);
    night.current!.isDay = false;
    expect(weatherLine(night)).toBe("Bursa'da bugün 7°, akşam yürüyüşü için güzel bir hava.");
  });

  it("gives the word on going out alone, for the weather card", () => {
    expect(weatherMood(weather("fog", 8))).toBe("sisli; yakındaki eserlerle başla");
    expect(weatherMood(null)).toBeNull();
  });

  it("is left out without the weather", () => {
    expect(weatherLine(null)).toBeNull();
    expect(weatherLine(weather("clear", 10, false))).toBeNull();
  });
});

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

describe("the site of the day", () => {
  const asset = (id: string, photo = true) => ({ id, cover: photo ? { alt: id } : null }) as unknown as AssetSummary;
  const assets = [asset("c"), asset("a"), asset("b", false), asset("d")];

  it("is one with a photo, the same all day and another the next day", () => {
    const today = dayAsset(assets, even);
    expect(today?.cover).not.toBeNull();
    expect(dayAsset([...assets].reverse(), even)?.id).toBe(today?.id);
    expect(dayAsset(assets, odd)?.id).not.toBe(today?.id);
  });

  it("is none without a photo", () => {
    expect(dayAsset([asset("b", false)], even)).toBeNull();
    expect(dayAsset([], even)).toBeNull();
  });
});
