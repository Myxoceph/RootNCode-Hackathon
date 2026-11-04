import Ionicons from "@expo/vector-icons/Ionicons";
import { EmailSchema, PASSWORD_MIN, UsernameSchema } from "@vagabonds/contracts";
import { cameraColors, fontFamily, palette, radius, spacing, Text, useUi } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputInstance,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { communityAvailable, login, register, useAsset, useCommunity } from "@/data";
import { DataError } from "@/data/errors";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type IconName = ComponentProps<typeof Ionicons>["name"];
type Mode = "login" | "register";

/** The photo over the form: Emir Sultan in the evening light, warm like the gold of the screen. */
const HERO_ASSET = "bursa-yildirim-emir-sultan-kulliyesi";

/** Always the night look, as the camera screens: the photo and the gold read best on it. */
const ink = cameraColors;
const field = {
  fill: "rgba(255, 255, 255, 0.06)",
  edge: "rgba(255, 255, 255, 0.14)",
};
const warning = palette.mercan300;

const copy: Record<Mode, { title: string; lead: string; action: string }> = {
  login: { title: "Tekrar hoş geldin", lead: "Mühürlerin, notların ve rozetlerin seni bekliyor.", action: "Giriş yap" },
  register: { title: "Yolculuğuna başla", lead: "Bir hesapla gezdiğin her eser her cihazda seninle.", action: "Hesap oluştur" },
};

/**
 * `/auth?mode=login|register`: signing in and opening an account, on one screen with a switch
 * between them. Emir Sultan's photo fades into the night blue at the top; under it a gold-marked
 * switch, glass fields and one gold button. Signing up shows the rules as they are met, and a
 * visitor who already left notes or seals under a nickname is told they move to the account.
 *
 * With a server the app is for accounts (`useAccountGate`): this screen has no way past it but
 * signing up or in. Done, the greeting ("Merhaba, <ad>") opens and the map after it.
 */
