import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, typography, useTheme, useUi } from "@vagabonds/ui";
import { Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ResourceView } from "@/components/resource-view";
import { WebPageHeader } from "@/components/web-nav-bar";
import { communityAvailable, DataError, useAsset, useCommunity, useSearchableAssets } from "@/data";
import { sendInscriptionProposal, useInscriptionVolunteersState } from "@/data/inscription-proposals";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { isCameraFrame } from "@/lib/camera-frame";
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";
import { searchAssets } from "@/search/asset-search";

type IconName = ComponentProps<typeof Ionicons>["name"];
type Photo = { uri: string; width: number; height: number };

const WEB = Platform.OS === "web";
const LOCATION_MAX = 300;
const NOTE_MAX = 1000;

/**
 * Kitabe Gönüllüleri (Veri Döngüsü Y5): a visitor sends the photo of an inscription on `asset` that is
 * not in the app yet. An expert reads it from the photo (the model only sorts it, H7); once approved
 * and published, Taşın Dili shows it and the visitor earns the Kitabe Gönüllüsü badge. The photo is
 * taken with the system camera (sharper and better focused than the AR camera's frame, which comes
 * here from Taşın Dili only as a draft, with the system camera offered first); on the web it is chosen
 * from the files (ADR 0001).
 */
export default function InscriptionProposeScreen() {
  const m = useMessages();
  const w = m.propose;
  const { asset: id, photo } = useLocalSearchParams<{ asset?: string; photo?: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();
  // Sent from Taşın Dili's camera near no known asset: which one it is on is asked first.
  if (!id) {
    return (
      <View style={[styles.flex, { backgroundColor: c.background }]}>
        <Head>
          <title>{m.common.title(w.title)}</title>
        </Head>
        {WEB && <WebPageHeader title={w.title} section="monuments" back={{ label: m.note.site, href: "/monuments" }} />}
        <ChooseAsset onChoose={(asset) => router.setParams({ asset })} />
      </View>
    );
  }
  return <ForAsset id={id} photo={photo} />;
}

function ForAsset({ id, photo }: { id: string; photo: string | undefined }) {
  const m = useMessages();
  const w = m.propose;
  const resource = useAsset(id);
  const { colors: c } = useTheme();
  const name = resource.status === "success" && resource.data ? resource.data.name : null;
  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <Head>
        <title>{m.common.title(w.title)}</title>
      </Head>
      {WEB && (
        <WebPageHeader
          title={name ? w.titleFor(name) : w.title}
          section="monuments"
          back={{ label: name ?? m.note.site, href: { pathname: "/monuments/[id]", params: { id } } }}
        />
      )}
      <ResourceView resource={resource}>
        {(asset) =>
          asset ? (
            <Propose asset={asset} cameraPhoto={!WEB && photo && isCameraFrame(photo, Paths.cache.uri) ? photo : null} />
          ) : (
            <View style={styles.missing}>
              <Text>{w.notFound}</Text>
            </View>
          )
        }
      </ResourceView>
    </View>
  );
}

/**
 * `cameraPhoto`: the frame Taşın Dili's camera held when the visitor chose to send an inscription it
 * did not know (a file in the app's cache). Shown ready to send; the system camera can replace it.
 */
