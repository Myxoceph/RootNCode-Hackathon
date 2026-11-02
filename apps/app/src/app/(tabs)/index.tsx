import type { AssetSummary } from "@vagabonds/contracts";
import { spacing } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import Head from "expo-router/head";
import { useEffect, useMemo, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CityAssetCards } from "@/components/city-asset-cards";
import { MapAssetActions } from "@/components/map-asset-actions";
import { MapSearch } from "@/components/map-search";
import { CITY_LANDMARKS, useCities, useCityMapAssets } from "@/data";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { areaAround, assetCategory, cityLandmark, MapLibreMap, mapTiers, useMapStatusBar, useMapTheme, type MapCity, type MapPin, type MapProvince, type MapProvinces } from "@/map";

/** Room kept free for the search bar when framing Turkey. */
const HEADER_SPACE = 72;
/** Room kept free for the search bar over a city and the chosen asset's buttons under it, and for its cards. */
const CITY_TOP_SPACE = 118;
const CITY_CARDS_SPACE = 112;
const NO_PINS: MapPin[] = [];

/** Squared distance in degrees: enough to order a city's assets outward from its landmark. */
function nearness(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
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
  const night = useMapTheme().colors;
  useMapStatusBar();
  // The tab bar floats over the map: the cards and the framing keep clear of it.
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const cities = useCities();
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPlate, setSelectedPlate] = useState<number | null>(null);
  /** The city the camera has finished flying into: its cards come in only then. */
  const [landedPlate, setLandedPlate] = useState<number | null>(null);
  /** An asset found in the search waits here while the camera flies into its city. */
  const [pendingAsset, setPendingAsset] = useState<AssetSummary | null>(null);
  const [chosenAsset, setChosenAsset] = useState<string | null>(null);
  // "/?city=bursa" opens a city straight away: a shareable link on the web.
  const { city: cityParam } = useLocalSearchParams<{ city?: string }>();

  const withAssets = cities.status === "success" ? cities.data.filter((city) => city.assetCount > 0) : [];
  const selectedCity = withAssets.find((city) => city.plate === selectedPlate) ?? null;
  const cityAssets = useCityMapAssets(selectedCity?.code ?? null);
  // Only the chosen city's answer counts; a failed request still opens the city, without assets.
  const cityAnswer = cityAssets.status === "success" && cityAssets.data?.city === selectedCity?.code ? cityAssets.data : null;
  const cityReady = cityAnswer !== null || cityAssets.status === "error";

  const highlighted: MapProvince[] = withAssets.flatMap((city) =>
    city.plate === null ? [] : [{ plate: city.plate, name: city.label, rank: city.assetCount }],
  );
  const located = useMemo(() => (cityAnswer?.located ?? []).flatMap((asset) => (asset.coordinates ? [{ asset, at: asset.coordinates }] : [])), [cityAnswer]);
  // A complex stands for its buildings: a building whose complex is on the map is not marked on its own,
  // and the complex is as well known as its best-known building.
  const { places, buildingsOf, prominenceOf } = useMemo(() => {
    const onMap = new Set(located.map(({ asset }) => asset.id));
    const counts = new Map<string, number>();
    const prominence = new Map<string, number>();
    for (const { asset } of located) {
      const place = asset.parentId && onMap.has(asset.parentId) ? asset.parentId : asset.id;
      if (place !== asset.id) counts.set(place, (counts.get(place) ?? 0) + 1);
      prominence.set(place, Math.max(prominence.get(place) ?? 0, asset.prominence));
    }
    return { places: located.filter(({ asset }) => !(asset.parentId && onMap.has(asset.parentId))), buildingsOf: counts, prominenceOf: prominence };
  }, [located]);
  // The city opens on its best-known asset and the streets around it, not on all of it at once;
  // a landmark that is a building of a complex opens on the complex.
  const landmarkId = selectedCity ? CITY_LANDMARKS[selectedCity.code] : undefined;
  const landmarkParent = located.find(({ asset }) => asset.id === landmarkId)?.asset.parentId;
  const landmark = selectedCity
    ? cityLandmark(
        places.map(({ asset, at }) => ({ id: asset.id, ...at })),
        landmarkParent && buildingsOf.has(landmarkParent) ? landmarkParent : landmarkId,
      )
    : null;
  // The cards start at the landmark and walk outwards from it.
  const cards = useMemo(
    () => (landmark ? [...places].sort((a, b) => nearness(a.at, landmark) - nearness(b.at, landmark)) : places).map(({ asset }) => asset),
    [places, landmark],
  );
  // Zooming out, the least known places go first; the landmark stays to the last.
  const tiers = useMemo(
    () => mapTiers(places.map(({ asset }) => ({ id: asset.id, prominence: prominenceOf.get(asset.id) ?? 0 })), landmark?.id),
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
            lat: at.lat,
            lng: at.lng,
            category: assetCategory(asset.type.code),
            landmark: asset.id === landmark?.id,
            tier: tiers.get(asset.id) ?? 0,
          })),
          focus: landmark ? areaAround(landmark) : null,
        }
      : null;
  // Typed as the map's own props, so a misnamed field fails the typecheck.
  const mapView: Omit<MapProvinces, "reveal"> = { highlighted, city: mapCity };
  const mapKey = JSON.stringify(mapView);
  // A new object only when what the map shows changes; the fog rises once either way.
  const provinces = useMemo<MapProvinces>(
    () => ({ ...(JSON.parse(mapKey) as Omit<MapProvinces, "reveal">), reveal: !reduceMotion }),
    [mapKey, reduceMotion],
  );

  // Each city opens with its landmark chosen.
  const openingId = landmark?.id ?? null;
  useEffect(() => setChosenAsset(openingId), [openingId]);

  const cityFromParam = cityParam ? withAssets.find((city) => city.code === cityParam)?.plate : undefined;
  useEffect(() => {
    if (cityFromParam != null) setSelectedPlate(cityFromParam);
  }, [cityFromParam]);

  function openCity(plate: number) {
    const city = withAssets.find((candidate) => candidate.plate === plate);
    if (!city) return;
    setSelectedPlate(plate);
    announce(`${city.label} açıldı.`);
  }

  /** The place on the map that stands for an asset: itself, or the complex it is a building of. */
  function placeOf(asset: AssetSummary): string | null {
    return cards.find((card) => card.id === asset.id || card.id === asset.parentId)?.id ?? null;
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
    const plate = withAssets.find((city) => city.code === asset.city.code)?.plate ?? null;
    if (!asset.coordinates || plate === null) return openAssetCard(asset);
    if (plate === selectedPlate) {
      const place = placeOf(asset);
      if (place) setChosenAsset(place);
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
    if (place) setChosenAsset(place);
    else openAssetCard(pendingAsset);
    setPendingAsset(null);
  }

  function backToTurkey() {
    setSelectedPlate(null);
    setPendingAsset(null);
    announce("Türkiye haritası.");
  }

  // Android's back button leaves the city before it leaves the screen.
  useEffect(() => {
    // Only Android has one; the web warns that BackHandler is not supported.
    if (selectedPlate === null || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelectedPlate(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedPlate]);

  // The asset chosen in the open city, for the buttons under the search bar.
  const chosen = selectedCity ? (located.find(({ asset }) => asset.id === chosenAsset)?.asset ?? null) : null;

  // Only what went wrong is said over the map; the rest is in the cards and the search.
  const notice = mapError
    ? { message: `Harita çizilemedi: ${mapError}` }
    : cities.status === "error"
      ? { message: cities.error.message, onRetry: cities.retry }
      : selectedCity && cityAssets.status === "error"
        ? { message: cityAssets.error.message, onRetry: cityAssets.retry }
        : null;
  const fitPadding = selectedCity
    ? { top: insets.top + CITY_TOP_SPACE, right: spacing.lg, bottom: tabBarHeight + CITY_CARDS_SPACE, left: spacing.lg }
    : { top: insets.top + HEADER_SPACE, right: spacing.lg, bottom: tabBarHeight + spacing.lg, left: spacing.lg };

  return (
    <View style={[styles.screen, { backgroundColor: night.mapBackground }]}>
      <Head>
        <title>{selectedCity ? `${selectedCity.label} · Harita · Vagabonds` : "Harita · Vagabonds"}</title>
      </Head>
      <MapLibreMap
        pins={NO_PINS}
        selectedId={selectedCity ? chosenAsset : null}
        onSelect={(id) => id && setChosenAsset(id)}
        onSelectProvince={openCity}
        onLeaveCity={backToTurkey}
        onCityLanded={onCityLanded}
        onError={setMapError}
        fitPadding={fitPadding}
        provinces={provinces}
        style={StyleSheet.absoluteFill}
      />

      {selectedCity && cards.length > 0 && (landedPlate === selectedPlate || mapError !== null) && (
        // Without a map (it failed to draw) they come in at once: they are its content in words.
        <View style={[styles.cards, { bottom: tabBarHeight + spacing.sm }]}>
          <CityAssetCards assets={cards} buildingsOf={buildingsOf} selectedId={chosenAsset} onSelect={setChosenAsset} />
        </View>
      )}
      <MapSearch
        city={selectedCity}
        cities={withAssets}
        top={insets.top + spacing.sm}
        onBack={backToTurkey}
        onPickCity={openCity}
        onPickAsset={pickAsset}
        notice={notice}
        below={chosen ? <MapAssetActions asset={chosen} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  cards: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