export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { user } = useCommunity();
  const hero = useAsset(HERO_ASSET);
  const [mode, setMode] = useState<Mode>(params.mode === "register" ? "register" : "login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailField = useRef<TextInputInstance>(null);
  const passwordField = useRef<TextInputInstance>(null);
  const nicknameField = useRef<TextInputInstance>(null);

  const registering = mode === "register";
  // A visitor with notes or seals under a nickname: signing up turns that session into the account.
  const keeps = registering && user && user.username === null ? user.nickname : null;
  const nameOk = UsernameSchema.safeParse(username).success;
  const emailOk = EmailSchema.safeParse(email).success;
  const passwordOk = password.length >= PASSWORD_MIN;
  const ready =
    communityAvailable && !busy && (registering ? nameOk && emailOk && passwordOk : username.trim().length > 0 && password.length > 0);
  const heroHeight = Math.min(Math.max(height * 0.36, 220), 340);

  function switchTo(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
  }

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const signedIn = registering
        ? await register({
            username: username.trim().toLowerCase(),
            email: email.trim().toLowerCase(),
            password,
            ...(nickname.trim() && !keeps ? { nickname: nickname.trim() } : {}),
          })
        : await login({ username: username.trim().toLowerCase(), password });
      announce(registering ? `Hesabın oluşturuldu. Hoş geldin, ${signedIn.nickname}.` : `Hoş geldin, ${signedIn.nickname}.`);
      router.replace("/");
    } catch (err) {
      const message = err instanceof DataError ? err.message : "Bir şeyler ters gitti. Tekrar dene.";
      setError(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: ink.background }]}>
      <StatusBar style="light" />
      <Head>
        <title>{`${registering ? "Kayıt ol" : "Giriş yap"} · Vagabonds`}</title>
      </Head>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={{ height: heroHeight }} aria-hidden importantForAccessibility="no-hide-descendants">
            {hero.status === "success" && hero.data?.cover && <AssetImage media={hero.data.cover} decorative fill />}
            <Fade />
          </View>

          <View style={[styles.column, { marginTop: -spacing.xxl * 2 }]}>
            <Text variant="overline" colorValue={ink.gold}>
              VAKIF MİRASI GEZGİNİ
            </Text>
            <Text headingLevel={1} colorValue={ink.text} style={styles.title}>
              {copy[mode].title}
            </Text>
            <Text colorValue={ink.textSecondary} style={styles.lead}>
              {copy[mode].lead}
            </Text>

            <Switch mode={mode} onChange={switchTo} />

            {keeps && (
              <View style={styles.keeps}>
                <Ionicons name="sparkles" size={16} color={ink.gold} />
                <Text variant="caption" colorValue={ink.text} style={styles.flexShrink}>
                  <Text variant="caption" colorValue={ink.gold} style={styles.strong}>
                    {keeps}
                  </Text>{" "}
                  olarak bıraktığın notlar ve mühürler bu hesaba taşınacak.
                </Text>
              </View>
            )}

            <View style={styles.form}>
              <Field
                icon="at"
                label="Kullanıcı adı"
                value={username}
                onChangeText={(text) => setUsername(text.replace(/\s/g, ""))}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => (registering ? emailField : passwordField).current?.focus()}
              />
              {registering && (
                <Field
                  inputRef={emailField}
                  icon="mail-outline"
                  label="E-posta"
                  value={email}
                  onChangeText={(text) => setEmail(text.replace(/\s/g, ""))}
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordField.current?.focus()}
                  maxLength={254}
                />
              )}
              <Field
                inputRef={passwordField}
                icon="lock-closed-outline"
                label="Parola"
                value={password}
                onChangeText={setPassword}
                secret
                autoComplete={registering ? "new-password" : "current-password"}
                textContentType={registering ? "newPassword" : "password"}
                returnKeyType={registering && !keeps ? "next" : "go"}
                onSubmitEditing={() => (registering && !keeps ? nicknameField.current?.focus() : void submit())}
              />
              {registering && password.length > 0 && <Strength password={password} />}
              {registering && !keeps && (
                <Field
                  inputRef={nicknameField}
                  icon="person-outline"
                  label="Takma ad (isteğe bağlı)"
                  value={nickname}
                  onChangeText={setNickname}
                  autoComplete="nickname"
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                  maxLength={32}
                />
              )}
            </View>

            {registering && (
              <View style={styles.rules} accessibilityLabel="Kurallar">
                <Rule met={nameOk} text="Kullanıcı adı 3–32 karakter (a–z, 0–9, _ .)" />
                <Rule met={emailOk} text="Geçerli bir e-posta adresi" />
                <Rule met={passwordOk} text={`Parola en az ${PASSWORD_MIN} karakter`} />
              </View>
            )}

            {error && (
              <View style={styles.error} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={18} color={warning} />
                <Text variant="caption" colorValue={warning} style={styles.flexShrink}>
                  {error}
                </Text>
              </View>
            )}
            {!communityAvailable && (
              <Text variant="caption" colorValue={ink.textSecondary}>
                Hesaplar için sunucu gerekiyor; bu sürüm örnek veriyle çalışıyor.
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready, busy }}
              disabled={!ready}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.primary, { backgroundColor: ink.gold }, !ready && styles.disabled, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={ink.onGold} />
              ) : (
                <>
                  <Text variant="label" colorValue={ink.onGold} style={styles.primaryText}>
                    {copy[mode].action}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={ink.onGold} />
                </>
              )}
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The photo's lower part sinks into the night blue, so the title sits on it. */
function Fade() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="auth-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ink.background} stopOpacity={0.35} />
            <Stop offset="0.45" stopColor={ink.background} stopOpacity={0.15} />
            <Stop offset="1" stopColor={ink.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#auth-fade)" />
      </Svg>
    </View>
  );
}

