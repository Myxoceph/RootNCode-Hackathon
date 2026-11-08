import { fontFamily, Text } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";

import { ChatComposer, ChatMessages, DraftCard, fieldName, isWorking, jobBadge, Notice } from "@/components/admin/intake-chat";
import { Badge, Button, Card, Empty, Failed, Loading, PageHeader, useLoad } from "@/components/admin/kit";
import { PageBody } from "@/components/admin/shell";
import { addChatMessage, fetchChat, fetchMetaEnums } from "@/data/admin";

/** How often the screen asks after a chat the worker is on. */
const POLL_MS = 3000;

/**
 * `/admin/intake/:id`: the chat on the left, the worker's draft on the right. While the worker is
 * on it the screen asks again every few seconds; an answer to one of the draft's questions goes in
 * as a new message, and the draft is written again from the whole chat.
 */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1180;
  const chat = useLoad(() => fetchChat(id), [id]);
  const enums = useLoad(fetchMetaEnums);
  const [text, setText] = useState("");
  // Bumped by every message sent: a poll asked before it is older than what the send brought back.
  const sent = useRef(0);

  const job = chat.data?.job ?? null;
  const draft = chat.data?.draft ?? null;
  const working = job !== null && isWorking(job);

  useEffect(() => {
    if (!working) return;
    let active = true;
    const timer = setInterval(() => {
      const asked = sent.current;
      fetchChat(id).then(
        (fresh) => active && asked === sent.current && chat.setData(fresh),
        () => {},
      );
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, working]);

  if (!chat.data) {
    return (
      <View style={styles.fill}>
        <PageBody>
          <Card>{chat.error ? <Failed message={chat.error} onRetry={chat.reload} /> : <Loading />}</Card>
        </PageBody>
      </View>
    );
  }

  if (job!.kind !== "chat") {
    return (
      <View style={styles.fill}>
        <PageBody>
          <Card>
            <Empty icon="document-text-outline" title="Bu bir sohbet değil" body="Bu iş bir PDF kitabının işi; PDF Kabul ekranları daha gelmedi." action={<Button label="Sohbetler" icon="chevron-back" onPress={() => router.push("/admin/intake")} />} />
          </Card>
        </PageBody>
      </View>
    );
  }

  const badge = jobBadge(job!);
  const closed =
    job!.status === "drafting"
      ? "Taslak yazılıyor; bitince yazabilirsin."
      : draft && draft.status !== "pending"
        ? "Taslak karara bağlandı; bu sohbet kapandı."
        : null;
  const ask = (pointer: string) => setText((now) => `${now.trim() ? `${now.trimEnd()}\n` : ""}${fieldName(pointer)}: `);
  const send = async (message: string, uploads: string[]) => {
    sent.current += 1;
    const fresh = await addChatMessage(id, { text: message, uploads });
    // Again: a poll sent while the message was on its way may still answer from before it.
    sent.current += 1;
    chat.setData(fresh);
  };
  const city = enums.data?.cities.find((c) => c.code === job!.city)?.label ?? job!.city;

  const conversation = (
    <View style={[styles.side, wide && styles.sideWide, wide && STICKY]}>
      <ChatMessages job={job!} />
      <ChatComposer onSend={send} closed={closed} placeholder="Ekle ya da düzelt: taslak bütün sohbetten yeniden yazılır." draftText={text} onDraftText={setText} />
    </View>
  );
  const drafted = (
    <View style={[styles.side, wide && styles.sideWide]}>
      {job!.status === "failed" && (
        <Notice tone="red" icon="alert-circle-outline">
          {`Taslak yazılamadı: ${job!.error ?? "bilinmeyen hata"}. Yeni bir mesaj yazınca yeniden denenir.`}
        </Notice>
      )}
      {draft ? (
        <DraftCard draft={draft} job={job!} enums={enums.data} onAsk={ask} />
      ) : (
        <Card>
          <View style={styles.waiting}>
            <Text style={styles.waitingTitle}>{job!.status === "drafting" ? "Taslak yazılıyor…" : job!.status === "failed" ? "Taslak yok" : "Sırada"}</Text>
            <Text color="textSecondary" style={styles.small}>
              {job!.status === "queued"
                ? "Worker sırası gelince taslağı yazar; bu ekran kendini yeniler. Uzun sürerse worker çalışıyor mu bak: python3 data/pipeline/worker.py"
                : job!.status === "drafting"
                  ? "Yapay zekâ mesajları alanlara ayırıyor ve her değeri alıntısıyla denetliyor. Genelde bir dakikadan kısa sürer."
                  : "Mesajlarını kontrol edip bir mesaj daha yaz."}
            </Text>
          </View>
        </Card>
      )}
    </View>
  );

  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline={`Sohbetten Kabul · ${city}`}
          title={job!.title}
          tools={false}
          actions={
            <>
              <Badge tone={badge.tone} label={badge.label} icon={badge.icon} />
              <Button label="Sohbetler" icon="chevron-back" kind="ghost" small onPress={() => router.push("/admin/intake")} />
            </>
          }
        />
        <View style={[styles.columns, { flexDirection: wide ? "row" : "column" }]}>
          {conversation}
          {drafted}
        </View>
      </PageBody>
    </View>
  );
}

/**
 * Beside a long draft, the chat stays in view (the web's sticky position, within the page's scroll):
 * an answer to a question at the draft's bottom is written without scrolling back up. A long chat
 * scrolls in its own column.
 */
const STICKY = (Platform.OS === "web" ? { position: "sticky", top: 0, maxHeight: "calc(100vh - 140px)", overflowY: "auto", paddingRight: 4 } : {}) as ViewStyle;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  columns: { gap: 18, alignItems: "flex-start" },
  side: { width: "100%", gap: 14 },
  sideWide: { flex: 1, minWidth: 0, width: "auto" },
  waiting: { gap: 6, paddingVertical: 8 },
  waitingTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 16 },
  small: { fontSize: 13, lineHeight: 19 },
});
