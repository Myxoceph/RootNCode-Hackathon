import Ionicons from "@expo/vector-icons/Ionicons";
import { AssetIdSchema } from "@vagabonds/contracts";
import { Button, fontFamily, radius, spacing, Text, touchTarget, useTheme, useUi } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
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

import { AssistantMessage, UserMessage } from "@/components/chat-message";
import { useAssistantAvailable } from "@/data/assistant";
import { announce } from "@/lib/announce";
import { answerParts, ask, clearConversation, QUESTION_MAX, useConversation } from "@/lib/chat";

const GENERAL_SUGGESTIONS = [
  "Bursa'da yarım günlük bir gezi planla",
  "Bursa'da ne yemeliyim?",
  "Bugün Hatay'da hava gezmeye uygun mu?",
];
const ASSET_SUGGESTIONS = [
  "Bu eserin hikâyesi nedir?",
  "Bu eseri kim, ne zaman yaptırdı?",
  "Bu eser tekerlekli sandalyeyle gezilebilir mi?",
];

/**
 * `/assistant`, or `/assistant?asset=<id>&name=<name>` from an asset's page ("Bu eser hakkında sor").
 *
 * Every answer comes from the API's data with numbered sources; the sources open the asset,
 * food or route pages. The conversation stays while the app is open (../lib/chat.ts).
 * Screen readers hear "Yanıt hazırlanıyor" when a question goes out and the answer when it arrives.
 */
export default function AssistantScreen() {
  const { colors: c } = useTheme();
  const { textScale } = useUi();
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
  const length = draft.trim().length;
  const canSend = !closed && !busy && length > 0 && length <= QUESTION_MAX;

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

  // Web: Enter sends, Shift+Enter starts a new line.
  function onKeyPress(event: TextInputKeyPressEvent) {
    const { key, shiftKey } = event.nativeEvent as {
      key: string;
      shiftKey?: boolean;
    };
    if (Platform.OS !== "web" || key !== "Enter" || shiftKey) return;
    event.preventDefault();
    if (canSend) void send(draft);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <Head>
        <title>Asistan · Vagabonds</title>
      </Head>

      <View style={[styles.headerBar, { borderBottomColor: c.border }]}>
        <View style={[styles.header, styles.column]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Geri" onPress={goBack} hitSlop={4} style={styles.round}>
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </Pressable>
          <Text variant="heading" headingLevel={1} style={styles.flex}>
            Asistan
          </Text>
          {!empty && (
            <Button
              label="Temizle"
              variant="ghost"
              accessibilityHint="Bu konuşmayı siler"
              onPress={() => {
                clearConversation(key);
                announce("Konuşma temizlendi.");
              }}
            />
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "web" ? undefined : "padding"}>
        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
          {asset && (
            <View style={[styles.context, { backgroundColor: c.surfaceRaised }]}>
              <Ionicons name="business-outline" size={18} color={c.textSecondary} />
              <Text variant="caption" style={styles.flex}>
                {`${name ?? "Bu eser"} hakkında soruyorsun. Asistan bu eserin kaydını bilir.`}
              </Text>
            </View>
          )}

          {closed ? (
            <View style={styles.intro} accessibilityRole="alert">
              <Text variant="label">Asistan şu an kapalı.</Text>
              <Text color="textSecondary">Eserler, harita ve rotalar çalışmaya devam ediyor. Biraz sonra tekrar bak.</Text>
            </View>
          ) : (
            empty && (
              <View style={styles.intro}>
                <Text color="textSecondary">
                  Vakıf eserleri, gezi planı, yöresel lezzetler ve hava durumu hakkında sorabilirsin. Her bilginin yanında kaynağı
                  yazar.
                </Text>
                <Text variant="label" headingLevel={2}>
                  Örnek sorular
                </Text>
                {(asset ? ASSET_SUGGESTIONS : GENERAL_SUGGESTIONS).map((suggestion) => (
                  <Button
                    key={suggestion}
                    label={suggestion}
                    variant="ghost"
                    disabled={closed || busy}
                    onPress={() => void send(suggestion)}
                    style={styles.suggestion}
                  />
                ))}
              </View>
            )
          )}

          {conversation.entries.map((entry) =>
            entry.role === "user" ? (
              <UserMessage key={entry.id} text={entry.text} />
            ) : (
              <AssistantMessage key={entry.id} response={entry.response} />
            ),
          )}

          {conversation.pending !== null && (
            <>
              <UserMessage text={conversation.pending} />
              <View style={[styles.pending, { backgroundColor: c.surface, borderColor: c.border }]}>
                <ActivityIndicator color={c.primary} />
                <Text variant="caption" color="textSecondary">
                  Yanıt hazırlanıyor…
                </Text>
              </View>
            </>
          )}

          {conversation.failed && (
            <View style={styles.failed}>
              <UserMessage text={conversation.failed.question} />
              <Text variant="caption" color="warning" accessibilityRole="alert">
                {conversation.failed.message}
              </Text>
              <Button label="Tekrar dene" variant="ghost" onPress={retry} disabled={busy} style={styles.retry} />
            </View>
          )}
        </ScrollView>

        {Platform.OS === "web" && (
          // Read out by screen readers on the web; invisible on screen.
          <View style={styles.liveRegion} accessibilityLiveRegion="polite" role="status">
            <Text>{status}</Text>
          </View>
        )}

        <View
          style={[
            styles.composerBar,
            {
              borderTopColor: c.border,
              backgroundColor: c.surface,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <View style={[styles.composer, styles.column]}>
            <Text variant="caption" color="textSecondary">
              Kişisel bilgi yazma; sorular yanıtlanmak için EVREN yapay zekâ servisine gönderilir.
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onKeyPress={onKeyPress}
                placeholder="Sorunu yaz…"
                placeholderTextColor={c.textSecondary}
                accessibilityLabel="Soru"
                accessibilityHint={`En çok ${QUESTION_MAX} karakter`}
                multiline
                maxLength={QUESTION_MAX + 100}
                editable={!closed}
                style={[
                  styles.input,
                  {
                    color: c.text,
                    borderColor: c.border,
                    backgroundColor: c.background,
                    fontSize: 16 * textScale,
                    lineHeight: 22 * textScale,
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Gönder"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => void send(draft)}
                style={[styles.send, { backgroundColor: canSend ? c.primary : c.surfaceRaised }]}
              >
                <Ionicons name="arrow-up" size={22} color={canSend ? c.onPrimary : c.textSecondary} />
              </Pressable>
            </View>
            <Text
              variant="caption"
              color={length > QUESTION_MAX ? "warning" : "textSecondary"}
              style={styles.counter}
              accessibilityLiveRegion="polite"
            >
              {length > QUESTION_MAX ? `${length}/${QUESTION_MAX} · soru çok uzun` : `${length}/${QUESTION_MAX}`}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  /** Header, messages and composer share one centered column on wide screens. */
  column: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  headerBar: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  round: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  messages: {
    gap: spacing.md,
    padding: spacing.md,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  context: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  intro: {
    gap: spacing.sm,
  },
  suggestion: {
    justifyContent: "flex-start",
  },
  pending: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  failed: {
    gap: spacing.xs,
  },
  retry: {
    alignSelf: "flex-start",
  },
  liveRegion: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  composerBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    gap: spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.sans,
    minHeight: touchTarget.min,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  send: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    alignSelf: "flex-end",
  },
});
