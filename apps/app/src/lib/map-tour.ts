import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

/** Set once the map's tour has been played to the end or skipped, for each account on this phone. */
const SEEN_KEY = "vagabonds-map-tour-seen";

/**
 * The steps of the tour, in order. The visitor takes each one themselves, except `scan`: the
 * camera does not open, an example of it plays instead. `done` is its last word, over the map as it was.
 */
export type MapTourStep = "city" | "choose" | "unlock" | "scan" | "opened" | TabStep | "done";

/** After the unlock, the tour walks the tab bar, one tab a step, on "İleri". */
export type TabStep = "tab-map" | "tab-rehber" | "tab-camera" | "tab-monuments" | "tab-settings";
export const TAB_STEPS: TabStep[] = ["tab-map", "tab-rehber", "tab-camera", "tab-monuments", "tab-settings"];
/** The tab (its route name) each step points at. */
export const TAB_OF: Record<TabStep, string> = {
  "tab-map": "map",
  "tab-rehber": "rehber",
  "tab-camera": "camera",
  "tab-monuments": "monuments",
  "tab-settings": "settings",
};

export function isTabStep(step: MapTourStep | null): step is TabStep {
  return step !== null && step.startsWith("tab-");
}

export const MAP_TOUR_STEPS: Record<MapTourStep, { title: string; body: string }> = {
  city: { title: "Bir şehir seç", body: "Renkli illerde eser var. Birine dokun." },
  choose: { title: "Bir esere dokun", body: "Eserler sisin içinde kilitli. İşaretli esere dokun." },
  unlock: { title: "Düğmeye dokun", body: "Eserin kilidini buradan açarsın." },
  scan: { title: "Ziyaret Mührü kamerası", body: "Gerçekte bu düğme kamerayı açar; eserde işaretli kısmı kameraya tanıtırsın." },
  opened: { title: "Kilit açıldı", body: "Sis kalkar; eserin hikâyesi ve bağlantıları açılır." },
  "tab-map": {
    title: "Harita",
    body: "Eserler sisin içinde kilitli; ziyaret edip mührünü bastığında kilidi açılır. Alttaki Zamanda yolculuk ile yüzyıllara göre keşfet.",
  },
  "tab-rehber": {
    title: "Rehber",
    body: "Eserler hakkında soru sor; rota, yol tarifi ve yöresel lezzet önerisi al.",
  },
  "tab-camera": {
    title: "Kamera",
    body: "Ziyaret Mührü ile kilidi aç, Taşın Dili ile kitabeleri günümüz Türkçesiyle oku.",
  },
  "tab-monuments": {
    title: "Eserler",
    body: "Tüm eserleri şehre ve türe göre gez, adıyla ara.",
  },
  "tab-settings": {
    title: "Profil",
    body: "Mühürlerin, rozetlerin, notların ve kaydettiğin rotalar; ayarlar da burada.",
  },
  done: { title: "Sıra sende", body: "Gösterim bitti, harita baştan seninle." },
};

/** The steps counted on the card's dots; `done` stands outside the count. */
export const COUNTED_STEPS: MapTourStep[] = ["city", "choose", "unlock", "scan", "opened", ...TAB_STEPS];

/** The map's own opening (the fog lifting) plays out before the tour starts. */
const START_AFTER_MS = 5200;
const START_AFTER_STILL_MS = 800;
/** "Sıra sende" stays this long over the map once it is back as it was. */
const DONE_MS = 4500;
/** Longer than the unlocking scene: the tour ends even if the scene never reports its end. */
const OPENED_LIMIT_MS = 12000;
const OPENED_STILL_MS = 4500;
/** A moment on the opened asset after its scene, before the map goes back. */
const AFTER_SCENE_MS = 2000;

/** Where it is kept that `account` has seen the tour; without a server (no accounts) the phone's own. */
export function tourSeenKey(account: string | null): string {
  return account ? `${SEEN_KEY}:${account}` : SEEN_KEY;
}

/** Whether `account` has played the tour to the end or skipped it on this phone. */
export async function tourSeen(account: string | null): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(tourSeenKey(account))) !== null;
  } catch {
    // Unreadable storage: better shown again than never.
    return false;
  }
}

export function markTourSeen(account: string | null) {
  void AsyncStorage.setItem(tourSeenKey(account), "1").catch(() => {});
}

export interface MapTourDriver {
  /** The signed-in account's id: the tour plays on its first visit only. Null without a server; undefined while loading. */
  account: string | null | undefined;
  /** False when a link asked for a city: the visitor came for it, not for the tour. */
  ready: boolean;
  /** "Hareketi azalt": no fog to wait for and no scene to watch. */
  still: boolean;
  /** A city is open: a tour starting then skips "Bir şehir seç". */
  inCity: boolean;
  /** Shows the asset unlocking with its scene; it is never saved. */
  unlockShown: (id: string) => void;
  /** Back to the map as the visitor found it: Turkey, nothing unlocked by the tour. */
  reset: () => void;
  /** Takes the tour's unlock back: the asset is locked again, the city stays open. */
  undoUnlock: () => void;
}

