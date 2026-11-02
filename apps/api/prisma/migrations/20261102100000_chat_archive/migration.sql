-- Asistan sohbet arşivi: hesabı olan ziyaretçinin konuşmaları saklanır, geçmişte listelenir ve
-- yeniden açılır. Yalnızca sahibi görür ve silebilir; konum hiç saklanmaz.

-- Bir konuşma bir sayfada (Rehber ya da bir eser) başlar. Her sayfada en çok bir açık konuşma olur;
-- "Yeni konuşma" açık olanı arşive alır, arşivdeki konuşmaya soru gönderilmez.
CREATE TABLE chat_conversation (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  asset_id     text REFERENCES asset(id) ON DELETE CASCADE,   -- null: Rehber
  title        text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);
CREATE INDEX chat_conversation_user_idx ON chat_conversation (user_id, updated_at DESC);
-- Prisma bu kısmi, ifadeli indeksi ifade edemez; yalnızca burada yaşar.
CREATE UNIQUE INDEX chat_conversation_open_idx ON chat_conversation (user_id, (coalesce(asset_id, '')))
  WHERE archived_at IS NULL;

-- Soru metni olduğu gibi; cevap, uygulamanın gösterdiği hâliyle (kaynaklar, gezi planı, rota) JSON olarak.
CREATE TABLE chat_message (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  response         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_response_check CHECK ((role = 'assistant') = (response IS NOT NULL))
);
CREATE INDEX chat_message_conversation_idx ON chat_message (conversation_id, id);
