import Ionicons from "@expo/vector-icons/Ionicons";
import { AssetIdSchema } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme, useUi } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter, useSegments } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputKeyPressEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AssistantMessage, Thinking, UserMessage } from "@/components/chat-message";
import { useAssistantAvailable } from "@/data/assistant";
import { useCommunity } from "@/data/community";
import { DataError } from "@/data/errors";
import { announce } from "@/lib/announce";
import {
  answerParts,
  archiveKey,
  ask,
  clearConversation,
  conversationKey,
  openArchived,
  QUESTION_MAX,
  resumeConversation,
  useConversation,
} from "@/lib/chat";
import { useVoiceQuestion, type VoiceQuestion } from "@/lib/use-voice-question";
import { speakAnswer, stopAnswer } from "@/lib/voice";

interface Suggestion {
  title: string;
  detail: string;
  question: string;
}

const GENERAL_SUGGESTIONS: Suggestion[] = [
  { title: "Gezi planla", detail: "Bursa'da yarım günlük bir rota", question: "Bursa'da yarım günlük bir gezi planla" },
  { title: "Ne yesem?", detail: "Bursa'nın yöresel lezzetleri", question: "Bursa'da ne yemeliyim?" },
  { title: "Hava nasıl?", detail: "Bugün Hatay gezmeye uygun mu", question: "Bugün Hatay'da hava gezmeye uygun mu?" },
];
const ASSET_SUGGESTIONS: Suggestion[] = [
  { title: "Hikâyesi", detail: "Bu eser nasıl doğdu?", question: "Bu eserin hikâyesi nedir?" },
  { title: "Kim yaptırdı?", detail: "Banisi ve yapım tarihi", question: "Bu eseri kim, ne zaman yaptırdı?" },
  { title: "Erişim", detail: "Tekerlekli sandalyeyle gezilir mi?", question: "Bu eser tekerlekli sandalyeyle gezilebilir mi?" },
];
/** The counter shows only this close to the limit. */
const COUNTER_FROM = QUESTION_MAX - 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/assistant`, or `/assistant?asset=<id>&name=<name>` from an asset's page ("Bu eser hakkında sor").
 * The Rehber tab (`/rehber`) shows the same general conversation, without a back button.
 * `/assistant?conversation=<id>` opens an archived conversation from the history, read-only:
 * no field, a bar that starts a new conversation on its page instead.
 *
 * Only accounts ask: signed out, or with an anonymous session, the screen asks to sign in. The
 * API saves every question and answer; the clock in the bar opens the history, the pencil
 * starts a new conversation and archives this one.
 *
 * A conversation in the manner of today's chat apps, in the app's theme: a plain bar, the
 * visitor's lines in grey bubbles, answers as plain text across the column with their sources
 * as small pills and a "read aloud" action under them, one breathing dot while an answer is
 * written, and the field always at the bottom. Empty, it greets in the middle and offers a few
 * questions as cards just above the field. The conversation stays while the app is open
 * (../lib/chat.ts). Screen readers hear "Yanıt hazırlanıyor" when a question goes out and the
 * answer when it arrives.
 */
export default function AssistantScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Also the Rehber tab (`/rehber`): there the bar sits below and there is nowhere to go back to.
  const inTab = (useSegments() as string[])[0] === "(tabs)";
  const params = useLocalSearchParams<{ asset?: string; name?: string; conversation?: string }>();
  const archiveId = params.conversation && UUID.test(params.conversation) ? params.conversation : undefined;
  // The id comes from the address: one the API would refuse makes it a general conversation.
  const asset = !archiveId && AssetIdSchema.safeParse(params.asset).success ? params.asset : undefined;
  const name = asset ? params.name : undefined;
  const { user } = useCommunity();
  const account = user?.username ? user : null;
  const key = archiveId ? archiveKey(archiveId) : account ? conversationKey(account.id, asset) : "signed-out";
  const conversation = useConversation(key);
  const archived = conversation.archived;
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const available = useAssistantAvailable();
  const [draft, setDraft] = useState("");
  // Web only: what the live region says; phones hear it through `announce`.
  const [status, setStatus] = useState("");
  const scroll = useRef<ScrollViewInstance>(null);
  // Only answers to questions asked on this screen write themselves out; earlier and restored ones show as they are.
  const [freshFrom, setFreshFrom] = useState(Number.POSITIVE_INFINITY);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voice = useVoiceQuestion(
    (question) => void send(question, true),
    (message) => {
      setVoiceError(message);
      announce(message);
    },
  );

  // Leaving the screen (or the conversation) stops an answer being read aloud.
  // The conversation on screen; an answer that arrives after the visitor left it is not read aloud.
  const shown = useRef<string | null>(key);
  useEffect(() => {
    shown.current = key;
    return () => {
      shown.current = null;
      stopAnswer();
    };
  }, [key]);

  useEffect(() => {
    if (archiveId) {
      setArchiveError(null);
      openArchived(archiveId).catch((error: unknown) => setArchiveError(error instanceof DataError ? error.message : "Konuşma açılamadı."));
    } else if (account) {
      void resumeConversation(key, asset);
    }
  }, [key]);

  const busy = conversation.pending !== null;
  const empty = conversation.entries.length === 0 && !busy && !conversation.failed;
  // Signed out (or the stored session still being read): no field, the sign-in card instead.
  const signedOut = !archiveId && !account;
  // One rule for every way to send (typing, suggestions, "Tekrar dene"): everything is locked only
  // while the assistant is off and there is no conversation yet; otherwise one question at a time.
  const closed = available === false && empty;

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [conversation.entries.length, busy]);

  /** `spoken`: asked by voice (Sesli Rehber), so the answer comes short and is read aloud at once. */
  async function send(question: string, spoken = false) {
    if (closed || busy || archiveId || signedOut || question.trim().length === 0) return;
    // A long spoken question is cut at a word to what Rehber takes; a typed one cannot be sent.
    if (spoken && question.length > QUESTION_MAX) {
      const cut = question.lastIndexOf(" ", QUESTION_MAX);
      question = question.slice(0, cut > 0 ? cut : QUESTION_MAX);
    }
    setFreshFrom(conversation.entries.length);
    setDraft("");
    setVoiceError(null);
    stopAnswer();
    setStatus("Yanıt hazırlanıyor.");
    announce("Yanıt hazırlanıyor.");
    const response = await ask(key, question, asset, { spoken });
    if (response) {
      const plain = answerParts(response.answer, response.citations)
        .map((part) => (part.kind === "text" ? part.text : ""))
        .join("");
      setStatus(plain);
      // Read aloud, the answer is not announced too: a screen reader would talk over the voice.
      if (spoken && shown.current === key) void speakAnswer(response.answer, plain);
      else announce(plain);
    } else {
      setStatus("");
    }
  }

  function retry() {
    if (conversation.failed) void send(conversation.failed.question);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  /** From an archived conversation: a new one on the same page, the page's open one archived. */
  function startNew() {
    if (!archived || !account) return;
    clearConversation(conversationKey(account.id, archived.assetId ?? undefined));
    router.replace({ pathname: "/assistant", params: archived.assetId ? { asset: archived.assetId, name: archived.assetName ?? undefined } : {} });
  }

  const caption = archiveId
    ? archived
      ? `${archived.assetName ?? "Arşiv"} · ${new Date(archived.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`
      : "Arşiv"
    : asset
      ? (name ?? "Bu eser")
      : null;

  // The card surface, not the page grey: white in the light theme, as chat apps are.
  return (
    <View style={[styles.screen, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <Head>
        <title>Rehber · Vagabonds</title>
      </Head>

      <View style={[styles.header, styles.column]}>
        {/* Two buttons wide on both sides, so the title stays centred. */}
        <View style={styles.side}>
          {inTab ? <View style={styles.round} /> : <IconButton icon="chevron-back" label="Geri" onPress={goBack} />}
        </View>
        <View style={styles.title}>
          <Text style={styles.titleText} headingLevel={1}>
            Rehber
          </Text>
          {caption && (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {caption}
            </Text>
          )}
        </View>
        <View style={[styles.side, styles.sideEnd]}>
          {account && !archiveId && <IconButton icon="time-outline" label="Geçmiş konuşmalar" onPress={() => router.push("/assistant-history")} />}
          {account && !archiveId && !empty && (
            <IconButton
              icon="create-outline"
              label="Yeni konuşma"
              hint="Bu konuşma geçmişe kaydedilir"
              onPress={() => {
                clearConversation(key);
                setFreshFrom(Number.POSITIVE_INFINITY);
                announce("Yeni konuşma başladı. Önceki konuşma geçmişte.");
              }}
            />
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "web" ? undefined : "padding"}>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={[styles.messages, empty && styles.messagesEmpty]}
          keyboardShouldPersistTaps="handled"
          // Follows an answer as it writes itself out.
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {signedOut ? (
            user !== undefined && <SignIn onPress={() => router.push({ pathname: "/auth", params: { mode: "login" } })} />
          ) : archiveId && !archived ? (
            <View style={styles.hello}>
              <Text color={archiveError ? "warning" : "textSecondary"} accessibilityRole={archiveError ? "alert" : undefined} style={styles.center}>
                {archiveError ?? "Konuşma açılıyor…"}
              </Text>
            </View>
          ) : empty ? (
            <View style={styles.hello}>
              <View style={[styles.mark, { backgroundColor: closed ? c.surfaceRaised : c.text }]} aria-hidden>
                <Ionicons name="sparkles" size={22} color={closed ? c.textSecondary : c.background} />
              </View>
              <Text style={styles.helloText} accessibilityRole={closed ? "alert" : "header"}>
                {closed ? "Rehber şu an kapalı" : asset ? `${name ?? "Bu eser"} hakkında ne merak ediyorsun?` : "Nasıl yardımcı olabilirim?"}
              </Text>
              {closed ? (
                <Text color="textSecondary" style={styles.center}>
                  Eserler, harita ve rotalar çalışmaya devam ediyor. Biraz sonra tekrar bak.
                </Text>
              ) : (
                <Text variant="caption" color="textSecondary" style={styles.center}>
                  Mikrofona dokunup sesli de sorabilirsin. Ses yazıya çevrilmek için EVREN yapay zekâ servisine gönderilir, saklanmaz.
                </Text>
              )}
            </View>
          ) : (
            <>
              {conversation.entries.map((entry, i) =>
                entry.role === "user" ? (
                  <UserMessage key={entry.id} text={entry.text} />
                ) : (
                  <AssistantMessage
                    key={entry.id}
                    response={entry.response}
                    animate={i >= freshFrom}
                    // Follow-ups only under the last answer, while nothing else is on its way; none in the archive.
                    onFollowUp={
                      !archiveId && i === conversation.entries.length - 1 && !busy && !conversation.failed ? (question) => void send(question) : undefined
                    }
                  />
                ),
              )}

              {conversation.pending !== null && (
                <>
                  <UserMessage text={conversation.pending} animate />
                  <Thinking question={conversation.pending} />
                </>
              )}

              {conversation.failed && (
                <View style={styles.failed}>
                  <UserMessage text={conversation.failed.question} />
                  <Text variant="caption" color="warning" accessibilityRole="alert">
                    {conversation.failed.message}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={retry}
                    disabled={busy}
                    style={({ pressed }) => [styles.retry, { backgroundColor: c.surfaceRaised }, pressed && styles.pressed]}
                  >
                    <Ionicons name="refresh" size={15} color={c.text} />
                    <Text variant="label">Tekrar dene</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {Platform.OS === "web" && (
          // Read out by screen readers on the web; invisible on screen.
          <View style={styles.liveRegion} accessibilityLiveRegion="polite" role="status">
            <Text>{status}</Text>
          </View>
        )}

        <View style={[styles.bottom, { paddingBottom: (inTab ? 0 : insets.bottom) + spacing.md }]}>
          {!archiveId && !signedOut && empty && !closed && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards} keyboardShouldPersistTaps="handled">
              {(asset ? ASSET_SUGGESTIONS : GENERAL_SUGGESTIONS).map((suggestion) => (
                <Pressable
                  key={suggestion.title}
                  accessibilityRole="button"
                  accessibilityLabel={`Sor: ${suggestion.question}`}
                  onPress={() => void send(suggestion.question)}
                  style={({ pressed }) => [styles.card, { borderColor: c.border, backgroundColor: pressed ? c.surfaceRaised : c.surface }]}
                >
                  <Text variant="label" style={styles.cardTitle}>
                    {suggestion.title}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {suggestion.detail}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.column}>
            {voiceError && (
              <Text variant="caption" color="warning" accessibilityRole="alert" style={styles.voiceError}>
                {voiceError}
              </Text>
            )}
            {archiveId ? (
              archived && <ArchiveBar onStartNew={startNew} />
            ) : (
              !signedOut && (
                <Composer draft={draft} onChange={setDraft} onSend={() => void send(draft)} busy={busy} closed={closed} voice={voice} />
              )
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Signed out or anonymous: Rehber is for accounts, whose conversations it keeps. */
function SignIn({ onPress }: { onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.hello}>
      <View style={[styles.mark, { backgroundColor: c.text }]} aria-hidden>
        <Ionicons name="sparkles" size={22} color={c.background} />
      </View>
      <Text style={styles.helloText} accessibilityRole="header">
        Rehber'i kullanmak için giriş yap
      </Text>
      <Text color="textSecondary" style={styles.center}>
        Konuşmaların hesabında saklanır; istediğin zaman geçmişten dönüp okuyabilirsin.
      </Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primary, { backgroundColor: c.text }, pressed && styles.pressed]}>
        <Text variant="label" colorValue={c.background}>
          Giriş yap ya da hesap aç
        </Text>
      </Pressable>
    </View>
  );
}

/** In place of the field in an archived conversation: it is read-only, a new one starts on its page. */
function ArchiveBar({ onStartNew }: { onStartNew: () => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.archiveBar, { backgroundColor: c.surfaceRaised }]}>
      <Ionicons name="archive-outline" size={18} color={c.textSecondary} aria-hidden />
      <Text variant="caption" color="textSecondary" style={styles.flex}>
        Bu konuşma arşivde; yeni soru gönderilemez.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Aynı sayfada yeni bir konuşma açar"
        onPress={onStartNew}
        style={({ pressed }) => [styles.archiveAction, { backgroundColor: c.text }, pressed && styles.pressed]}
      >
        <Ionicons name="create-outline" size={15} color={c.background} />
        <Text variant="label" colorValue={c.background}>
          Yeni konuşma
        </Text>
      </Pressable>
    </View>
  );
}

type IconName = "chevron-back" | "create-outline" | "time-outline";

function IconButton({ icon, label, hint, onPress }: { icon: IconName; label: string; hint?: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.round, pressed && { backgroundColor: c.surfaceRaised }]}
    >
      <Ionicons name={icon} size={22} color={c.text} />
    </Pressable>
  );
}

/**
 * The field: a soft grey box, the question growing in it, a round button in its corner. Empty,
 * the button is the microphone (Sesli Rehber); while listening the box shows the voice's level
 * and the button stops and sends.
 */
function Composer({
  draft,
  onChange,
  onSend,
  busy,
  closed,
  voice,
}: {
  draft: string;
  onChange: (text: string) => void;
  onSend: () => void;
  busy: boolean;
  closed: boolean;
  voice: VoiceQuestion;
}) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  const length = draft.trim().length;
  const canSend = !closed && !busy && length > 0 && length <= QUESTION_MAX;
  const listening = voice.phase !== "idle";
  // The microphone stands in for "Gönder" while there is nothing typed.
  const canListen = !closed && !busy && (length === 0 || listening);

  if (listening) {
    const recording = voice.phase === "recording";
    return (
      <View style={styles.composerWrap}>
        <View style={[styles.composer, styles.listening, { backgroundColor: c.surfaceRaised }]}>
          <View style={styles.levels} aria-hidden>
            {LEVEL_BARS.map((weight, i) => (
              <View
                key={i}
                style={[styles.levelBar, { backgroundColor: c.text, height: 4 + Math.round(18 * voice.level * weight) }]}
              />
            ))}
          </View>
          <Text style={styles.flex} accessibilityLiveRegion="polite">
            {recording ? `Dinliyorum… ${voice.seconds} sn` : "Anlıyorum…"}
          </Text>
          {recording ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bitir ve gönder"
              hitSlop={4}
              onPress={voice.toggle}
              style={({ pressed }) => [styles.send, { backgroundColor: c.text }, pressed && styles.pressed]}
            >
              <Ionicons name="stop" size={18} color={c.background} />
            </Pressable>
          ) : (
            <View style={styles.send}>
              <ActivityIndicator color={c.text} accessibilityLabel="Ses yazıya çevriliyor" />
            </View>
          )}
        </View>
      </View>
    );
  }

  // Web: Enter sends, Shift+Enter starts a new line.
  function onKeyPress(event: TextInputKeyPressEvent) {
    const { key, shiftKey } = event.nativeEvent as { key: string; shiftKey?: boolean };
    if (Platform.OS !== "web" || key !== "Enter" || shiftKey) return;
    event.preventDefault();
    if (canSend) onSend();
  }

  return (
    <View style={styles.composerWrap}>
      <View style={[styles.composer, { backgroundColor: c.surfaceRaised }, closed && styles.disabled]}>
        <TextInput
          value={draft}
          onChangeText={onChange}
          onKeyPress={onKeyPress}
          placeholder="Rehber'e sor"
          placeholderTextColor={c.textSecondary}
          accessibilityLabel="Soru"
          accessibilityHint={`En çok ${QUESTION_MAX} karakter`}
          multiline
          // One line to start with (a web textarea would open with two); it grows as the question does.
          numberOfLines={1}
          maxLength={QUESTION_MAX + 100}
          editable={!closed}
          style={[
            styles.input,
            { color: c.text, fontSize: 16 * textScale, lineHeight: 22 * textScale },
            Platform.OS === "web" && ({ outlineStyle: "none" } as object),
          ]}
        />
        {length >= COUNTER_FROM && (
          <Text variant="caption" color={length > QUESTION_MAX ? "warning" : "textSecondary"} accessibilityLiveRegion="polite" style={styles.counter}>
            {length > QUESTION_MAX ? `${length}/${QUESTION_MAX}` : `${QUESTION_MAX - length}`}
          </Text>
        )}
        {length === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sesli sor"
            accessibilityHint="Dokun ve sorunu söyle; bitirince tekrar dokun"
            accessibilityState={{ disabled: !canListen }}
            disabled={!canListen}
            // Drawn 36pt; the target is 44.
            hitSlop={4}
            onPress={voice.toggle}
            style={({ pressed }) => [styles.send, { backgroundColor: canListen ? c.text : c.border }, pressed && styles.pressed]}
          >
            <Ionicons name="mic" size={19} color={canListen ? c.background : c.textSecondary} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gönder"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            // Drawn 36pt; the target is 44.
            hitSlop={4}
            onPress={onSend}
            style={({ pressed }) => [styles.send, { backgroundColor: canSend ? c.text : c.border }, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-up" size={20} color={canSend ? c.background : c.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** How tall each level bar grows with the voice, middle ones most. */
const LEVEL_BARS = [0.5, 0.8, 1, 0.8, 0.5];

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listening: {
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
  },
  levels: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 24,
  },
  levelBar: {
    width: 3,
    borderRadius: 2,
  },
  voiceError: {
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.55,
  },
  /** Header, messages and composer share one centered column on wide screens. */
  column: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  side: {
    width: touchTarget.min * 2,
    flexDirection: "row",
  },
  sideEnd: {
    justifyContent: "flex-end",
  },
  primary: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.xl,
  },
  archiveAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: touchTarget.min - 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  round: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    alignItems: "center",
  },
  titleText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 17,
    lineHeight: 22,
  },

  messages: {
    gap: spacing.xl,
    paddingHorizontal: spacing.lg + spacing.xxs,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  messagesEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  hello: {
    alignItems: "center",
    gap: spacing.lg,
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  helloText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.3,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },

  failed: {
    gap: spacing.sm,
  },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  liveRegion: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },

  bottom: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  cards: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  card: {
    gap: spacing.xxs,
    minWidth: 168,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardTitle: {
    fontFamily: fontFamily.sansSemiBold,
  },
  composerWrap: {
    gap: spacing.xs + spacing.xxs,
    paddingHorizontal: spacing.md,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    minHeight: 52,
    paddingLeft: spacing.lg + spacing.xxs,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 26,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.sans,
    minHeight: 36,
    maxHeight: 140,
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: 0,
  },
  counter: {
    fontFamily: fontFamily.mono,
    paddingBottom: spacing.sm,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
