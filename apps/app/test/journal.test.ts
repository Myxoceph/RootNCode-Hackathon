import type { JournalEntry, JournalPhoto } from "@vagabonds/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("../src/lib/journal");

const api = vi.hoisted(() => ({
  fetchJournalPage: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
  deleteJournalPhoto: vi.fn(),
  uploadJournalPhoto: vi.fn(),
}));
const session = vi.hoisted(() => ({ userId: "alice" as string | null }));

vi.mock("@/data/journal", () => api);
vi.mock("@/data/community", () => ({
  currentUserId: async () => session.userId,
  useCommunity: () => ({ user: session.userId ? { id: session.userId } : null }),
}));

const ENTRY = "0b9f6c2e-6d0e-4a55-8c1a-0e7d2f4b5a11";
const entry = (id: string, text: string | null = "yazı", photos: JournalPhoto[] = []): JournalEntry => ({
  id,
  text,
  photos,
  layout: null,
  createdAt: "2026-11-06T10:00:00.000Z",
  updatedAt: "2026-11-06T10:00:00.000Z",
});
const photo = (id: string): JournalPhoto => ({ id, width: 100, height: 100, lqip: "data:", dominantColor: "#000000", thumbUrl: `/t/${id}`, fullUrl: `/f/${id}` });
const page = (items: JournalEntry[], nextCursor: string | null = null, total = items.length) => ({ version: "0.3.30", items, total, nextCursor });
const pick = (uri: string) => ({ id: `id-${uri}`, uri, width: 4000, height: 3000 });
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("journal store", () => {
  let store: Store;
  let state: () => import("../src/lib/journal").JournalState;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    session.userId = "alice";
    api.deleteJournalEntry.mockResolvedValue(undefined);
    store = await import("../src/lib/journal");
    // Read through the store's own way of showing it: the hook needs React, this does not.
    state = () => store.journalSnapshot();
  });

  it("shows nothing of one account to the next, and a late answer does not bring it back", async () => {
    let answerAlice!: (value: unknown) => void;
    api.fetchJournalPage.mockResolvedValueOnce(page([entry("a1")]));
    await store.openJournal();
    expect(state().entries.map((e) => e.id)).toEqual(["a1"]);

    api.fetchJournalPage.mockReturnValueOnce(new Promise((resolve) => (answerAlice = resolve)));
    const lateOpen = store.openJournal();
    await flush();

    session.userId = "bob";
    api.fetchJournalPage.mockResolvedValueOnce(page([entry("b1")]));
    await store.openJournal();
    expect(state().entries.map((e) => e.id)).toEqual(["b1"]);

    answerAlice(page([entry("a2")]));
    await lateOpen;
    expect(state().entries.map((e) => e.id)).toEqual(["b1"]);
  });

  it("sends photos one at a time and keeps the page usable meanwhile", async () => {
    api.fetchJournalPage.mockResolvedValue(page([]));
    api.createJournalEntry.mockResolvedValue(entry(ENTRY, null));
    let inFlight = 0;
    let most = 0;
    const finish: Array<(value: JournalPhoto) => void> = [];
    api.uploadJournalPhoto.mockImplementation(() => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      return new Promise((resolve) => finish.push((value) => { inFlight -= 1; resolve(value); }));
    });

    await store.openJournal();
    // Answers as soon as the entry exists, not when its photos are done.
    await store.addJournalEntry("", [pick("one"), pick("two")]);
    await flush();
    expect(state().pending.map((p) => p.status)).toEqual(["sending", "waiting"]);

    finish.shift()!(photo("p1"));
    await flush();
    expect(state().entries[0]!.photos.map((p) => p.id)).toEqual(["p1"]);
    expect(state().pending.map((p) => p.status)).toEqual(["sending"]);

    finish.shift()!(photo("p2"));
    await flush();
    expect(state().entries[0]!.photos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(state().pending).toEqual([]);
    expect(most).toBe(1);
  });

  it("holds a failed photo for a retry, and goes on with the next", async () => {
    api.fetchJournalPage.mockResolvedValue(page([]));
    api.createJournalEntry.mockResolvedValue(entry(ENTRY, "yazı"));
    api.uploadJournalPhoto.mockRejectedValueOnce(new Error("no network")).mockResolvedValue(photo("p2"));
    await store.openJournal();
    await store.addJournalEntry("yazı", [pick("one"), pick("two")]);
    await flush();
    const [failed] = state().pending;
    expect(failed).toMatchObject({ uri: "one", status: "failed" });
    expect(state().entries[0]!.photos.map((p) => p.id)).toEqual(["p2"]);

    api.uploadJournalPhoto.mockResolvedValueOnce(photo("p1"));
    store.retryJournalPhoto(failed!.id);
    await flush();
    expect(state().pending).toEqual([]);
    expect(state().entries[0]!.photos.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("removes a page of photos alone when its only photo is given up on", async () => {
    api.fetchJournalPage.mockResolvedValue(page([]));
    api.createJournalEntry.mockResolvedValue(entry(ENTRY, null));
    api.uploadJournalPhoto.mockRejectedValue(new Error("no network"));
    await store.openJournal();
    await store.addJournalEntry("", [pick("one")]);
    await flush();
    expect(state().total).toBe(1);

    store.dropJournalPhoto(state().pending[0]!.id);
    expect(state().entries).toEqual([]);
    expect(state().total).toBe(0);
    expect(api.deleteJournalEntry).toHaveBeenCalledWith(ENTRY);
  });

  it("does not send what is left of a queue after signing out", async () => {
    api.fetchJournalPage.mockResolvedValue(page([]));
    api.createJournalEntry.mockResolvedValue(entry(ENTRY, null));
    let finishFirst!: (value: JournalPhoto) => void;
    api.uploadJournalPhoto.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)));
    await store.openJournal();
    await store.addJournalEntry("", [pick("one"), pick("two")]);
    await flush();

    session.userId = null;
    finishFirst(photo("p1"));
    await flush();
    expect(api.uploadJournalPhoto).toHaveBeenCalledTimes(1);
    expect(state().pending).toEqual([]);
  });

  it("keeps a page whose photos are still coming when the list is fetched again", async () => {
    api.fetchJournalPage.mockResolvedValueOnce(page([entry("old")]));
    api.createJournalEntry.mockResolvedValue(entry(ENTRY, null));
    api.uploadJournalPhoto.mockReturnValue(new Promise(() => undefined));
    await store.openJournal();
    await store.addJournalEntry("", [pick("one")]);
    await flush();

    api.fetchJournalPage.mockResolvedValueOnce(page([entry("old")]));
    await store.openJournal();
    expect(state().entries.map((e) => e.id)).toEqual([ENTRY, "old"]);
    expect(state().total).toBe(2);
  });

  it("asks for each further page once, and can ask again after a failure", async () => {
    api.fetchJournalPage.mockResolvedValueOnce(page([entry("a")], "next", 2));
    await store.openJournal();
    api.fetchJournalPage.mockRejectedValueOnce(new Error("no network"));
    await store.loadMoreJournal();
    expect(state().moreError).not.toBeNull();

    let finish!: (value: unknown) => void;
    api.fetchJournalPage.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const asked = store.loadMoreJournal();
    void store.loadMoreJournal();
    expect(api.fetchJournalPage).toHaveBeenCalledTimes(3);
    finish(page([entry("b")], null, 2));
    await asked;
    expect(state().entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(state().nextCursor).toBeNull();
  });

  it("lays the book out: a page for writing, then the newest first with their numbers", () => {
    const entries = [entry("new"), entry("old")];
    expect(store.bookPages(entries, 5, true, true).map((p) => (p.kind === "entry" ? `${p.entry.id}:${p.number}` : p.kind))).toEqual(["cover", "new", "new:5", "old:4", "more"]);
    expect(store.bookPages([], 0, false, false).map((p) => p.kind)).toEqual(["new"]);
  });

  it("keeps a book's shape, whole inside the room there is, whatever the screen", () => {
    for (const [roomW, roomH] of [[358, 640], [320, 460], [390, 900], [800, 300], [844, 320], [1280, 640], [768, 950]] as const) {
      const { width, height } = store.bookSize(roomW, roomH);
      expect(width).toBeLessThanOrEqual(roomW);
      expect(height).toBeLessThanOrEqual(roomH);
      expect(width).toBeGreaterThan(0);
    }
    const phone = store.bookSize(358, 640);
    expect(phone.spread).toBe(false);
    expect(phone.height / phone.width).toBeCloseTo(1 / 0.64, 1);
    expect(store.bookSize(844, 320).spread).toBe(true);
    expect(store.bookSize(768, 950).spread).toBe(false);
  });

  it("lets a dragged leaf go over or fall back as paper would", () => {
    expect(store.settleTurn(3, 0.5, 0, 9)).toBe(4);
    expect(store.settleTurn(3, -0.5, 0, 9)).toBe(2);
    expect(store.settleTurn(3, 0.1, 0, 9)).toBe(3);
    // A quick flick turns it even when barely lifted, but not one against the way it is going.
    expect(store.settleTurn(3, 0.1, -1, 9)).toBe(4);
    expect(store.settleTurn(3, 0.1, 1, 9)).toBe(3);
    // Not past either end of the book.
    expect(store.settleTurn(9, 0.8, -1, 9)).toBe(9);
    expect(store.settleTurn(0, -0.8, 1, 9)).toBe(0);
    expect(store.settleTurn(3, 0, -1, 9)).toBe(3);
  });

  it("asks one question a day, and another the next", () => {
    const prompts = ["a", "b", "c"];
    const morning = new Date("2026-11-07T06:00:00Z");
    const evening = new Date("2026-11-07T20:00:00Z");
    const tomorrow = new Date("2026-11-08T06:00:00Z");
    expect(store.dailyPrompt(prompts, morning)).toBe(store.dailyPrompt(prompts, evening));
    expect(store.dailyPrompt(prompts, tomorrow)).not.toBe(store.dailyPrompt(prompts, morning));
  });

  it("keeps a page of a drawing alone when its last photo is given up on", async () => {
    const stroke = { color: "ink" as const, size: "thin" as const, d: "1,2 3,4" };
    const drawn = { ...entry(ENTRY, null), layout: { photos: [], text: { x: 0, y: 0, width: 1, z: 1 }, strokes: [stroke], stickers: [] } };
    api.fetchJournalPage.mockResolvedValue(page([]));
    api.createJournalEntry.mockResolvedValue(drawn);
    api.uploadJournalPhoto.mockRejectedValue(new Error("no network"));
    await store.openJournal();
    await store.addJournalEntry("", [pick("one")], drawn.layout);
    await flush();
    store.dropJournalPhoto(state().pending[0]!.id);
    expect(state().entries.map((e) => e.id)).toEqual([ENTRY]);
    expect(api.deleteJournalEntry).not.toHaveBeenCalled();
  });

  it("sends each photo under its own id, so the layout can name it before it arrives", async () => {
    api.fetchJournalPage.mockResolvedValue(page([]));
    api.createJournalEntry.mockResolvedValue(entry(ENTRY, null));
    api.uploadJournalPhoto.mockResolvedValue(photo("id-one"));
    const layout = { photos: [{ id: "id-one", x: 0.2, y: 0, width: 0.5, rotation: 3, z: 1 }], text: { x: 0.1, y: 1, width: 0.7, z: 2 }, strokes: [], stickers: [] };
    await store.openJournal();
    await store.addJournalEntry("", [pick("one")], layout);
    await flush();
    expect(api.createJournalEntry).toHaveBeenCalledWith(null, layout);
    expect(api.uploadJournalPhoto).toHaveBeenCalledWith(ENTRY, "id-one", "one", 4000, 3000);
  });

  it("saves a changed layout even when the text is the same, and nothing when neither changed", async () => {
    const before = entry(ENTRY, "yazı");
    api.fetchJournalPage.mockResolvedValue(page([before]));
    await store.openJournal();
    await store.editJournalEntry(before, "yazı", [], []);
    expect(api.updateJournalEntry).not.toHaveBeenCalled();

    const layout = { photos: [], text: { x: 0.3, y: 2, width: 0.5, z: 1 }, strokes: [], stickers: [] };
    api.updateJournalEntry.mockResolvedValue({ ...before, layout });
    await store.editJournalEntry(before, "yazı", [], [], layout);
    expect(api.updateJournalEntry).toHaveBeenCalledWith(ENTRY, "yazı", layout);
    expect(state().entries[0]!.layout).toEqual(layout);
  });

  it("makes a photo id the API takes", async () => {
    const { JournalIdSchema } = await import("@vagabonds/contracts");
    const ids = Array.from({ length: 50 }, () => store.newPhotoId());
    for (const id of ids) expect(JournalIdSchema.safeParse(id).success, id).toBe(true);
    expect(new Set(ids).size).toBe(50);
  });
});
