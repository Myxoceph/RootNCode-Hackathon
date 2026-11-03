import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

/** Set once the map's tour has been played to the end or skipped: it plays on the first visit only. */
const SEEN_KEY = "vagabonds-map-tour-seen";
/** For now the tour plays every time the map opens; false makes it the first visit only again. */
const EVERY_TIME = true;

/**
 * The steps of the tour, in order. The visitor takes each one themselves, except `scan`: the
 * camera does not open, an example of it plays instead. `done` is its last word, over the map as it was.
 */
export type MapTourStep = "city" | "choose" | "unlock" | "scan" | "opened" | "done";

export const MAP_TOUR_STEPS: Record<MapTourStep, { title: string; body: string }> = {
  city: { title: "Bir şehir seç", body: "Renkli illerde eser var. Birine dokun." },
  choose: { title: "Bir esere dokun", body: "Eserler sisin içinde kilitli. İşaretli esere dokun." },
  unlock: { title: "Düğmeye dokun", body: "Eserin kilidini buradan açarsın." },
  scan: { title: "Mührü kameraya göster", body: "Eserde işaretli kısmı kameraya tanıt." },
  opened: { title: "Kilit açıldı", body: "Sis kalkar; eserin hikâyesi ve bağlantıları açılır." },
  done: { title: "Sıra sende", body: "Gösterim bitti, harita baştan seninle." },
};

/** The steps counted on the card's dots; `done` stands outside the count. */
export const COUNTED_STEPS: MapTourStep[] = ["city", "choose", "unlock", "scan", "opened"];

/** The map's own opening (the fog lifting) plays out before the tour starts. */
const START_AFTER_MS = 5200;
const START_AFTER_STILL_MS = 800;
/** "Sıra sende" stays this long over the map once it is back as it was. */
const DONE_MS = 4500;
/** Longer than the unlocking scene: the tour ends even if the scene never reports its end. */
const OPENED_LIMIT_MS = 10000;
const OPENED_STILL_MS = 4500;
/** A moment on the opened asset after its scene, before the map goes back. */
const AFTER_SCENE_MS = 3500;

async function seen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) !== null;
  } catch {
    // Unreadable storage: better shown again than never.
    return false;
  }
}

function markSeen() {
  void AsyncStorage.setItem(SEEN_KEY, "1").catch(() => {});
}

export interface MapTourDriver {
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
  /** An asset was tapped on the map. */
  onAssetTapped: () => void;
  /** "Kilidini aç" was tapped; true when the tour takes it instead of the camera screen. */
  onUnlock: (id: string) => boolean;
  /** The example scan has recognised the seal. */
  onScanned: () => void;
  /** The map's unlocking scene is over. */
  onSceneEnd: () => void;
  skip: () => void;
}

/**
 * The map's first-visit tour: a card at the top says what to do next, and the visitor does it:
 * picks a city, taps an asset, taps "Kilidini aç". Instead of the camera screen an example scan
 * plays, then the asset unlocks with its scene. After that the map goes back to how it was, the
 * unlock is dropped, and the tour never plays again.
 */
export function useMapTour(driver: MapTourDriver): MapTour {
  const [due, setDue] = useState(false);
  const [step, setStep] = useState<MapTourStep | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The driver changes on every render; the timers read the latest one.
  const live = useRef(driver);
  live.current = driver;

  useEffect(() => {
    let active = true;
    if (EVERY_TIME) setDue(true);
    else seen().then((done) => active && setDue(!done));
    return () => {
      active = false;
    };
  }, []);

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

  const finish = () => {
    markSeen();
    live.current.reset();
    setStep("done");
    after(DONE_MS, () => setStep(null));
  };

  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    setDue(false);
    setScanning(null);
    markSeen();
    live.current.reset();
    setStep(null);
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
    onAssetTapped: () => {
      if (step === "choose") setStep("unlock");
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
      after(live.current.still ? OPENED_STILL_MS : OPENED_LIMIT_MS, finish);
    },
    onSceneEnd: () => {
      if (step === "opened") after(AFTER_SCENE_MS, finish);
    },
    skip,
  };
}
