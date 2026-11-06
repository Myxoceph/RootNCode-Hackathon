import type { ThemeRole } from "@vagabonds/ui";

import { getLang } from "@/i18n";

/** Bursa food stops along the route. Sample content (see ./README.md). */
export interface Dish {
  id: string;
  name: string;
  /** Where to eat it, and how far from the monument's exit. */
  where: string;
  description: string;
  /** How the dish ties into the waqf and the bazaar. */
  context: string;
  /** The dish's own color on its tile band and stamp. */
  color: Extract<ThemeRole, "warning" | "highlight" | "success" | "primary">;
}

export const bursaDishes: Dish[] = [
  {
    id: "pideli-kofte",
    name: "Pideli Köfte",
    where: "Muradiye Külliyesi çıkışında · 4 dk",
    description: "Közde pişen köfte, tereyağında ıslanmış pide ve yoğurtla gelir; çarşı esnafının öğle yemeği.",
    context: "Külliyelerin çevresindeki dükkânlar vakfa kira öderdi; yemek de ticaret de aynı sokakta dönerdi.",
    color: "warning",
  },
  {
    id: "kestane-sekeri",
    name: "Kestane Şekeri",
    where: "Koza Han avlusunda · 2 dk",
    description: "Uludağ eteklerinin kestanesi şekerle sabırla kaynatılır; Bursa dönüşü herkesin kutusu.",
    context: "Koza Han, ipek ticaretinin merkeziydi; avlusu bugün de çay ve tatlı molasının adresi.",
    color: "highlight",
  },
  {
    id: "cantik",
    name: "Cantık",
    where: "Ulu Cami arkası, fırınlar sokağı · 3 dk",
    description: "Kıymalı, domatesli Bursa pidesi; sabah fırından ilk çıkan.",
    context: "Cami çevresindeki fırınlar, imaretlerin ekmek ihtiyacıyla birlikte büyüdü.",
    color: "success",
  },
  {
    id: "iskender",
    name: "İskender",
    where: "Hanlar Bölgesi · 5 dk",
    description: "Yatık döner, tereyağı ve pideyle; 19. yüzyıl Bursa'sından kalma bir aile tarifi.",
    context: "Hanlar Bölgesi yüzyıllardır kentin yemek ve ticaret kalbi.",
    color: "primary",
  },
];

const bursaDishesEn: Dish[] = [
  {
    id: "pideli-kofte",
    name: "Pideli Köfte",
    where: "At the Muradiye Complex exit · 4 min",
    description: "Char-grilled meatballs on pide soaked in butter, with yoghurt; the lunch of the bazaar's tradesmen.",
    context: "The shops around the complexes paid rent to the waqf; food and trade went on in the same street.",
    color: "warning",
  },
  {
    id: "kestane-sekeri",
    name: "Candied Chestnuts",
    where: "In the Koza Han courtyard · 2 min",
    description: "Chestnuts from the foot of Uludağ, simmered patiently in sugar; the box everyone brings home from Bursa.",
    context: "Koza Han was the centre of the silk trade; its courtyard is still the place for tea and something sweet.",
    color: "highlight",
  },
  {
    id: "cantik",
    name: "Cantık",
    where: "Behind the Grand Mosque, the street of bakeries · 3 min",
    description: "Bursa's pide with minced meat and tomato; the first out of the oven in the morning.",
    context: "The bakeries around the mosque grew along with the soup kitchens' need for bread.",
    color: "success",
  },
  {
    id: "iskender",
    name: "İskender",
    where: "Hanlar District · 5 min",
    description: "Horizontal döner with butter and pide; a family recipe from 19th-century Bursa.",
    context: "The Hanlar District has been the city's heart of food and trade for centuries.",
    color: "primary",
  },
];

/** The food stops in the app's language. */
export function bursaDishesNow(): Dish[] {
  return getLang() === "en" ? bursaDishesEn : bursaDishes;
}