/** Giriş yap | Kayıt ol, the gold mark sliding under the chosen one. */
function Switch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [at] = useState(() => new Animated.Value(mode === "register" ? 1 : 0));

  useEffect(() => {
    const to = mode === "register" ? 1 : 0;
    if (reduceMotion) at.setValue(to);
    else Animated.timing(at, { toValue: to, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [mode, at, reduceMotion]);

  const half = (width - SWITCH_INSET * 2) / 2;
  return (
    <View accessibilityRole="tablist" style={styles.switch} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View
          style={[
            styles.switchMark,
            { width: half, backgroundColor: ink.gold, transform: [{ translateX: at.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }] },
          ]}
        />
      )}
      {(["login", "register"] as const).map((option) => {
        const on = option === mode;
        return (
          <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(option)} style={styles.switchOption}>
            <Text variant="label" colorValue={on ? ink.onGold : ink.textSecondary} style={styles.switchText}>
              {option === "login" ? "Giriş yap" : "Kayıt ol"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const SWITCH_INSET = 4;

interface FieldProps extends Omit<TextInputProps, "style" | "placeholder"> {
  icon: IconName;
  label: string;
  secret?: boolean;
  inputRef?: RefObject<TextInputInstance | null>;
}

/** A glass field: its icon, its label as the placeholder, a gold edge while typing in it. */
function Field({ icon, label, secret = false, inputRef, onFocus, onBlur, ...input }: FieldProps) {
  const { textScale } = useUi();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={[styles.field, { backgroundColor: field.fill, borderColor: focused ? ink.gold : field.edge }]}>
      <Ionicons name={icon} size={18} color={focused ? ink.gold : ink.textSecondary} />
      <TextInput
        ref={inputRef}
        {...input}
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={ink.textSecondary}
        secureTextEntry={secret && !shown}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[styles.input, { color: ink.text, fontSize: 16 * textScale }, Platform.OS === "web" && ({ outlineStyle: "none" } as object)]}
      />
      {secret && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? "Parolayı gizle" : "Parolayı göster"}
          onPress={() => setShown(!shown)}
          hitSlop={8}
          style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
        >
          <Ionicons name={shown ? "eye-off-outline" : "eye-outline"} size={20} color={ink.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

/** How strong the new password is, in three bars and a word. */
function Strength({ password }: { password: string }) {
  const kinds = [/[a-zçğıöşü]/, /[A-ZÇĞİÖŞÜ]/, /\d/, /[^\p{L}\d]/u].filter((kind) => kind.test(password)).length;
  const level = password.length < PASSWORD_MIN ? 1 : password.length >= 12 && kinds >= 3 ? 3 : kinds >= 2 ? 2 : 1;
  const [word, color] = level === 3 ? ["Güçlü", palette.firuze300] : level === 2 ? ["İyi", ink.gold] : ["Zayıf", warning];
  return (
    <View style={styles.strength} accessible accessibilityLabel={`Parola gücü: ${word}`}>
      <View style={styles.bars}>
        {[1, 2, 3].map((bar) => (
          <View key={bar} style={[styles.bar, { backgroundColor: bar <= level ? color : field.edge }]} />
        ))}
      </View>
      <Text variant="caption" colorValue={color} style={styles.strong}>
        {word}
      </Text>
    </View>
  );
}

/** A rule for the new account, ticked once met. */
function Rule({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.rule} accessible accessibilityLabel={`${text}: ${met ? "tamam" : "henüz değil"}`}>
      <Ionicons name={met ? "checkmark-circle" : "ellipse-outline"} size={16} color={met ? palette.firuze300 : ink.textSecondary} />
      <Text variant="caption" colorValue={met ? ink.text : ink.textSecondary} style={styles.flexShrink}>
        {text}
      </Text>
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
  flexShrink: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
  strong: {
    fontFamily: fontFamily.sansSemiBold,
  },
  column: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 36,
    lineHeight: 44,
    marginTop: -spacing.xs,
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: -spacing.sm,
  },
  switch: {
    flexDirection: "row",
    height: 48,
    padding: SWITCH_INSET,
    marginTop: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: field.edge,
  },
  switchMark: {
    position: "absolute",
    top: SWITCH_INSET,
    bottom: SWITCH_INSET,
    left: SWITCH_INSET,
    borderRadius: radius.full,
  },
  switchOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  switchText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  keeps: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "rgba(232, 200, 120, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232, 200, 120, 0.35)",
  },
  form: {
    gap: spacing.sm + spacing.xxs,
    marginTop: spacing.xs,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: 56,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    height: "100%",
    fontFamily: fontFamily.sans,
    paddingVertical: 0,
  },
  eye: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  strength: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  bars: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  rules: {
    gap: spacing.xs + spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 56,
    marginTop: spacing.xs,
    borderRadius: radius.full,
  },
  primaryText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
  },
});