export interface MapTour {
  /** The step on screen; null when the tour is not playing. */
  step: MapTourStep | null;
  /** The asset whose seal the example scan shows, while it plays. */
  scanning: string | null;
  /** A city was picked: the camera flies to it, and the bubble waits for its assets. */
  onCityPicked: () => void;
  /** Back to Turkey: the tour asks for a city again. */
  onLeftCity: () => void;
  /** An asset was tapped on the map; only a locked one has "Kilidini aç" to go on with. */
  onAssetTapped: (locked: boolean) => void;
  /** "Kilidini aç" was tapped; true when the tour takes it instead of the camera screen. */
  onUnlock: (id: string) => boolean;
  /** The example scan has recognised the seal. */
  onScanned: () => void;
  /** The map's unlocking scene is over. */
  onSceneEnd: () => void;
  /** "İleri" on a tab step: the next tab, or the end after the last. */
  next: () => void;
  /** "Önceki": the step before, where there is one to go back to (not the scan or the scene). */
  previous: () => void;
  canGoBack: boolean;
  skip: () => void;
  /** The map's "?" button: the tour again from the start, over the map as it was. */
  replay: () => void;
}

/**
 * The map's tour, on an account's first visit (the "?" button plays it again): a card at the top says what to do next, and the visitor does it:
 * picks a city, taps an asset, taps "Kilidini aç". Instead of the camera screen an example scan
 * plays, then the asset unlocks with its scene. After that the map goes back to how it was and the
 * unlock is dropped; then each tab of the bar is shown with a line on it, on "İleri".
 */
export function useMapTour(driver: MapTourDriver): MapTour {
  const [due, setDue] = useState(false);
  const [step, setStep] = useState<MapTourStep | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The driver changes on every render; the timers read the latest one.
  const live = useRef(driver);
  live.current = driver;

  const account = driver.account;
  useEffect(() => {
    if (account === undefined) return;
    let active = true;
    void tourSeen(account).then((done) => active && setDue(!done));
    return () => {
      active = false;
    };
  }, [account]);

  const after = (ms: number, next: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(next, ms);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Starts once, when the map is ready and the opening fog has lifted.
  const canStart = due && driver.ready;
  useEffect(() => {
    if (!canStart) return;
    setDue(false);
    after(driver.still ? START_AFTER_STILL_MS : START_AFTER_MS, () => setStep(live.current.inCity ? "choose" : "city"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart]);

  // The unlock is over: the map goes back as it was, and the tab bar's tour begins.
  const toTabs = () => {
    live.current.reset();
    setStep("tab-map");
  };

  const finish = () => {
    if (timer.current) clearTimeout(timer.current);
    markTourSeen(live.current.account ?? null);
    setStep("done");
    after(DONE_MS, () => setStep(null));
  };

  const next = () => {
    if (!isTabStep(step)) return;
    const following = TAB_STEPS[TAB_STEPS.indexOf(step) + 1];
    if (following) setStep(following);
    else finish();
  };

  const previous = () => {
    if (step === "choose") {
      // Back out of the city to pick one again.
      live.current.reset();
      setStep("city");
    } else if (step === "unlock") {
      setStep("choose");
    } else if (step === "scan") {
      // The example camera closes; "Kilidini aç" is still over the asset.
      setScanning(null);
      setStep("unlock");
    } else if (step === "opened") {
      if (timer.current) clearTimeout(timer.current);
      live.current.undoUnlock();
      setStep("unlock");
    } else if (step === "tab-map") {
      // The map went back to Turkey when the tabs began: the tour picks up from the city.
      setStep("city");
    } else if (isTabStep(step)) {
      setStep(TAB_STEPS[TAB_STEPS.indexOf(step) - 1] ?? "tab-map");
    }
  };
  /** Only the first step has nothing before it; "Önceki" stays on screen, dimmed there. */
  const canGoBack = step !== null && step !== "city" && step !== "done";

  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    setDue(false);
    setScanning(null);
    markTourSeen(live.current.account ?? null);
    live.current.reset();
    setStep(null);
  };

  const replay = () => {
    if (timer.current) clearTimeout(timer.current);
    setDue(false);
    setScanning(null);
    live.current.reset();
    setStep("city");
  };

  return {
    step,
    scanning,
    onCityPicked: () => {
      if (step === "city") setStep("choose");
    },
    onLeftCity: () => {
      if (step === "choose" || step === "unlock") setStep("city");
    },
    onAssetTapped: (locked) => {
      if (step === "choose" && locked) setStep("unlock");
    },
    onUnlock: (id) => {
      if (step !== "choose" && step !== "unlock") return false;
      setStep("scan");
      setScanning(id);
      return true;
    },
    onScanned: () => {
      if (step !== "scan" || !scanning) return;
      live.current.unlockShown(scanning);
      setScanning(null);
      setStep("opened");
      after(live.current.still ? OPENED_STILL_MS : OPENED_LIMIT_MS, toTabs);
    },
    onSceneEnd: () => {
      if (step === "opened") after(AFTER_SCENE_MS, toTabs);
    },
    next,
    previous,
    canGoBack,
    skip,
    replay,
  };
}
