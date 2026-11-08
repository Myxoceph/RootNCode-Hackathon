import { fontFamily, Text } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";

import { DraftReview, PublishState } from "@/components/admin/draft-review";
import { InscriptionReview, InscriptionSource } from "@/components/admin/inscription-review";
import { ChatMessages, Notice, type Ref } from "@/components/admin/intake-chat";
import { Button, Card, Empty, errorText, Failed, formatDate, Loading, PageHeader, Toast, useLoad, useToast } from "@/components/admin/kit";
import { textAt } from "@/components/admin/record-path";
import { PageBody, usePanel } from "@/components/admin/shell";
import { fetchChat, fetchDraft, fetchMetaEnums, retryDraft } from "@/data/admin";

/**
 * `/admin/review/drafts/:id`: one draft of the review queue (Y3). Its source on the left (a chat's
 * messages, the quote of the field picked marked in them), the record to correct and decide on the
 * right. A book's page images join the left side when the PDF line arrives (plan §6, Y2c).
 */
export default function DraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role, refreshPending } = usePanel();
  const { width } = useWindowDimensions();
  const wide = width >= 1180;
  const { toast, show } = useToast();
  const draft = useLoad(() => fetchDraft(id), [id]);
  const jobId = draft.data?.jobId ?? null;
  const chat = useLoad(async () => (jobId ? fetchChat(jobId) : null), [jobId]);
  const enums = useLoad(fetchMetaEnums);
  const [shown, setShown] = useState<Ref | null>(null);
  const [retrying, setRetrying] = useState(false);

  if (!draft.data) {
    return (
      <View style={styles.fill}>
        <PageBody>
          <Card>{draft.error ? <Failed message={draft.error} onRetry={draft.reload} /> : <Loading />}</Card>
        </PageBody>
      </View>
    );
  }

  const d = draft.data;
  const decided = (next: typeof d, message: string) => {
    draft.setData(next);
    refreshPending();
    show(message);
  };
  const retry = async () => {
    setRetrying(true);
    try {
      decided(await retryDraft(d.id), "Worker'a geri gönderildi; sıradaki turunda yeniden yayınlamayı dener.");
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setRetrying(false);
    }
  };
  const name = textAt(d.record, ["name", "tr"]) ?? (d.kind === "inscription" ? `Kitabe · ${d.assetId}` : d.assetId);
  const job = chat.data?.job ?? null;
  const newAsset = d.kind !== "inscription";
  const source = (
    <View style={[styles.side, wide && styles.sideWide, wide && STICKY]}>
      {!newAsset ? (
        <InscriptionSource draft={d} onOpenAsset={() => router.push(`/asset/${d.assetId}`)} />
      ) : job?.kind === "chat" ? (
        <>
          <Text style={styles.sourceTitle}>{`Sohbet · ${job.input?.messages.length ?? 0} mesaj`}</Text>
          <ChatMessages job={job} highlight={shown} />
          <Button small label="Sohbeti aç" icon="chatbubbles-outline" kind="ghost" onPress={() => router.push(`/admin/intake/${job.id}`)} />
        </>
      ) : chat.loading ? (
        <Card>
          <Loading />
        </Card>
      ) : (
        <Card>
          <Empty icon="document-text-outline" title="Kaynak gösterilemiyor" body={job ? "Kitap taslaklarının sayfa görüntüleri PDF hattı gelince burada olacak." : "Bu taslağın bir işi yok."} />
        </Card>
      )}
    </View>
  );

  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline={`İnceleme · ${newAsset ? (d.kind === "field_asset" ? "Yeni eser (sohbet)" : "Yeni eser (kitap)") : "Kitabe"}`}
          title={name}
          hint={`${d.assetId} · ${formatDate(d.createdAt, true)}`}
          tools={false}
          actions={
            <>
              <PublishState draft={d} />
              <Button label="Kuyruk" icon="chevron-back" kind="ghost" small onPress={() => router.push("/admin/review")} />
            </>
          }
        />
        {d.applyError && (
          <View style={styles.failed}>
            <Notice tone="red" icon="alert-circle-outline">
              {`Worker yayınlayamadı: ${d.applyError}`}
            </Notice>
            {/* The worker does not try a failed draft again on its own: once the cause is fixed, it is sent back. */}
            {(newAsset ? role === "admin" : true) && (
              <View style={styles.failedRow}>
                <Text color="textSecondary" style={styles.failedHint}>
                  Sorunu giderdiysen (ör. eksik fotoğraf, veri setindeki dosya) taslağı worker'a geri gönder.
                </Text>
                <Button small label="Yeniden dene" icon="refresh" busy={retrying} disabled={retrying} onPress={() => void retry()} />
              </View>
            )}
          </View>
        )}
        {d.status === "approved" && d.appliedAt && (
          <View style={{ marginBottom: 14 }}>
            <Button small label="Uygulamada aç" icon="open-outline" onPress={() => router.push(`/asset/${d.assetId}`)} />
          </View>
        )}
        <View style={[styles.columns, { flexDirection: wide ? "row" : "column" }]}>
          {source}
          <View style={[styles.side, wide && styles.sideWide]}>
            {newAsset ? (
              <DraftReview key={d.updatedAt} draft={d} enums={enums.data} canDecide={role === "admin"} onShowQuote={setShown} onDecided={decided} />
            ) : (
              <InscriptionReview key={d.updatedAt} draft={d} onDecided={decided} />
            )}
          </View>
        </View>
      </PageBody>
      <Toast toast={toast} />
    </View>
  );
}

/** The source stays in view beside a long record, as on the chat screen. */
const STICKY = (Platform.OS === "web" ? { position: "sticky", top: 0, maxHeight: "calc(100vh - 140px)", overflowY: "auto", paddingRight: 4 } : {}) as ViewStyle;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  columns: { gap: 18, alignItems: "flex-start" },
  side: { width: "100%", gap: 12 },
  sideWide: { flex: 1, minWidth: 0, width: "auto" },
  sourceTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 15 },
  failed: { gap: 8, marginBottom: 14 },
  failedRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  failedHint: { flex: 1, minWidth: 240, fontSize: 13, lineHeight: 19 },
});
