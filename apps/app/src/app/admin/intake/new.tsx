import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ChatComposer } from "@/components/admin/intake-chat";
import { Card, PageHeader, Picker, useLoad } from "@/components/admin/kit";
import { PageBody } from "@/components/admin/shell";
import { fetchMetaEnums, startChat } from "@/data/admin";

/** `/admin/intake/new`: the city, then the first message; the chat opens once it is sent. */
export default function NewChat() {
  const router = useRouter();
  const enums = useLoad(fetchMetaEnums);
  const [city, setCity] = useState<string | null>(null);
  const [text, setText] = useState("");

  const send = async (message: string, uploads: string[]) => {
    const { job } = await startChat({ city: city!, text: message, uploads });
    router.replace(`/admin/intake/${job.id}`);
  };

  return (
    <View style={styles.fill}>
      <PageBody>
        <PageHeader overline="Sohbetten Kabul" title="Yeni sohbet" hint="Bir sohbet, bir yeni eser. Önce şehrini seç; ilçeyi, mahalleyi ve gerisini mesajda anlatabilirsin." tools={false} />
        <View style={styles.column}>
          <Card>
            <Picker
              label="Şehir"
              value={city}
              onChange={setCity}
              placeholder={enums.loading ? "Yükleniyor" : "Şehir seç"}
              options={(enums.data?.cities ?? []).map((c) => ({ value: c.code, label: c.label }))}
              hint="Taslak bu şehrin içinde yerleştirilir."
            />
          </Card>
          <ChatComposer
            onSend={send}
            closed={city ? null : "Göndermeden önce şehri seç."}
            placeholder={"Eserin adı ilk satırda olsun. Sonra bildiklerin: ilçesi, ne zaman ve kim yaptırdı, kitabesi, bugünkü durumu…\nKitaptan ya da notlarından uzun bir metin yapıştırabilirsin."}
            draftText={text}
            onDraftText={setText}
          />
        </View>
      </PageBody>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: 14, maxWidth: 760 },
});
