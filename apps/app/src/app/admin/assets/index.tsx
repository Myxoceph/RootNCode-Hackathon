import type { AdminAsset } from "@vagabonds/contracts";
import { fontFamily, Text } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import {
  Badge,
  Button,
  Card,
  Cell,
  Confirm,
  Empty,
  errorText,
  Failed,
  formatDate,
  formatNumber,
  Loading,
  PageHeader,
  SearchField,
  Segments,
  TableHead,
  TableRow,
  Toast,
  useLoad,
  useToast,
  type Column,
} from "@/components/admin/kit";
import { AdminOnly, PageBody } from "@/components/admin/shell";
import { deletePanelAsset, fetchPanelAssets, updatePanelAsset } from "@/data/admin";

/**
 * Every asset: the dataset's (imported from `data/eserler`) and the ones added here. Drafts stay
 * hidden, published ones appear in the app at once. A dataset asset's edits live in the database
 * only, so the next dataset import puts back what `data/` says; only panel assets can be deleted.
 */
export default function Assets() {
  return (
    <AdminOnly>
      <AssetsPage />
    </AdminOnly>
  );
}

type Filter = "all" | "published" | "draft" | "panel";

const PAGE = 50;

function AssetsPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 1200;
  const list = useLoad(fetchPanelAssets);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [deleting, setDeleting] = useState<AdminAsset | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, show } = useToast();

  const items = list.data ?? [];
  const needle = search.trim().toLocaleLowerCase("tr");
  const matching = items.filter(
    (asset) =>
      (filter === "all" ||
        (filter === "published" && asset.status === "published") ||
        (filter === "draft" && asset.status !== "published") ||
        (filter === "panel" && asset.origin === "panel")) &&
      (!needle || [asset.name, asset.city, asset.district, asset.id].some((text) => text.toLocaleLowerCase("tr").includes(needle))),
  );
  const shown = matching.slice(0, limit);
  const published = items.filter((asset) => asset.status === "published").length;
  const fromPanel = items.filter((asset) => asset.origin === "panel").length;

  const toggleStatus = async (asset: AdminAsset) => {
    setBusy(asset.id);
    try {
      const next = asset.status === "published" ? "draft" : "published";
      await updatePanelAsset(asset.id, { status: next });
      show(next === "published" ? `${asset.name} yayında.` : `${asset.name} taslağa alındı.`);
      list.reload();
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    try {
      await deletePanelAsset(deleting.id);
      show(`${deleting.name} silindi.`);
      list.reload();
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(null);
      setDeleting(null);
    }
  };

  const columns: Column[] = narrow
    ? [
        { label: "Eser", flex: 1 },
        { label: "", width: 150, align: "right" },
      ]
    : [
        { label: "Eser", flex: 2.2 },
        { label: "Konum", flex: 1.4 },
        { label: "Durum", width: 110 },
        { label: "Kaynak", flex: 1 },
        { label: "İşlemler", width: 300, align: "right" },
      ];

  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline="İçerik"
          title="Eserler"
          hint="Veri setindeki ve panelden eklenen bütün eserler. Taslaklar ziyaretçilere görünmez; yayına alınan eser uygulamada hemen görünür."
          actions={<Button label="Yeni eser" icon="add" kind="primary" onPress={() => router.push("/admin/assets/new")} />}
        />
        <View style={styles.filters}>
          <SearchField
            label="Eser ara"
            value={search}
            onChangeText={(text) => {
              setSearch(text);
              setLimit(PAGE);
            }}
            placeholder="Eser adı, il, ilçe ya da kimlik"
            style={styles.search}
          />
          <Segments
            label="Göster"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setLimit(PAGE);
            }}
            options={[
              { value: "all", label: "Tümü" },
              { value: "published", label: "Yayında" },
              { value: "draft", label: "Taslak", count: items.length - published },
              { value: "panel", label: "Panelden eklenen", count: fromPanel },
            ]}
          />
          {list.data && (
            <Text color="textSecondary" style={styles.total}>
              {formatNumber(matching.length)} eser
            </Text>
          )}
        </View>

        <Card padded={false}>
          <TableHead columns={columns} />
          {list.loading && !list.data ? (
            <Loading />
          ) : list.error && !list.data ? (
            <Failed message={list.error} onRetry={list.reload} />
          ) : shown.length === 0 ? (
            <Empty
              icon="business-outline"
              title={items.length === 0 ? "Henüz eser yok" : "Bu filtrede eser yok"}
              action={items.length === 0 ? <Button label="Yeni eser" icon="add" kind="primary" onPress={() => router.push("/admin/assets/new")} /> : undefined}
            />
          ) : (
            shown.map((asset, i) => {
              const status =
                asset.status === "published" ? (
                  <Badge tone="green" label="Yayında" icon="radio-button-on" />
                ) : asset.status === "in_review" ? (
                  <Badge tone="blue" label="İncelemede" icon="time-outline" />
                ) : (
                  <Badge tone="grey" label="Taslak" icon="document-outline" />
                );
              const actions = (
                <View style={styles.actions}>
                  {!narrow && (
                    <Button
                      small
                      label={asset.status === "published" ? "Taslağa al" : "Yayına al"}
                      icon={asset.status === "published" ? "cloud-download-outline" : "cloud-upload-outline"}
                      kind={asset.status === "published" ? "ghost" : "success"}
                      busy={busy === asset.id}
                      onPress={() => void toggleStatus(asset)}
                    />
                  )}
                  <Button small label="Düzenle" icon="create-outline" onPress={() => router.push(`/admin/assets/${asset.id}`)} accessibilityLabel={`${asset.name} düzenle`} />
                  {asset.origin === "panel" && <Button small icon="trash-outline" kind="danger" accessibilityLabel={`${asset.name} sil`} onPress={() => setDeleting(asset)} />}
                </View>
              );
              const cells = narrow
                ? [<Cell key="name" title={asset.name} sub={`${asset.type} · ${asset.city} · ${asset.status === "published" ? "Yayında" : "Taslak"}`} />, actions]
                : [
                    <Cell key="name" title={asset.name} sub={`${asset.type} · ${asset.id}`} />,
                    <Cell key="where" title={asset.city} sub={asset.district} />,
                    status,
                    <Cell key="date" title={formatDate(asset.updatedAt)} sub={asset.origin === "panel" ? `Panel · @${asset.createdBy}` : "Veri seti"} />,
                    actions,
                  ];
              return <TableRow key={asset.id} columns={columns} cells={cells} last={i === shown.length - 1} />;
            })
          )}
          {matching.length > shown.length && (
            <View style={styles.more}>
              <Button label={`Daha fazla göster (${formatNumber(matching.length - shown.length)} eser daha)`} onPress={() => setLimit(limit + PAGE)} />
            </View>
          )}
        </Card>
      </PageBody>

      {deleting && (
        <Confirm
          danger
          title={`${deleting.name} silinsin mi?`}
          body="Eser ve ona bırakılan notlar kalıcı olarak silinir. Bu geri alınamaz."
          confirmLabel="Sil"
          busy={busy === deleting.id}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
      <Toast toast={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 },
  search: { flexGrow: 1, flexBasis: 280, maxWidth: 420 },
  total: { marginLeft: "auto", fontSize: 13, fontFamily: fontFamily.sansMedium },
  more: { alignItems: "center", paddingVertical: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
});
