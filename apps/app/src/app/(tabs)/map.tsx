import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, palette, spacing, Text, useTheme } from "@vagabonds/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CityAssetCards,
  CityAssetList,
  LIST_LOOKS,
} from "@/components/city-asset-cards";
import { MapAssetActions } from "@/components/map-asset-actions";
import { MapCityButtons } from "@/components/map-city-buttons";
import { MapSearch, placeIn } from "@/components/map-search";
import { MapTourGuide, MapTourReplayButton } from "@/components/map-tour-guide";
import { MobileOnlyNotice } from "@/components/mobile-only-notice";
import { SealScanDemo } from "@/components/seal-scan-demo";
import { WEB_NAV_SPACE } from "@/components/web-nav-bar";
import {
  CITY_LANDMARKS,
  communityAvailable,
  useCities,
  useCityMapAssets,
  useCommunity,
  useRelationsOf,
} from "@/data";
import { isAccount } from "@/lib/account-gate";
import { announce } from "@/lib/announce";
import { useMapTour } from "@/lib/map-tour";
import { useUnlockedAssets, useUnlocksSettled } from "@/lib/unlocked-assets";
import { whereFrom } from "@/lib/bearing";
import { rememberCity, rememberOpenCity, useOpenCity } from "@/lib/last-city";
import { NAVY } from "@/lib/page-navy";
import { bondsSpoken } from "@/lib/map-bonds";
import { relatedPlacesOf } from "@/lib/related-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import {
  areaAround,
  assetCategory,
  cityLandmark,
  MapLibreMap,
  mapTiers,
  spreadPlaces,
  useMapStatusBar,
  useMapTheme,
  type MapCity,
  type MapPin,
  type MapProvince,
  type MapProvinces,
  type MapSpots,
} from "@/map";
import { useLang, useMessages } from "@/i18n";

/** Room kept free for the search bar when framing Turkey. */
const HEADER_SPACE = 72;
/** Room kept free for the search bar over a city and the chosen asset's buttons under it, and for its cards. */
const CITY_TOP_SPACE = 136;
const CITY_CARDS_SPACE = 112;
/**
 * A wide web page lists a city's assets in a panel at the left of the map, under the search and the
 * chosen asset's buttons, all three in one column this wide. The search stays where it is from
 * Turkey to a city; the panel floats as the site's bar does, inset from the page's edges.
 */
const SIDE_PANEL = 400;
const SIDE_EDGE = spacing.md;
const SIDE_FROM = 900;
const NO_PINS: MapPin[] = [];
const UNLOCK_AFTER_RETURN_MS = 450;
/** Longer than the map's unlocking scene with its fog: its controls come back even if the scene never reports its end. */
const SCENE_LIMIT_MS = 10500;

/** Squared distance in degrees: enough to order a city's assets outward from its landmark. */
function nearness(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  return (from.lat - to.lat) ** 2 + (from.lng - to.lng) ** 2;
}

/**
 * Harita: Turkey rises out of the fog with every province border drawn quietly;
 * the provinces with assets are outlined in color and named. Tapping one of them
 * flies into that city, onto its best-known asset: a light mist falls over the map and
 * each asset waits on its own cloud as a locked seal; their cards line up at the bottom.
 * Choosing on the map or swiping the cards moves both. The search bar on top finds cities and
 * assets; in a city its back button returns.
 *
 * The map is visual only (ADR 0003): the search says the same in words (its list offers every
 * city with assets before anything is typed) and the cards list the city's assets.
 */
