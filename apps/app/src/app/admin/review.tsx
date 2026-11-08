import type { IntakeDraft, IntakeDraftKind, ModerationItem } from "@vagabonds/contracts";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { DraftRow } from "@/components/admin/draft-row";

import { Button, Card, Empty, Failed, formatNumber, Loading, PageHeader, Segments, Toast, useLoad, useToast } from "@/components/admin/kit";
import { ReviewCard } from "@/components/admin/review-card";
import { PageBody, usePanel } from "@/components/admin/shell";
import { fetchAdminSummary, fetchDrafts, fetchQueue, type QueueStatus } from "@/data/admin";

/** What is reviewed here: visitors' notes, and Veri Döngüsü's drafts (where the API has intake). */
type Queue = "notes" | "assets" | "inscriptions";
const DRAFT_KINDS: Record<Exclude<Queue, "notes">, IntakeDraftKind[]> = { assets: ["field_asset", "book_asset"], inscriptions: ["inscription"] };

const PAGE = 20;

/**
 * The review queue, oldest first: visitors' written notes, new assets told in the panel's chats (and,
 * later, books), and visitors' inscriptions. New assets are an admin's call; moderators see the rest.
 */
export default function Review() {
  const { refreshPending, role, intake } = usePanel();
  const router = useRouter();
  const [queue, setQueue] = useState<Queue>("notes");
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [drafts, setDrafts] = useState<IntakeDraft[]>([]);
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [more, setMore] = useState(false);
  const { toast, show } = useToast();
  const summary = useLoad(fetchAdminSummary);

  // The selection the newest request was for: an older answer that lands later is dropped.
  const asked = useRef("");
  // How far each draft kind's list has been read, and how long it is.
  const read = useRef<Partial<Record<IntakeDraftKind, { offset: number; total: number }>>>({});

  const sortedByAge = (all: IntakeDraft[]) => [...all].sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  const list = useLoad(async () => {
    const key = `${queue}|${status}`;
    asked.current = key;
    if (queue !== "notes") {
      // A kind at a time: the API filters by one; new assets come from chats and books.
      const kinds = DRAFT_KINDS[queue];
      const pages = await Promise.all(kinds.map((kind) => fetchDrafts({ status, kind, limit: PAGE })));
      const total = pages.reduce((n, p) => n + p.total, 0);
      if (asked.current === key) {
        read.current = Object.fromEntries(kinds.map((kind, i) => [kind, { offset: pages[i]!.items.length, total: pages[i]!.total }]));
        setDrafts(sortedByAge(pages.flatMap((p) => p.items)));
        setMore(pages.some((p) => p.items.length < p.total));
      }
      return { total, items: [] as ModerationItem[] };
    }
    const page = await fetchQueue({ status, limit: PAGE });
    if (asked.current === key) {
      setItems(page.items);
      setMore(page.items.length < page.total);
    }
    return page;
  }, [status, queue]);

  const loadMore = async () => {
    const key = asked.current;
    try {
      if (queue !== "notes") {
        const kinds = DRAFT_KINDS[queue].filter((kind) => {
          const at = read.current[kind];
          return at && at.offset < at.total;
        });
        const pages = await Promise.all(kinds.map((kind) => fetchDrafts({ status, kind, limit: PAGE, offset: read.current[kind]!.offset })));
        if (asked.current !== key) return;
        kinds.forEach((kind, i) => {
          read.current[kind] = { offset: read.current[kind]!.offset + pages[i]!.items.length, total: pages[i]!.total };
        });
        setDrafts((now) => sortedByAge([...now, ...pages.flatMap((p) => p.items)]));
        setMore(Object.values(read.current).some((at) => at && at.offset < at.total));
        return;
      }
      const page = await fetchQueue({ status, limit: PAGE, offset: items.length });
      if (asked.current !== key) return;
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
          overline={queue === "notes" ? "Topluluk Ziyaretçi Nabzı" : "Veri Döngüsü"}
          title="İnceleme"
          hint={
            queue === "notes"
              ? "Ziyaretçilerin bıraktığı ipuçları, anılar ve düzeltmeler onaylanınca eserin nabzında görünür. Ret gerekçesi yazara iletilir."
              : queue === "assets"
                ? "Sohbetten Kabul'ün taslakları: her alanı alındığı cümleyle karşılaştır, gerekirse düzelt. Onaylanan eseri worker veri setine yazıp yayınlar."
                : "Ziyaretçilerin gönderdiği, listede olmayan kitabeler. Onaylanan kitabe Taşın Dili'nde tanınır."
          }
        />
        {intake && (
          <View style={styles.filters}>
            <Segments
              label="Kuyruk"
              value={queue}
              onChange={(next) => {
                setQueue(next);
                setItems([]);
                setDrafts([]);
              }}
              options={[
                { value: "notes", label: "Ziyaretçi notları", count: pending?.notes },
                ...(role === "admin" ? [{ value: "assets" as const, label: "Yeni eserler" }] : []),
                { value: "inscriptions", label: "Kitabeler" },
              ]}
            />
          </View>
        )}
        <View style={styles.filters}>
          <Segments
            label="Durum"
            value={status}
            onChange={setStatus}
            options={[
              { value: "pending", label: "Bekleyen", count: queue === "notes" ? pending?.notes : undefined },
              { value: "approved", label: "Onaylanan" },
              { value: "rejected", label: "Reddedilen" },
            ]}
          />
          <View style={{ flex: 1 }} />
          {list.data && (
            <Button small label={`${formatNumber(list.data.total)} ${queue === "notes" ? "not" : "taslak"}`} icon="refresh" kind="ghost" onPress={list.reload} accessibilityLabel="Yenile" />
          )}
        </View>

        {queue !== "notes" ? (
          list.loading && drafts.length === 0 ? (
            <Card>
              <Loading />
            </Card>
          ) : list.error && drafts.length === 0 ? (
            <Card>
              <Failed message={list.error} onRetry={list.reload} />
            </Card>
          ) : drafts.length === 0 ? (
            <Card>
              <Empty
                icon={status === "pending" ? "checkmark-done-outline" : "file-tray-outline"}
                title={status === "pending" ? (queue === "assets" ? "Onay bekleyen yeni eser yok" : "Onay bekleyen kitabe yok") : "Burada henüz taslak yok"}
                body={
                  status === "pending"
                    ? queue === "assets"
                      ? "Sohbetten Kabul'de taslak yazıldıkça burada sıraya girer."
                      : "Ziyaretçiler eserlerde listede olmayan bir kitabe gönderdikçe burada sıraya girer."
                    : undefined
                }
              />
            </Card>
          ) : (
            <View style={styles.list}>
              {drafts.map((draft) => (
                <DraftRow key={draft.id} draft={draft} onOpen={() => router.push(`/admin/review/drafts/${draft.id}`)} />
              ))}
              {more && (
                <View style={{ alignItems: "center", paddingTop: 8 }}>
                  <Button label="Daha fazla göster" icon="chevron-down" onPress={() => void loadMore()} />
                </View>
              )}
            </View>
          )
        ) : list.loading && items.length === 0 ? (
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
