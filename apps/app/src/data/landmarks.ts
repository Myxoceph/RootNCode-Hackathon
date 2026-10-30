/**
 * Each city's best-known asset, by city code: the map opens a city on it and its streets.
 * The data has no measure of fame, so these are picked by hand; a city missing here (or
 * whose landmark has no coordinates yet) opens where its assets crowd.
 */
export const CITY_LANDMARKS: Record<string, string> = {
  bursa: "bursa-osmangazi-ulucami",
  hatay: "hatay-antakya-habib-i-neccar-camii",
  konya: "konya-karatay-yusuf-aga-kutuphanesi",
};
