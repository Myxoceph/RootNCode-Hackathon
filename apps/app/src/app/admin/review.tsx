import type { ModerationItem } from "@vagabonds/contracts";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, Empty, Failed, formatNumber, Loading, PageHeader, Segments, Toast, useLoad, useToast } from "@/components/admin/kit";
import { ReviewCard } from "@/components/admin/review-card";
import { PageBody, usePanel } from "@/components/admin/shell";
import { fetchAdminSummary, fetchQueue, type QueueKind, type QueueStatus } from "@/data/admin";

const PAGE = 20;

/** The review queue: notes and photos from visitors, oldest first, approved or rejected with a reason. */
export default function Review() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const { refreshPending } = usePanel();
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [kind, setKind] = useState<QueueKind | "all">(params.kind === "notes" || params.kind === "photos" ? params.kind : "all");
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [more, setMore] = useState(false);
  const { toast, show } = useToast();
  const summary = useLoad(fetchAdminSummary);

  const list = useLoad(async () => {
    const page = await fetchQueue({ status, kind: kind === "all" ? undefined : kind, limit: PAGE });
    setItems(page.items);
    setMore(page.items.length < page.total);
    return page;
  }, [status, kind]);

  const loadMore = async () => {
    try {
      const page = await fetchQueue({ status, kind: kind === "all" ? undefined : kind, limit: PAGE, offset: items.length });
      const next = [...items, ...page.items];
      setItems(next);
      setMore(next.length < page.total);
    } catch (error) {
      show(error instanceof Error ? error.message : "Yüklenemedi", "error");
    }
  };

  const reviewed = (id: string) => (item: ModerationItem | null, message: string) => {
    show(message);
    // In the pending list a reviewed item leaves; a banned author's items stay, marked banned.
    if (item && status === "pending") setItems((now) => now.filter((other) => other.id !== id));
    else if (!item) list.reload();
    summary.reload();
    refreshPending();
  };

  const pending = summary.data?.pending;
  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline="Topluluk Ziyaretçi Nabzı"
          title="İnceleme"
          hint="Ziyaretçilerin bıraktığı ipuçları, anılar, düzeltmeler ve fotoğraflar onaylanınca eserin nabzında görünür. Ret gerekçesi yazara iletilir."
        />
        <View style={styles.filters}>
          <Segments
            label="Durum"
            value={status}
            onChange={setStatus}
            options={[
              { value: "pending", label: "Bekleyen", count: pending ? pending.notes + pending.photos : undefined },
              { value: "approved", label: "Onaylanan" },
              { value: "rejected", label: "Reddedilen" },
            ]}
          />
          <Segments
            label="Tür"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "Tümü" },
              { value: "notes", label: "Yazılı", count: status === "pending" ? pending?.notes : undefined },
              { value: "photos", label: "Fotoğraflı", count: status === "pending" ? pending?.photos : undefined },
            ]}
          />
          <View style={{ flex: 1 }} />
          {list.data && (
            <Button small label={`${formatNumber(list.data.total)} not`} icon="refresh" kind="ghost" onPress={list.reload} accessibilityLabel="Yenile" />
          )}
        </View>

        {list.loading && items.length === 0 ? (
          <Card>
            <Loading />
          </Card>
        ) : list.error && items.length === 0 ? (
          <Card>
            <Failed message={list.error} onRetry={list.reload} />
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <Empty
              icon={status === "pending" ? "checkmark-done-outline" : "file-tray-outline"}
              title={status === "pending" ? "Bekleyen not yok" : "Burada henüz not yok"}
              body={status === "pending" ? "Hepsi incelendi. Yeni notlar geldikçe burada sıraya girer." : undefined}
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <ReviewCard key={item.id} item={item} onDone={reviewed(item.id)} onError={(message) => show(message, "error")} />
            ))}
            {more && (
              <View style={{ alignItems: "center", paddingTop: 8 }}>
                <Button label="Daha fazla göster" icon="chevron-down" onPress={() => void loadMore()} />
              </View>
            )}
          </View>
        )}
      </PageBody>
      <Toast toast={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 },
  list: { gap: 14, maxWidth: 880 },
});
