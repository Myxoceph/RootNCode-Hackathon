import type { IntakeJob } from "@vagabonds/contracts";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Badge, Button, Card, Cell, Empty, Failed, Loading, PageHeader, TableHead, TableRow, timeAgo, useAdminColors, useLoad, type Column } from "@/components/admin/kit";
import { jobBadge } from "@/components/admin/intake-chat";
import { PageBody } from "@/components/admin/shell";
import { fetchChats, fetchMetaEnums } from "@/data/admin";

const COLUMNS: Column[] = [{ label: "Sohbet", flex: 3 }, { label: "Şehir", flex: 1 }, { label: "Durum", width: 170 }, { label: "Son", width: 110, align: "right" }];

/**
 * Sohbetten Kabul (Veri Döngüsü): a new asset told in a chat, as the admin knows it (notes, a page
 * of a book, photos from the site). The worker writes the draft; it waits for approval like the others.
 */
export default function Chats() {
  const router = useRouter();
  const list = useLoad(fetchChats);
  const enums = useLoad(fetchMetaEnums);
  const city = (code: string) => enums.data?.cities.find((c) => c.code === code)?.label ?? code;

  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader
          overline="Veri Döngüsü"
          title="Sohbetten Kabul"
          hint="Yeni bir eseri bildiklerinle anlat: notlar, kitaptan bir sayfa, sahadan fotoğraflar. Taslağı yapay zekâ düzenler, her alanı senin mesajından alıntıyla gösterir; mesajlarda olmayan bilgi eklenmez."
          actions={list.data !== null && <Button label="Yeni sohbet" icon="add" kind="primary" onPress={() => router.push("/admin/intake/new")} />}
        />
        <Card padded={false}>
          {list.loading && !list.data ? (
            <Loading />
          ) : list.error && !list.data ? (
            <Failed message={list.error} onRetry={list.reload} />
          ) : list.data === null ? (
            <Empty icon="cloud-offline-outline" title="Bu sunucuda kapalı" body="Sohbetten Kabul yalnızca INTAKE_ENABLED açık bir API'de çalışır (Veri Döngüsü, yerel geliştirme)." />
          ) : list.data.length === 0 ? (
            <Empty
              icon="chatbubbles-outline"
              title="Henüz sohbet yok"
              body="İlk eseri anlatmaya başla; şehrini seçip bildiklerini yaz."
              action={<Button label="Yeni sohbet" icon="add" kind="primary" onPress={() => router.push("/admin/intake/new")} />}
            />
          ) : (
            <View>
              <TableHead columns={COLUMNS} />
              {list.data.map((job, i) => (
                <ChatRow key={job.id} job={job} city={city(job.city)} last={i === list.data!.length - 1} onOpen={() => router.push(`/admin/intake/${job.id}`)} />
              ))}
            </View>
          )}
        </Card>
      </PageBody>
    </View>
  );
}

function ChatRow({ job, city, last, onOpen }: { job: IntakeJob; city: string; last: boolean; onOpen: () => void }) {
  const a = useAdminColors();
  const badge = jobBadge(job);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${job.title}, ${badge.label}`} onPress={onOpen} style={({ pressed }) => [pressed && { backgroundColor: a.hover }]}>
      <TableRow
        columns={COLUMNS}
        last={last}
        cells={[
          <Cell key="t" title={job.title} sub={job.error ? `Hata: ${job.error}` : null} />,
          <Cell key="c" title={city} />,
          <Badge key="s" tone={badge.tone} label={badge.label} icon={badge.icon} />,
          <Cell key="u" title={timeAgo(job.updatedAt)} />,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