function Propose({ asset, cameraPhoto }: { asset: AssetDetail; cameraPhoto: string | null }) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const router = useRouter();
  const w = useMessages().propose;
  const { user } = useCommunity();
  // A shared link may open this where the server takes no inscriptions: say so before a photo is taken.
  const volunteers = useInscriptionVolunteersState();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<"location" | "note" | null>(null);
  // Still the camera's frame: a draft, low in resolution for an expert to read from.
  const fromCamera = cameraPhoto !== null && photo?.uri === cameraPhoto;

  useEffect(() => {
    if (!cameraPhoto) return;
    let live = true;
    Image.getSize(
      cameraPhoto,
      (width, height) => {
        if (!live) return;
        // A photo the visitor already chose stays.
        setPhoto((now) => now ?? { uri: cameraPhoto, width, height });
      },
      () => {}, // Unreadable: the visitor takes one as usual.
    );
    return () => {
      live = false;
    };
  }, [cameraPhoto]);

  const fail = (message: string) => {
    setError(message);
    announce(message);
  };

  const choose = async (from: "camera" | "library") => {
    setError(null);
    try {
      if (from === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return fail(w.noCamera);
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false };
      const result = from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const picked = result.canceled ? null : result.assets[0];
      if (picked) setPhoto({ uri: picked.uri, width: picked.width, height: picked.height });
    } catch {
      fail(w.failed);
    }
  };

  const submit = async () => {
    if (!photo) return;
    setError(null);
    setSending(true);
    try {
      await sendInscriptionProposal(asset.id, photo, { location, note });
      setSent(true);
      setPhoto(null);
      setLocation("");
      setNote("");
      announce(w.sentSaid);
    } catch (e) {
      fail(e instanceof DataError ? e.message : w.failed);
    } finally {
      setSending(false);
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/asset/[id]", params: { id: asset.id } }));
  const card = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];
  const typed = { color: c.text, fontSize: typography.body.fontSize * textScale, lineHeight: typography.body.lineHeight * textScale };
  const noOutline = WEB ? ({ outlineStyle: "none" } as object) : null;
  const field = (name: "location" | "note") => [styles.field, { backgroundColor: c.background, borderColor: focused === name ? c.highlightMark : c.border }];
  // An account sends: an anonymous session (no username) is asked to sign in, as the API would.
  const signedIn = Boolean(user?.username);

  let body;
  if (!communityAvailable) {
    body = (
      <View style={card}>
        <Text color="textSecondary">{w.needsServer}</Text>
      </View>
    );
  } else if (signedIn && volunteers === "off") {
    // Only a server known not to take them closes the form: while it is unknown (no network yet) the
    // visitor may still try, and the send says what went wrong.
    body = (
      <View style={card}>
        <Text color="textSecondary">{w.off}</Text>
      </View>
    );
  } else if (sent) {
    body = (
      <View style={[card, styles.sent]} accessibilityRole="alert">
        <View style={[styles.sentMark, { backgroundColor: c.highlightMark }]}>
          <Ionicons name="checkmark" size={30} color={c.onPrimary} />
        </View>
        <Text variant="heading" style={styles.center}>
          {w.reachedUs}
        </Text>
        <Text color="textSecondary" style={styles.center}>
          {w.reachedBody}
        </Text>
        <Primary label={w.backToAsset} icon="arrow-back" onPress={leave} />
        <Pressable accessibilityRole="button" onPress={() => setSent(false)} style={styles.again}>
          <Text variant="label" color="highlight">
            {w.another}
          </Text>
        </Pressable>
      </View>
    );
  } else if (user !== undefined && !signedIn) {
    body = (
      <View style={card}>
        <Text>{w.signIn}</Text>
        <Primary
          label={w.signInButton}
          icon="log-in-outline"
          onPress={() => router.push({ pathname: "/auth", params: { mode: "login", next: `/inscription-propose?asset=${encodeURIComponent(asset.id)}` } })}
        />
      </View>
    );
  } else {
    body = (
      <View style={card}>
        {photo ? (
          <View style={styles.photoBox}>
            <Image
              source={{ uri: photo.uri }}
              style={[styles.photo, { aspectRatio: photo.width / photo.height, backgroundColor: c.background }]}
              resizeMode="contain"
              accessibilityLabel={w.photoLabel}
            />
            {fromCamera && (
              <>
                <Text variant="caption" color="warning">
                  {w.fromCamera}
                </Text>
                <Primary label={w.sharper} icon="camera" onPress={() => void choose("camera")} disabled={sending} />
              </>
            )}
            <Secondary label={w.retake} icon="refresh" onPress={() => setPhoto(null)} disabled={sending} />
          </View>
        ) : (
          <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.background }]}>
            <Ionicons name="document-text-outline" size={36} color={c.highlightMark} aria-hidden />
            <Text variant="caption" color="textSecondary" style={styles.center}>
              {w.tips}
            </Text>
            {!WEB && <Primary label={w.takePhoto} icon="camera" onPress={() => void choose("camera")} />}
            <Secondary label={WEB ? w.pickPhotoWeb : w.pickPhoto} icon="images-outline" onPress={() => void choose("library")} />
          </View>
        )}

        <View style={styles.group}>
          <Text variant="label" style={styles.semibold} nativeID="propose-where">
            {w.where}
          </Text>
          <View style={field("location")}>
            <TextInput
              accessibilityLabel={w.where}
              accessibilityLabelledBy="propose-where"
              value={location}
              onChangeText={setLocation}
              onFocus={() => setFocused("location")}
              onBlur={() => setFocused(null)}
              placeholder={w.wherePlaceholder}
              placeholderTextColor={c.textSecondary}
              maxLength={LOCATION_MAX}
              editable={!sending}
              style={[styles.input, typed, noOutline]}
            />
          </View>
        </View>
        <View style={styles.group}>
          <Text variant="label" style={styles.semibold} nativeID="propose-note">
            {w.note}
          </Text>
          <View style={field("note")}>
            <TextInput
              accessibilityLabel={w.note}
              accessibilityLabelledBy="propose-note"
              value={note}
              onChangeText={setNote}
              onFocus={() => setFocused("note")}
              onBlur={() => setFocused(null)}
              placeholder={w.notePlaceholder}
              placeholderTextColor={c.textSecondary}
              multiline
              maxLength={NOTE_MAX}
              editable={!sending}
              style={[styles.input, styles.multiline, typed, noOutline]}
            />
          </View>
        </View>

        {user && (
          <View style={styles.row}>
            <Ionicons name="person-circle-outline" size={18} color={c.textSecondary} />
            <Text variant="caption" color="textSecondary">
              {w.sendAs(user.nickname)}
            </Text>
          </View>
        )}
        {error && (
          <View style={styles.row} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color={c.warning} />
            <Text variant="caption" color="warning" style={styles.flex}>
              {error}
            </Text>
          </View>
        )}
        <Primary label={sending ? w.sending : w.send} icon="send" onPress={() => void submit()} disabled={!photo || sending || user === undefined} busy={sending} />
        <View style={styles.row}>
          <Ionicons name="shield-checkmark-outline" size={16} color={c.textSecondary} />
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {w.review}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.column, wide && wideColumn, { paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        <View style={styles.intro}>
          <Text variant="overline" color="highlight">
            {w.overline}
          </Text>
          <Text variant="title" headingLevel={1}>
            {asset.name}
          </Text>
          <Text color="textSecondary">{w.intro}</Text>
        </View>
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** "Bu kitabe hangi eserde?": the assets searched by name, as the map's search ranks them. */
function ChooseAsset({ onChoose }: { onChoose: (asset: string) => void }) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const w = useMessages().propose;
  const assets = useSearchableAssets(true);
  const [query, setQuery] = useState("");
  const all = assets.status === "success" ? (assets.data ?? []) : null;
  const typedEnough = query.trim().length >= 2;
  const matches = useMemo(() => (all && typedEnough ? searchAssets(query, all, []).assets : []), [all, query, typedEnough]);
  const typed = { color: c.text, fontSize: typography.body.fontSize * textScale, lineHeight: typography.body.lineHeight * textScale };

  return (
    // "automatic": iOS's see-through header lies over the page, which starts below it this way.
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.column, wide && wideColumn, { paddingBottom: insets.bottom + spacing.xxxl }]}
    >
      <View style={styles.intro}>
        <Text variant="overline" color="highlight">
          {w.overline}
        </Text>
        <Text variant="title" headingLevel={1}>
          {w.chooseTitle}
        </Text>
        <Text color="textSecondary">{w.chooseIntro}</Text>
      </View>
      <View style={[styles.field, styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.textSecondary} />
        <TextInput
          accessibilityLabel={w.chooseTitle}
          value={query}
          onChangeText={setQuery}
          placeholder={w.choosePlaceholder}
          placeholderTextColor={c.textSecondary}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.input, styles.flex, typed, WEB ? ({ outlineStyle: "none" } as object) : null]}
        />
      </View>
      {assets.status === "error" ? (
        <View style={styles.group}>
          <Text color="textSecondary">{w.chooseFailed}</Text>
          <Secondary label={w.chooseRetry} icon="refresh" onPress={assets.retry} />
        </View>
      ) : all === null ? (
        <ActivityIndicator color={c.highlightMark} />
      ) : typedEnough && matches.length === 0 ? (
        <Text color="textSecondary">{w.chooseNone}</Text>
      ) : matches.length === 0 ? null : (
        <View style={[styles.list, { borderColor: c.border }]} accessibilityLiveRegion="polite">
          {matches.map((asset, i) => (
            <Pressable
              key={asset.id}
              accessibilityRole="button"
              accessibilityLabel={`${asset.name}, ${asset.district}, ${asset.city.label}`}
              onPress={() => onChoose(asset.id)}
              style={({ pressed }) => [styles.choice, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <Text variant="label" style={styles.semibold}>
                  {asset.name}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`${asset.district}, ${asset.city.label}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Primary({ label, icon, onPress, disabled = false, busy = false }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, { backgroundColor: c.highlightMark }, disabled && styles.dimmed, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={c.onPrimary} size="small" /> : <Ionicons name={icon} size={18} color={c.onPrimary} />}
      <Text variant="label" colorValue={c.onPrimary} style={styles.semibold}>
        {label}
      </Text>
    </Pressable>
  );
}

function Secondary({ label, icon, onPress, disabled = false }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, { borderColor: c.border }, disabled && styles.dimmed, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={c.primary} />
      <Text variant="label" color="primary" style={styles.semibold}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  semibold: { fontFamily: fontFamily.sansSemiBold },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  column: { gap: spacing.lg, width: "100%", maxWidth: 640, alignSelf: "center", padding: spacing.md },
  intro: { gap: spacing.xs, paddingTop: spacing.sm },
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  empty: { alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed" },
  photoBox: { gap: spacing.sm },
  photo: { width: "100%", maxHeight: 520, borderRadius: radius.lg },
  group: { gap: spacing.xs },
  field: { borderRadius: radius.lg, borderWidth: 1 },
  input: { fontFamily: fontFamily.sans, minHeight: touchTarget.min, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 52, alignSelf: "stretch", borderRadius: radius.full, paddingHorizontal: spacing.lg },
  secondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: touchTarget.min, alignSelf: "stretch", borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.lg },
  dimmed: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  sent: { alignItems: "center", paddingVertical: spacing.xl },
  sentMark: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  again: { minHeight: touchTarget.min, justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: spacing.md },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  choice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: touchTarget.min, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
