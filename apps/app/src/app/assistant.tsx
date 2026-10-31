import Ionicons from "@expo/vector-icons/Ionicons";
import { AssetIdSchema } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme, useUi } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import {
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
import { announce } from "@/lib/announce";
import { answerParts, ask, clearConversation, QUESTION_MAX, useConversation } from "@/lib/chat";

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

/**
 * `/assistant`, or `/assistant?asset=<id>&name=<name>` from an asset's page ("Bu eser hakkında sor").
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
  const params = useLocalSearchParams<{ asset?: string; name?: string }>();
  // The id comes from the address: one the API would refuse makes it a general conversation.
  const asset = AssetIdSchema.safeParse(params.asset).success ? params.asset : undefined;
  const name = asset ? params.name : undefined;
  const key = asset ?? "general";
  const conversation = useConversation(key);
  const available = useAssistantAvailable();
  const [draft, setDraft] = useState("");
  // Web only: what the live region says; phones hear it through `announce`.
  const [status, setStatus] = useState("");
  const scroll = useRef<ScrollViewInstance>(null);

  const busy = conversation.pending !== null;
  const empty = conversation.entries.length === 0 && !busy && !conversation.failed;
  // One rule for every way to send (typing, suggestions, "Tekrar dene"): everything is locked only
  // while the assistant is off and there is no conversation yet; otherwise one question at a time.
  const closed = available === false && empty;

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [conversation.entries.length, busy]);

  async function send(question: string) {
    if (closed || busy || question.trim().length === 0) return;
    setDraft("");
    setStatus("Yanıt hazırlanıyor.");
    announce("Yanıt hazırlanıyor.");
    const response = await ask(key, question, asset);
    if (response) {
      const spoken = answerParts(response.answer, response.citations)
        .map((part) => (part.kind === "text" ? part.text : ""))
        .join("");
      setStatus(spoken);
      announce(spoken);
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

  // The card surface, not the page grey: white in the light theme, as chat apps are.
  return (
    <View style={[styles.screen, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <Head>
        <title>Rehber · Vagabonds</title>
      </Head>

      <View style={[styles.header, styles.column]}>
        <IconButton icon="chevron-back" label="Geri" onPress={goBack} />
        <View style={styles.title}>
          <Text style={styles.titleText} headingLevel={1}>
            Rehber
          </Text>
          {asset && (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {name ?? "Bu eser"}
            </Text>
          )}
        </View>
        {empty ? (
          <View style={styles.round} />
        ) : (
          <IconButton
            icon="create-outline"
            label="Yeni konuşma"
            hint="Bu konuşmayı siler"
            onPress={() => {
              clearConversation(key);
              announce("Konuşma temizlendi.");
            }}
          />
        )}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "web" ? undefined : "padding"}>
        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={[styles.messages, empty && styles.messagesEmpty]} keyboardShouldPersistTaps="handled">
          {empty ? (
            <View style={styles.hello}>
              <View style={[styles.mark, { backgroundColor: closed ? c.surfaceRaised : c.text }]} aria-hidden>
                <Ionicons name="sparkles" size={22} color={closed ? c.textSecondary : c.background} />
              </View>
              <Text style={styles.helloText} accessibilityRole={closed ? "alert" : "header"}>
                {closed ? "Rehber şu an kapalı" : asset ? `${name ?? "Bu eser"} hakkında ne merak ediyorsun?` : "Nasıl yardımcı olabilirim?"}
              </Text>
              {closed && (
                <Text color="textSecondary" style={styles.center}>
                  Eserler, harita ve rotalar çalışmaya devam ediyor. Biraz sonra tekrar bak.
                </Text>
              )}
            </View>
          ) : (
            <>
              {conversation.entries.map((entry) =>
                entry.role === "user" ? <UserMessage key={entry.id} text={entry.text} /> : <AssistantMessage key={entry.id} response={entry.response} />,
              )}

              {conversation.pending !== null && (
                <>
                  <UserMessage text={conversation.pending} />
                  <Thinking />
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

        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
          {empty && !closed && (
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
            <Composer draft={draft} onChange={setDraft} onSend={() => void send(draft)} busy={busy} closed={closed} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function IconButton({ icon, label, hint, onPress }: { icon: "chevron-back" | "create-outline"; label: string; hint?: string; onPress: () => void }) {
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

/** The field: a soft grey box, the question growing in it, a round send button in its corner. */
function Composer({ draft, onChange, onSend, busy, closed }: { draft: string; onChange: (text: string) => void; onSend: () => void; busy: boolean; closed: boolean }) {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  const length = draft.trim().length;
  const canSend = !closed && !busy && length > 0 && length <= QUESTION_MAX;

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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
