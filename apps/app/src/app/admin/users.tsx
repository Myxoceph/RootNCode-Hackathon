import type { AdminUser, UserRole } from "@vagabonds/contracts";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "@vagabonds/ui";

import {
  Avatar,
  Badge,
  Button,
  Card,
  Cell,
  Confirm,
  Empty,
  errorText,
  Failed,
  Field,
  formatDate,
  formatNumber,
  Loading,
  PageHeader,
  Segments,
  TableHead,
  TableRow,
  Toast,
  useLoad,
  useToast,
  type Column,
} from "@/components/admin/kit";
import { ROLE } from "@/components/admin/labels";
import { PageBody, usePanel } from "@/components/admin/shell";
import { useCommunity } from "@/data";
import { banUser, fetchUsers, setUserRole, unbanUser } from "@/data/admin";

const PAGE = 25;

/** Everyone who signed in, anonymous or with an account: roles, bans and how much they contributed. */
export default function Users() {
  const { role: myRole, refreshPending } = usePanel();
  const { user: me } = useCommunity();
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<UserRole | "all">("all");
  const [offset, setOffset] = useState(0);
  const [asking, setAsking] = useState<{ user: AdminUser; action: "ban" | "unban" | UserRole } | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  // Searches once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useLoad(() => fetchUsers({ q: q || undefined, role: role === "all" ? undefined : role, limit: PAGE, offset }), [q, role, offset]);

  const act = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      const { user, action } = asking;
      if (action === "ban") {
        await banUser(user.id);
        show(`${user.nickname} engellendi.`);
      } else if (action === "unban") {
        await unbanUser(user.id);
        show(`${user.nickname} için engel kaldırıldı.`);
      } else {
        await setUserRole(user.id, action);
        show(`${user.nickname} artık ${ROLE[action].label.toLocaleLowerCase("tr")}.`);
      }
      list.reload();
      refreshPending();
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(false);
      setAsking(null);
    }
  };

  const columns: Column[] = narrow
    ? [
        { label: "Kullanıcı", flex: 1 },
        { label: "", width: 120, align: "right" },
      ]
    : [
        { label: "Kullanıcı", flex: 2.2 },
        { label: "Rol", flex: 1 },
        { label: "Not", width: 80, align: "right" },
        { label: "Katıldı", flex: 1 },
        { label: "İşlemler", width: myRole === "admin" ? 300 : 140, align: "right" },
      ];

  const data = list.data;
  const total = data?.total ?? 0;
  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline="Topluluk"
          title="Kullanıcılar"
          hint={myRole === "admin" ? "Rol ver, engelle ya da engeli kaldır. Kendi rolünü değiştiremezsin." : "Kötüye kullanan ziyaretçileri engelle ya da engeli kaldır."}
        />
        <View style={styles.filters}>
          <Field label="Ara" value={search} onChangeText={setSearch} placeholder="Takma ad ya da kullanıcı adı" style={{ flex: 1, minWidth: 220, maxWidth: 380 }} />
          <View style={{ gap: 6 }}>
            <Text style={styles.filterLabel}>Rol</Text>
            <Segments
              label="Rol"
              value={role}
              onChange={(value) => {
                setRole(value);
                setOffset(0);
              }}
              options={[
                { value: "all", label: "Tümü" },
                { value: "visitor", label: "Ziyaretçi" },
                { value: "moderator", label: "Moderatör" },
                { value: "admin", label: "Admin" },
              ]}
            />
          </View>
        </View>

        <Card padded={false}>
          <TableHead columns={columns} />
          {list.loading && !data ? (
            <Loading />
          ) : list.error && !data ? (
            <Failed message={list.error} onRetry={list.reload} />
          ) : data && data.items.length === 0 ? (
            <Empty icon="search-outline" title="Kullanıcı bulunamadı" body="Aramayı ya da rol filtresini değiştirmeyi dene." />
          ) : (
            data?.items.map((person, i) => {
              const self = person.id === me?.id;
              const roleLook = ROLE[person.role];
              const who = (
                <View style={styles.who}>
                  <Avatar name={person.nickname} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.whoLine}>
                      <Cell title={person.nickname} />
                      {self && <Badge tone="grey" label="Sen" />}
                    </View>
                    <Text color="textSecondary" style={styles.sub} numberOfLines={1}>
                      {person.username ? `@${person.username}` : "Anonim ziyaretçi"}
                      {narrow ? ` · ${roleLook.label}` : ""}
                    </Text>
                  </View>
                </View>
              );
              const banButton = person.bannedAt ? (
                <Button small label="Engeli kaldır" icon="lock-open-outline" kind="success" disabled={self} onPress={() => setAsking({ user: person, action: "unban" })} />
              ) : (
                <Button small label="Engelle" icon="ban-outline" kind="danger" disabled={self} onPress={() => setAsking({ user: person, action: "ban" })} />
              );
              const cells = narrow
                ? [who, banButton]
                : [
                    who,
                    <View key="role" style={styles.badges}>
                      <Badge tone={roleLook.tone} label={roleLook.label} />
                      {person.bannedAt && <Badge tone="red" label="Engelli" icon="ban-outline" />}
                    </View>,
                    <Text key="count" style={styles.mono}>
                      {formatNumber(person.contributions)}
                    </Text>,
                    <Text key="date" color="textSecondary" style={styles.sub}>
                      {formatDate(person.createdAt)}
                    </Text>,
                    <View key="actions" style={styles.actions}>
                      {myRole === "admin" && person.username && !self && (
                        <RoleMenu current={person.role} onPick={(next) => setAsking({ user: person, action: next })} />
                      )}
                      {banButton}
                    </View>,
                  ];
              return <TableRow key={person.id} columns={columns} cells={cells} last={i === data.items.length - 1} />;
            })
          )}
        </Card>

        {total > PAGE && (
          <View style={styles.pager}>
            <Text color="textSecondary" style={styles.sub}>
              {formatNumber(offset + 1)}–{formatNumber(Math.min(offset + PAGE, total))} / {formatNumber(total)}
            </Text>
            <Button small icon="chevron-back" accessibilityLabel="Önceki sayfa" disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - PAGE))} />
            <Button small icon="chevron-forward" accessibilityLabel="Sonraki sayfa" disabled={offset + PAGE >= total} onPress={() => setOffset(offset + PAGE)} />
          </View>
        )}
      </PageBody>

      {asking && (
        <Confirm
          danger={asking.action === "ban"}
          title={
            asking.action === "ban"
              ? `${asking.user.nickname} engellensin mi?`
              : asking.action === "unban"
                ? `${asking.user.nickname} için engel kalksın mı?`
                : `${asking.user.nickname} ${ROLE[asking.action].label.toLocaleLowerCase("tr")} olsun mu?`
          }
          body={
            asking.action === "ban"
              ? "Engellenen kullanıcı artık not gönderemez ve giriş yapamaz; onaylı notları nabızdan kalkar."
              : asking.action === "unban"
                ? "Kullanıcı yeniden not gönderebilir; onaylı notları yeniden görünür."
                : asking.action === "admin"
                  ? "Admin her şeyi yönetebilir: roller, eserler, başarımlar ve ödüller."
                  : asking.action === "moderator"
                    ? "Moderatör inceleme kuyruğunu ve kullanıcıları yönetebilir."
                    : "Kullanıcı yönetim paneline erişemez."
          }
          confirmLabel={asking.action === "ban" ? "Engelle" : asking.action === "unban" ? "Engeli kaldır" : "Rolü değiştir"}
          busy={busy}
          onConfirm={() => void act()}
          onCancel={() => setAsking(null)}
        />
      )}
      <Toast toast={toast} />
    </View>
  );
}

/** The three roles side by side; the current one is marked. */
function RoleMenu({ current, onPick }: { current: UserRole; onPick: (role: UserRole) => void }) {
  return (
    <Segments
      label="Rol ver"
      value={current}
      onChange={(next) => next !== current && onPick(next)}
      options={[
        { value: "visitor", label: "Ziyaretçi" },
        { value: "moderator", label: "Mod" },
        { value: "admin", label: "Admin" },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 16, marginBottom: 20 },
  filterLabel: { fontSize: 13, fontWeight: "600" },
  who: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  whoLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  sub: { fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: "IBMPlexMono_400Regular", fontSize: 14 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 14 },
});
