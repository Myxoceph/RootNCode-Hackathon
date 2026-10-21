import type { ThemeRole } from "@vagabonds/ui";

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