export default function MapScreen() {
  const m = useMessages();
  const lang = useLang();
  const night = useMapTheme().colors;
  useMapStatusBar();
  // The tab bar floats over the map: the cards and the framing keep clear of it.
  const tabBarHeight = useBottomTabBarHeight();
  // On the web the site's bar floats over the top of the map: what sits at the top keeps under it.
  const safe = useSafeAreaInsets();
  const insets =
    Platform.OS === "web"
      ? { ...safe, top: safe.top + WEB_NAV_SPACE - spacing.sm }
      : safe;
  const { width: screenWidth } = useWindowDimensions();
  const side = Platform.OS === "web" && screenWidth >= SIDE_FROM;
  /** Where the search (and the chosen asset's buttons) end: the side panel's list starts under them. */
  const [searchBottom, setSearchBottom] = useState(0);
  // The visitor may fold the list away for more map; it stays folded from city to city.
  const [listOpen, setListOpen] = useState(true);
  const [listIn] = useState(() => new Animated.Value(0));
  const listLook = LIST_LOOKS[useTheme().scheme];
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const allUnlocked = useUnlockedAssets();
  const { user } = useCommunity();
  // The map lies behind the seal screen: an asset opens on it only once the visitor is back and that screen has slid away.
  const [unlocked, setUnlocked] = useState(allUnlocked);
  // Unlocks that come in while the visitor's unlocks load (the map made ready behind the welcome page)
  // were made on an earlier run: the map takes them as they are, with no scene.
  const unlocksSettled = useUnlocksSettled();
  const [unlocksTaken, setUnlocksTaken] = useState(unlocksSettled);
  if (!unlocksTaken) {
    if (unlocked !== allUnlocked) setUnlocked(allUnlocked);
    if (unlocksSettled) setUnlocksTaken(true);
  }
  const [sceneRunning, setSceneRunning] = useState(false);
  // The web's "Kilidini aç": the asset's name while the "mobil uygulamada" notice is up.
  const [mobileOnly, setMobileOnly] = useState<string | null>(null);
  const cities = useCities();
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPlate, setSelectedPlate] = useState<number | null>(null);
  /** The city the camera has finished flying into: its cards come in only then. */
  const [landedPlate, setLandedPlate] = useState<number | null>(null);
  /** An asset found in the search waits here while the camera flies into its city. */
  const [pendingAsset, setPendingAsset] = useState<AssetSummary | null>(null);
  const [chosenAsset, setChosenAsset] = useState<string | null>(null);
  /** The asset the first-visit tour shows unlocking; never saved, dropped when the tour ends. */
  const [tourUnlock, setTourUnlock] = useState<string | null>(null);
  /** Where the tour's bubble points, as the map reports it. */
  const [tourSpots, setTourSpots] = useState<MapSpots | null>(null);
  // The city the map was left open on last time opens again at once, with no opening and no
  // flight: `restoring` is undefined until that is known, true until the city is there.
  const leftOpen = useOpenCity();
  const [restoring, setRestoring] = useState<boolean>();
  const [restored, setRestored] = useState(false);
  // "/map?city=bursa" opens a city straight away: a shareable link on the web, and the Ana Sayfa's cities (`at` makes the same city open again).
  const { city: cityParam, at: cityAskedAt } = useLocalSearchParams<{
    city?: string;
    at?: string;
  }>();

  const withAssets =
    cities.status === "success"
      ? cities.data.filter((city) => city.assetCount > 0)
      : [];
  const selectedCity =
    withAssets.find((city) => city.plate === selectedPlate) ?? null;
  const cityAssets = useCityMapAssets(selectedCity?.code ?? null);
  // Only the chosen city's answer counts; a failed request still opens the city, without assets.
  const cityAnswer =
    cityAssets.status === "success" &&
    cityAssets.data?.city === selectedCity?.code
      ? cityAssets.data
      : null;
  const cityReady = cityAnswer !== null || cityAssets.status === "error";

  const highlighted: MapProvince[] = withAssets.flatMap((city) =>
    city.plate === null
      ? []
      : [{ plate: city.plate, name: city.label, rank: city.assetCount }],
  );
  const located = useMemo(
    () =>
      (cityAnswer?.located ?? []).flatMap((asset) =>
        asset.coordinates ? [{ asset, at: asset.coordinates }] : [],
      ),
    [cityAnswer],
  );
  // A complex stands for its buildings: a building whose complex is on the map is not marked on its own,
  // and the complex is as well known as its best-known building.
  const { places, buildingsOf, prominenceOf } = useMemo(() => {
    const onMap = new Set(located.map(({ asset }) => asset.id));
    const counts = new Map<string, number>();
    const prominence = new Map<string, number>();
    for (const { asset } of located) {
      const place =
        asset.parentId && onMap.has(asset.parentId) ? asset.parentId : asset.id;
      if (place !== asset.id) counts.set(place, (counts.get(place) ?? 0) + 1);
      prominence.set(
        place,
        Math.max(prominence.get(place) ?? 0, asset.prominence),
      );
    }
    return {
      places: located.filter(
        ({ asset }) => !(asset.parentId && onMap.has(asset.parentId)),
      ),
      buildingsOf: counts,
      prominenceOf: prominence,
    };
  }, [located]);
  // Whether an unlocked place has anything related to it, known before its scene ends.
  const openedPlaces = useMemo(
    () =>
      places
        .filter(({ asset }) => allUnlocked.has(asset.id))
        .map(({ asset }) => asset.id),
    [places, allUnlocked],
  );
  const relations = useRelationsOf(openedPlaces);
  const placeIds = useMemo(
    () => new Set(places.map(({ asset }) => asset.id)),
    [places],
  );
  // The city opens on its best-known asset and the streets around it, not on all of it at once;
  // a landmark that is a building of a complex opens on the complex.
  const landmarkId = selectedCity
    ? CITY_LANDMARKS[selectedCity.code]
    : undefined;
  const landmarkParent = located.find(({ asset }) => asset.id === landmarkId)
    ?.asset.parentId;
  const landmark = selectedCity
    ? cityLandmark(
        places.map(({ asset, at }) => ({ id: asset.id, ...at })),
        landmarkParent && buildingsOf.has(landmarkParent)
          ? landmarkParent
          : landmarkId,
      )
    : null;
  // The cards start at the landmark and walk outwards from it.
  const cards = useMemo(
    () =>
      (landmark
        ? [...places].sort(
            (a, b) => nearness(a.at, landmark) - nearness(b.at, landmark),
          )
        : places
      ).map(({ asset }) => asset),
    [places, landmark],
  );
  // For those who cannot see the map: where each place lies from the landmark the cards start at.
  const whereOf = useMemo(() => {
    const out = new Map<string, string>();
    const from = landmark
      ? places.find(({ asset }) => asset.id === landmark.id)
      : undefined;
    if (!from) return out;
    for (const { asset, at } of places) {
      if (asset.id !== from.asset.id)
        out.set(asset.id, whereFrom({ name: from.asset.name, ...from.at }, at));
    }
    return out;
  }, [places, landmark]);
  // Places of their own on one spot (often one neighbourhood centre for several assets) are drawn
  // a little apart; the cards, the camera and the distances keep the real points.
  const drawnAt = useMemo(
    () =>
      spreadPlaces(
        places.map(({ asset, at }) => ({
          id: asset.id,
          lat: at.lat,
          lng: at.lng,
          approximate: at.approximate,
        })),
      ),
    [places],
  );
  // Zooming out, the least known places go first; the landmark stays to the last.
  const tiers = useMemo(
    () =>
      mapTiers(
        places.map(({ asset }) => ({
          id: asset.id,
          prominence: prominenceOf.get(asset.id) ?? 0,
        })),
        landmark?.id,
      ),
    [places, prominenceOf, landmark?.id],
  );
  // The city goes to the map once its assets are in, so the camera flies only once.
  const mapCity: MapCity | null =
    selectedCity?.plate != null && cityReady
      ? {
          plate: selectedCity.plate,
          assets: places.map(({ asset, at }) => ({
            id: asset.id,
            title: asset.name,
            lat: drawnAt.get(asset.id)?.lat ?? at.lat,
            lng: drawnAt.get(asset.id)?.lng ?? at.lng,
            category: assetCategory(asset.type.code),
            landmark: asset.id === landmark?.id,
            tier: tiers.get(asset.id) ?? 0,
            unlocked: unlocked.has(asset.id) || asset.id === tourUnlock,
            relatedTo: relatedPlacesOf(
              relations.byId[asset.id] ?? [],
              asset.id,
              placeIds,
            ),
          })),
          focus: landmark ? areaAround(landmark) : null,
        }
      : null;
  // A scene is due for an asset of the open city that has just unlocked. The search, buttons and cards
  // stay out of its way from the moment the visitor is back until it ends; the tab bar stays.
  const sceneDue =
    !reduceMotion &&
    selectedPlate !== null &&
    landedPlate === selectedPlate &&
    places.some(
      ({ asset }) => allUnlocked.has(asset.id) && !unlocked.has(asset.id),
    );
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        setUnlocked(allUnlocked);
        if (sceneDue) setSceneRunning(true);
      }, UNLOCK_AFTER_RETURN_MS);
      return () => clearTimeout(timer);
    }, [allUnlocked, sceneDue]),
  );
  useEffect(() => {
    if (!sceneRunning) return;
    const limit = setTimeout(() => setSceneRunning(false), SCENE_LIMIT_MS);
    return () => clearTimeout(limit);
  }, [sceneRunning]);
  const controlsHidden = sceneDue || sceneRunning;
  // What the map shows out of the fog, the tour's example too: the cards say the same.
  const shownOpen = useMemo(
    () => (tourUnlock ? new Set([...unlocked, tourUnlock]) : unlocked),
    [unlocked, tourUnlock],
  );
  const controls = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(controls, {
      toValue: controlsHidden ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [controlsHidden, controls]);

  // Typed as the map's own props, so a misnamed field fails the typecheck.
  const mapView: Omit<MapProvinces, "reveal"> = { highlighted, city: mapCity };
  const mapKey = JSON.stringify(mapView);
  // A new object only when what the map shows changes; the fog rises once either way.
  const provinces = useMemo<MapProvinces>(
    () => ({
      ...(JSON.parse(mapKey) as Omit<MapProvinces, "reveal">),
      // No opening over a city opened again as it was left, and no flight into it.
      reveal: !reduceMotion && !restored,
      motion: !reduceMotion && !restoring,
    }),
    [mapKey, reduceMotion, restored, restoring],
  );

  // Each city opens with its landmark chosen.
  const openingId = landmark?.id ?? null;
  useEffect(() => setChosenAsset(openingId), [openingId]);

  useEffect(() => {
    if (restoring !== undefined || leftOpen === undefined) return;
    if (!leftOpen || cityParam) return setRestoring(false);
    if (cities.status === "loading") return;
    const plate = withAssets.find((city) => city.code === leftOpen)?.plate;
    if (plate == null) return setRestoring(false);
    setSelectedPlate(plate);
    setRestored(true);
    setRestoring(true);
  }, [restoring, leftOpen, cityParam, cities.status, withAssets]);
  const mapShown = restoring === false || (restoring === true && mapCity !== null);
  // A city opened again comes in behind a veil in the welcome page's colour with its name on it:
  // nothing of the map coming in (its fog, seals and clouds drawn, its streets loaded) is seen.
  // The veil stays at least long enough to read the name, and lifts once the map says the city is
  // all there (or after VEIL_LIMIT_MS whatever it says), dissolving into the map.
  const { scheme: pageScheme } = useTheme();
  const veil = useRef(new Animated.Value(1)).current;
  const [veilGone, setVeilGone] = useState(false);
  const [readyPlate, setReadyPlate] = useState<number | null>(null);
  const [veilHeld, setVeilHeld] = useState(false);
  const [veilTimeUp, setVeilTimeUp] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!restored || veilGone) return;
      const held = setTimeout(() => setVeilHeld(true), VEIL_HOLD_MS);
      const limit = setTimeout(() => setVeilTimeUp(true), VEIL_LIMIT_MS);
      return () => {
        clearTimeout(held);
        clearTimeout(limit);
      };
    }, [restored, veilGone]),
  );
  const veilLifts = restored && !veilGone && veilHeld && (veilTimeUp || (readyPlate !== null && readyPlate === selectedPlate));
  useEffect(() => {
    if (!veilLifts) return;
    Animated.timing(veil, { toValue: 0, duration: reduceMotion ? 0 : VEIL_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
      setVeilGone(true),
    );
  }, [veilLifts, veil, reduceMotion]);
  // Once the city is there, the camera flies again as usual.
  useEffect(() => {
    if (restoring && landedPlate !== null && landedPlate === selectedPlate) setRestoring(false);
  }, [restoring, landedPlate, selectedPlate]);

  const cityFromParam = cityParam
    ? withAssets.find((city) => city.code === cityParam)?.plate
    : undefined;
  useEffect(() => {
    if (cityFromParam != null) setSelectedPlate(cityFromParam);
  }, [cityFromParam, cityAskedAt]);

  // The city open now is remembered for the next greeting (its weather), and the map opens on it
  // again next time; going back to the Turkey view forgets it, so the map opens on Turkey then.
  const openCode = selectedCity?.code;
  const hadCity = useRef(false);
  useEffect(() => {
    if (restoring === undefined) return;
    if (openCode) {
      hadCity.current = true;
      rememberCity(openCode);
      rememberOpenCity(openCode);
    } else if (hadCity.current) rememberOpenCity(null);
  }, [openCode, restoring]);

  function openCity(plate: number) {
    const city = withAssets.find((candidate) => candidate.plate === plate);
    if (!city) return;
    setSelectedPlate(plate);
    tour.onCityPicked();
    announce(m.map.cityOpened(city.label));
  }

  /** The place on the map that stands for an asset: itself, or the complex it is a building of. */
  function placeOf(asset: AssetSummary): string | null {
    return (
      cards.find((card) => card.id === asset.id || card.id === asset.parentId)
        ?.id ?? null
    );
  }

  /**
   * "Kilidini aç", on the map or a card: the tour's example scan while it plays, Ziyaret Mührü otherwise.
   * The web has no camera: there it says the asset is unlocked in the mobile app.
   */
  function unlockAsset(id: string) {
    if (tour.onUnlock(id)) return;
    if (Platform.OS === "web")
      setMobileOnly(
        located.find(({ asset }) => asset.id === id)?.asset.name ?? "",
      );
    else router.push({ pathname: "/visit-seal", params: { asset: id } });
  }

  /** The visitor chose an asset (on the map, in the cards or the search): its buttons under the search are for it now, and that is said once. */
  function chooseAsset(id: string) {
    setChosenAsset(id);
    const place = located.find(({ asset }) => asset.id === id);
    if (!place || id === chosenAsset) return;
    // The lines the map draws from it, said as well: what each related asset is and where.
    const bonds = bondsSpoken(place.at, relations.byId[id] ?? [], placeIds);
    announce(bonds ? `${m.map.selected(place.asset.name)} ${bonds}` : m.map.selected(place.asset.name));
  }

  function openAssetCard(asset: AssetSummary) {
    router.push({ pathname: "/monuments/[id]", params: { id: asset.id } });
  }

  /**
   * An asset picked in the search: chosen on the map if it is in the open city; in another city,
   * that city opens and the asset is chosen once the camera has landed, so it glides on to it.
   * One with no place on the map opens its card.
   */
  function pickAsset(asset: AssetSummary) {
    const plate =
      withAssets.find((city) => city.code === asset.city.code)?.plate ?? null;
    if (!asset.coordinates || plate === null) return openAssetCard(asset);
    if (plate === selectedPlate) {
      const place = placeOf(asset);
      if (place) chooseAsset(place);
      else openAssetCard(asset);
      return;
    }
    setPendingAsset(asset);
    openCity(plate);
  }

  function onCityLanded(plate: number) {
    setLandedPlate(plate);
    if (!pendingAsset || plate !== selectedPlate) return;
    const place = placeOf(pendingAsset);
    if (place) chooseAsset(place);
    else openAssetCard(pendingAsset);
    setPendingAsset(null);
  }

  function backToTurkey() {
    setSelectedPlate(null);
    setPendingAsset(null);
    tour.onLeftCity();
    announce(m.map.turkeyMap);
  }

  // The first-visit tour: the visitor unlocks an asset themselves, an example scan standing in for the camera.
  const tour = useMapTour({
    // Without a server the phone's own mark; with one, only an account's (signed out, it waits for the next one).
    account: !communityAvailable ? null : isAccount(user) ? user.id : undefined,
    // Not over a city opened again as it was left; next time, from the Turkey view.
    ready: !cityParam && restoring === false && !restored,
    still: reduceMotion,
    inCity: selectedPlate !== null,
    unlockShown: (id) => {
      setTourUnlock(id);
      if (!reduceMotion) setSceneRunning(true);
    },
    reset: () => {
      setTourUnlock(null);
      setSceneRunning(false);
      backToTurkey();
    },
    undoUnlock: () => {
      setTourUnlock(null);
      setSceneRunning(false);
    },
  });

  // "Bir esere dokun" points at the chosen asset: on a tour played again, the visitor may have unlocked it
  // already, so the tour chooses a locked one (the nearest to the landmark) instead.
  const chosenUnlocked = chosenAsset !== null && unlocked.has(chosenAsset);
  const firstLocked = cards.find((card) => !unlocked.has(card.id))?.id ?? null;
  useEffect(() => {
    if (tour.step === "choose" && chosenUnlocked && firstLocked)
      setChosenAsset(firstLocked);
  }, [tour.step, chosenUnlocked, firstLocked]);

  // Android's back button leaves the city before it leaves the screen.
  useEffect(() => {
    // Only Android has one; the web warns that BackHandler is not supported.
    if (selectedPlate === null || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setSelectedPlate(null);
        return true;
      },
    );
    return () => subscription.remove();
  }, [selectedPlate]);

  // The side panel slides in from the left once the city's cards are there, and out when folded away.
  const panelShown =
    side &&
    selectedCity !== null &&
    listOpen &&
    (landedPlate === selectedPlate || mapError !== null);
  useEffect(() => {
    if (reduceMotion) listIn.setValue(panelShown ? 1 : 0);
    else
      Animated.timing(listIn, {
        toValue: panelShown ? 1 : 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
  }, [panelShown, reduceMotion, listIn]);
  // The same function from render to render: the list's rows are drawn again only when their own asset changes.
  const listSelect = useRef<(id: string) => void>(() => {});
  listSelect.current = (id) => {
    chooseAsset(id);
    tour.onAssetTapped(!unlocked.has(id));
  };
  const onListSelect = useCallback((id: string) => listSelect.current(id), []);

  // The asset chosen in the open city, for the buttons under the search bar.
  const chosen = selectedCity
    ? (located.find(({ asset }) => asset.id === chosenAsset)?.asset ?? null)
    : null;
  // The cards come in once the camera has landed (or at once without a map: they are its content in
  // words), and the chosen asset's buttons with them.
  const cardsShown =
    selectedCity !== null &&
    cards.length > 0 &&
    (landedPlate === selectedPlate || mapError !== null);

  // Only what went wrong is said over the map; the rest is in the cards and the search.
  const notice = mapError
    ? { message: m.map.mapFailed(mapError) }
    : cities.status === "error"
      ? { message: cities.error.message, onRetry: cities.retry }
      : selectedCity && cityAssets.status === "error"
        ? { message: cityAssets.error.message, onRetry: cityAssets.retry }
        : null;
  const fitPadding = side
    ? selectedCity
      ? {
          top: insets.top + spacing.lg,
          right: spacing.xl,
          bottom: spacing.xl,
          left: (listOpen ? SIDE_PANEL : 0) + spacing.xl,
        }
      : {
          top: insets.top + HEADER_SPACE,
          right: spacing.lg,
          bottom: tabBarHeight + spacing.lg,
          left: spacing.lg,
        }
    : selectedCity
      ? {
          top: insets.top + CITY_TOP_SPACE,
          right: spacing.lg,
          bottom: tabBarHeight + CITY_CARDS_SPACE,
          left: spacing.lg,
        }
      : {
          top: insets.top + HEADER_SPACE,
          right: spacing.lg,
          bottom: tabBarHeight + spacing.lg,
          left: spacing.lg,
        };

  return (
    <View style={[styles.screen, { backgroundColor: night.mapBackground }]}>
      <Head>
        <title>
          {selectedCity
            ? m.common.title(`${selectedCity.label} · ${m.map.title}`)
            : m.common.title(m.map.title)}
        </title>
      </Head>
      {/* The map has no heading to see; screen readers start here. */}
      <Text headingLevel={1} style={styles.unseen}>
        {m.map.heading(selectedCity ? selectedCity.label : m.map.turkey)}
      </Text>
      {/* Waits to know whether a city opens again as it was left, and then for that city, so Turkey never shows first. */}
      {mapShown && (
        <MapLibreMap
          pins={NO_PINS}
          selectedId={selectedCity ? chosenAsset : null}
          onSelect={(id) => {
            if (!id) return;
            chooseAsset(id);
            tour.onAssetTapped(!unlocked.has(id));
          }}
          onSelectProvince={openCity}
          onLeaveCity={backToTurkey}
          onCityLanded={onCityLanded}
          onCityReady={setReadyPlate}
          onUnlock={unlockAsset}
          onInspect={(id) =>
            router.push({ pathname: "/monuments/[id]", params: { id } })
          }
          onOpenRelatedList={(id) =>
            router.push({
              pathname: "/related",
              params: {
                asset: id,
                name: located.find(({ asset }) => asset.id === id)?.asset.name,
              },
            })
          }
          onLeaveNote={(id) =>
            router.push({ pathname: "/note", params: { asset: id } })
          }
          onSceneEnd={() => {
            setSceneRunning(false);
            tour.onSceneEnd();
          }}
          watchSpots={
            tour.step === "city" ||
            tour.step === "choose" ||
            tour.step === "unlock"
          }
          onSpots={setTourSpots}
          offerUnlock={tour.step === "unlock"}
          onError={setMapError}
          fitPadding={fitPadding}
          provinces={provinces}
          style={StyleSheet.absoluteFill}
        />
      )}

      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: controls }]}
        pointerEvents={controlsHidden ? "none" : "box-none"}
        accessibilityElementsHidden={controlsHidden}
        importantForAccessibility={
          controlsHidden ? "no-hide-descendants" : "auto"
        }
      >
        {side && selectedCity && (
          <Animated.View
            pointerEvents={listOpen ? "auto" : "none"}
            aria-hidden={!listOpen}
            style={[
              styles.side,
              {
                backgroundColor: listLook.panel,
                borderColor: listLook.panelEdge,
                boxShadow: listLook.shadow,
              },
              {
                top: searchBottom + spacing.sm,
                transform: [
                  {
                    translateX: listIn.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SIDE_PANEL - SIDE_EDGE, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {cardsShown && (
              <CityAssetList
                title={m.map.sitesIn(placeIn(selectedCity.label, lang))}
                assets={cards}
                whereOf={whereOf}
                buildingsOf={buildingsOf}
                selectedId={chosenAsset}
                unlocked={shownOpen}
                onSelect={onListSelect}
                onHide={() => setListOpen(false)}
              />
            )}
          </Animated.View>
        )}
        {side && selectedCity && cardsShown && !listOpen && !tour.step && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={m.map.showSitesIn(placeIn(selectedCity.label, lang), cards.length)}
            onPress={() => setListOpen(true)}
            style={({
              pressed,
              hovered,
            }: {
              pressed: boolean;
              hovered?: boolean;
            }) => [
              styles.showList,
              { top: searchBottom + spacing.sm, left: SIDE_EDGE },
              {
                backgroundColor: listLook.panel,
                borderColor: hovered ? listLook.edgeHover : listLook.panelEdge,
                boxShadow: listLook.shadow,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="list" size={18} color={listLook.text} />
            <Text
              variant="label"
              colorValue={listLook.text}
              style={styles.showListText}
            >
              {m.map.sitesInCount(placeIn(selectedCity.label, lang), cards.length)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={listLook.text} />
          </Pressable>
        )}
        {/* First in reading order, as on the screen; the tour's step bar takes its place while it plays. */}
        {!tour.step && (
          <View
            style={[StyleSheet.absoluteFill, styles.over]}
            pointerEvents="box-none"
          >
            <MapSearch
              city={selectedCity}
              cities={withAssets}
              top={insets.top + spacing.sm}
              onBack={backToTurkey}
              onPickCity={openCity}
              onPickAsset={pickAsset}
              notice={notice}
              trailing={
                <MapTourReplayButton
                  onPress={() => {
                    setTourSpots(null);
                    tour.replay();
                  }}
                />
              }
              below={
                chosen && cardsShown ? <MapAssetActions asset={chosen} /> : null
              }
              column={
                side
                  ? { left: SIDE_EDGE, width: SIDE_PANEL - SIDE_EDGE }
                  : undefined
              }
              onBottom={setSearchBottom}
            />
          </View>
        )}
        {cardsShown && !side && (
          <View style={[styles.cards, { bottom: tabBarHeight + spacing.sm }]}>
            <CityAssetCards
              assets={cards}
              whereOf={whereOf}
              buildingsOf={buildingsOf}
              selectedId={chosenAsset}
              unlocked={shownOpen}
              onUnlock={unlockAsset}
              onSelect={(id) => {
                chooseAsset(id);
                // A card counts as a tap for the tour: the map then offers "Kilidini aç" over it.
                tour.onAssetTapped(!unlocked.has(id));
              }}
            />
          </View>
        )}
        {!selectedCity && (
          <MapCityButtons
            cities={withAssets}
            bottom={tabBarHeight + spacing.sm}
            onOpen={openCity}
          />
        )}
      </Animated.View>
      {tour.scanning && <SealScanDemo onDone={tour.onScanned} />}
      <MobileOnlyNotice name={mobileOnly} onClose={() => setMobileOnly(null)} />
      {tour.step && (
        <MapTourGuide
          step={tour.step}
          spots={tourSpots}
          top={insets.top}
          onNext={tour.next}
          onPrevious={tour.canGoBack ? tour.previous : null}
          onSkip={tour.skip}
        />
      )}
      {restored && !veilGone && (
        <Animated.View
          pointerEvents="none"
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.veil, { opacity: veil, backgroundColor: pageScheme === "dark" ? NAVY : palette.white }]}
        >
          {selectedCity && (
            <Text colorValue={pageScheme === "dark" ? palette.altin200 : palette.altin600} style={styles.veilName}>
              {selectedCity.label}
            </Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

/** The least a city opened again stays behind its veil, the most it waits for the map, and how long the veil takes to dissolve. */
const VEIL_HOLD_MS = 700;
const VEIL_LIMIT_MS = 6000;
const VEIL_FADE_MS = 450;

const styles = StyleSheet.create({
  veil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  veilName: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 52,
  },
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  unseen: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  /** The search over the cards, its list too. */
  over: {
    zIndex: 2,
    elevation: 2,
  },
  /** The side panel of a wide web page: dark glass down the map's left edge. */
  side: {
    position: "absolute",
    paddingTop: 14,
    bottom: SIDE_EDGE,
    left: SIDE_EDGE,
    width: SIDE_PANEL - SIDE_EDGE,
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
  },
  /** The folded list's way back: a pill under the search. */
  showList: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
  },
  showListText: {
    fontFamily: "HankenGrotesk_600SemiBold",
  },
  cards: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
