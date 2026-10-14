/* Vakıf Eserleri · Veri Görüntüleyici
   Veri: data.js (tools/build_viewer.py üretir). Tablolar ve sütunlar db_rows.TABLES ile
   birebir aynıdır; burada hiçbir alan gizlenmez ya da eklenmez, yalnızca biçimlendirilir. */
(() => {
  "use strict";

  const D = window.VIEWER_DATA;
  const main = document.getElementById("main");
  if (!D) {
    main.innerHTML = `<h1>Veri bulunamadı</h1>
      <p class="lede">Önce <code>python3 data/tools/build_viewer.py</code> çalıştırın; bu komut <code>viewer/data.js</code> dosyasını üretir.</p>`;
    return;
  }

  const MEDIA_BASE = "../build/media/";
  const TEXT_ARRAY_COLS = new Set(["tags", "secondary_types"]);
  const BADGE_VALUES = new Set(["certain", "probable", "disputed", "legend", "published", "in_review", "draft",
    "yes", "no", "partial", "unknown", "folk_belief", "refuted_by_source", "unverified"]);
  const LONG = 180;

  const TABLE_NOTES = {
    asset: "Ana eser kaydı. Tek satır olduğu için dikey gösterilir.",
    asset_section: "Tarihçe bölümleri.",
    asset_legend: "Rivayetler; tarihçeden ayrı tutulur.",
    asset_fact: "Sayısal bilgiler.",
    asset_person: "Eserle ilişkili kişiler.",
    timeline_event: "Zaman çizelgesi.",
    asset_highlight: "“Bunu kaçırma” noktaları.",
    asset_relation: "Diğer eserlere bağlar (Kentsel Ağ / Sis Açma). Hedefe FK yok; hedef henüz veri setinde olmayabilir.",
    visitor_tip: "Ziyaretçi ipuçları.",
    exhibition: "Sergi bilgileri.",
    source_citation: "Her içerik parçasının kaynağı (entity + entity_key ile bağlanır).",
    media: "Fiziksel görsel dosyası. id DB'de uuid'dir; burada hash'in ilk 10 hanesiyle gösterilir.",
    media_variant: "Üretilen sürümler (480/1280/2560 px × webp/jpg).",
    asset_media: "Görselin bu eserdeki kullanımı: açıklama, alt metin, kapak, odak noktası.",
    inscription: "Kitabeler (Taşın Dili / AR).",
    contribution: "Topluluk katkıları. İçe aktarmada boştur; uygulama çalışırken dolar.",
    asset_revision: "Değişiklik geçmişi. İçe aktarma 1. sürümü yazar.",
    region: "Bölgeler (enums.json).",
    city: "İller (enums.json).",
    asset_type: "Eser türleri (enums.json).",
    era: "Dönemler (enums.json).",
    relation_type: "İlişki türleri (enums.json).",
    timeline_event_type: "Zaman çizelgesi olay türleri (enums.json).",
    source: "Kaynaklar (sources.json).",
  };

  const ASSET_GROUPS = {
    id: "Kimlik ve sınıflandırma", name_tr: "Ad ve özet", city_code: "Konum", dating_display_tr: "Tarihleme",
    founder_name: "Banî, mimar, vakıf", visit_setting: "Ziyaret", a11y_wheelchair: "Erişilebilirlik",
    ambient_sound_key: "Ortam sesi", media_folder: "Yönetim",
  };

  // ───────────────────────────── yardımcılar
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lower = (s) => String(s).toLocaleLowerCase("tr");
  const fmt = (n) => n.toLocaleString("tr-TR");
  const assetsById = new Map(D.assets.map((a) => [a.id, a]));
  const sourcesById = new Map(D.shared.source.map((s) => [s.id, s]));
  const route = (path) => `index.html#/${path}`;
  const isMediaRef = (v) => v && typeof v === "object" && !Array.isArray(v) && "$media" in v;
  const isGenerated = (v) => v && typeof v === "object" && !Array.isArray(v) && v.$generated === true;

  // ───────────────────────────── yumuşak kaydırma (Lenis; ayarlar global tercihlerden)
  const MAX_STEP = 140; // tek olayda en fazla px (bir fare tıkı ~100 px, kırpılmasın)
  const MAX_LEAD = 360; // hedef, mevcut konumun en fazla bu kadar önünde
  let lenis = null;
  if (window.Lenis && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    lenis = new window.Lenis({
      lerp: 0.14,
      virtualScroll: (data) => {
        const { event } = data;
        if (event.type !== "wheel") return true;
        const sign = Math.sign(data.deltaY);
        let delta = sign * Math.min(Math.abs(data.deltaY), MAX_STEP);
        const lead = lenis.targetScroll - lenis.animatedScroll;
        const room = Math.max(0, MAX_LEAD - sign * lead);
        delta = sign * Math.min(Math.abs(delta), room);
        if (delta === 0) {
          // Olayı yutarken preventDefault şart; yoksa tarayıcı da kaydırır ve sayfa titrer.
          if (event.cancelable) event.preventDefault();
          return false;
        }
        data.deltaY = delta;
        return true;
      },
      autoRaf: true,
      anchors: true,
    });
  }
  const scrollToTop = () => (lenis ? lenis.scrollTo(0, { immediate: true }) : window.scrollTo(0, 0));
  const scrollToEl = (el) => {
    const offset = -(document.querySelector(".topbar").offsetHeight + (document.querySelector(".toc")?.offsetHeight || 0) + 12);
    if (lenis) lenis.scrollTo(el, { offset });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset });
  };

  // ───────────────────────────── hücre biçimlendirme
  function cell(value, col, table) {
    if (value === null || value === undefined) return `<span class="null">NULL</span>`;
    if (isGenerated(value)) return `<span class="gen" title="Bu değeri veritabanı üretir (identity / uuid / now())">DB üretir</span>`;
    if (isMediaRef(value)) return `<span class="mref" title="DB'de uuid">media:${esc(value.$media)}</span>`;
    if (typeof value === "boolean") return `<span class="bool ${value ? "t" : "f"}">${value}</span>`;
    if (typeof value === "number") return `<span class="num">${value}</span>`;
    if (Array.isArray(value) && TEXT_ARRAY_COLS.has(col)) {
      return value.length ? `<span class="arr">${value.map((v) => `<span>${esc(v)}</span>`).join("")}</span>` : `<span class="emptystr">{}</span>`;
    }
    if (typeof value === "object") {
      const n = Array.isArray(value) ? value.length : Object.keys(value).length;
      if (n === 0) return `<span class="emptystr">${Array.isArray(value) ? "[]" : "{}"}</span>`;
      const label = Array.isArray(value) ? `jsonb · ${n} öğe` : `jsonb · ${n} alan`;
      return `<details class="json"><summary>${label}</summary><pre>${esc(JSON.stringify(value, null, 2))}</pre></details>`;
    }
    const s = String(value);
    if (s === "") return `<span class="emptystr">''</span>`;
    if (BADGE_VALUES.has(s) && /(confidence|status|verdict|^a11y_)/.test(col)) return `<span class="badge ${esc(s)}">${esc(s)}</span>`;
    if (col === "dominant_color") return `<span class="swatch" style="background:${esc(s)}"></span><code>${esc(s)}</code>`;
    if (col === "lqip") return `<span class="lqip"><img src="${esc(s)}" alt=""><code>data URI · ${fmt(s.length)} karakter</code></span>`;
    if (col === "url" && /^https?:/.test(s)) return `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>`;
    if (table === "media_variant" && col === "key") return `<a href="${esc(MEDIA_BASE + s)}" target="_blank" rel="noopener"><code>${esc(s)}</code></a>`;
    if (col === "target_asset_id") {
      return assetsById.has(s)
        ? `<a href="${route("eser/" + esc(s))}"><code>${esc(s)}</code></a>`
        : `<code>${esc(s)}</code> <span class="null" title="Hedef eser henüz veri setinde yok">yok</span>`;
    }
    if (col === "source_id" && sourcesById.has(s)) return `<code title="${esc(sourcesById.get(s).title_tr)}">${esc(s)}</code>`;
    if (/(^id$|_id$|^slug$|^key$|_key$|^code$|_code$|sha256|^entity)/.test(col)) return `<code>${esc(s)}</code>`;
    if (s.length > LONG) return `<div class="clamp">${esc(s)}</div><button type="button" class="more">devamını göster</button>`;
    return esc(s);
  }

  function tableBlock(name, rows, { id } = {}) {
    const cols = D.tables[name];
    const head = `<div class="dbtable-head">
        <h3>${esc(name)}</h3>
        <span class="meta">${fmt(rows.length)} satır · ${cols.length} sütun</span>
        ${TABLE_NOTES[name] ? `<span class="note">${esc(TABLE_NOTES[name])}</span>` : ""}
      </div>`;
    let body;
    if (rows.length === 0) {
      body = `<div class="empty-table">0 satır: bu tabloda kayıt yok.<span class="cols">${cols.map(esc).join(" · ")}</span></div>`;
    } else if (rows.length === 1 && cols.length > 12) {
      const r = rows[0];
      body = `<div class="table-wrap"><table class="kv"><tbody>${cols.map((c) => `${ASSET_GROUPS[c] && name === "asset"
        ? `<tr class="group"><th colspan="2">${esc(ASSET_GROUPS[c])}</th></tr>` : ""}<tr><th scope="row">${esc(c)}</th><td>${cell(r[c], c, name)}</td></tr>`).join("")}</tbody></table></div>`;
    } else {
      body = `<div class="table-wrap"><table>
          <thead><tr><th class="idx">#</th>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((r, i) => `<tr><td class="idx">${i + 1}</td>${cols.map((c) => `<td>${cell(r[c], c, name)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div>`;
    }
    return `<section class="dbtable" id="${esc(id || "t-" + name)}" aria-label="${esc(name)} tablosu">${head}${body}</section>`;
  }

  function tocBlock(names, rowsOf) {
    return `<nav class="toc" aria-label="Tablolar">${names.map((n) => {
      const c = rowsOf(n).length;
      return `<button type="button" data-jump="t-${esc(n)}" class="${c ? "" : "zero"}">${esc(n)}<span class="n">${c}</span></button>`;
    }).join("")}</nav>`;
  }

  // ───────────────────────────── görseller
  function imagesOf(asset) {
    const R = asset.rows;
    const mediaByRef = new Map(R.media.map((m) => [m.id.$media, m]));
    return [...R.asset_media]
      .sort((a, b) => (b.is_cover - a.is_cover) || (a.sort_order - b.sort_order))
      .map((am) => {
        const ref = am.media_id.$media;
        const m = mediaByRef.get(ref);
        const variants = R.media_variant.filter((v) => v.media_id.$media === ref);
        const webp = variants.filter((v) => v.format === "webp").sort((a, b) => a.width - b.width);
        const pick = (max) => (webp.filter((v) => v.width <= max).pop() || webp[0]);
        const drive = m.source_provider === "google_drive" && m.source_ref
          ? (w) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(m.source_ref)}&sz=w${w}` : null;
        return {
          am, m,
          thumb: pick(480) && MEDIA_BASE + pick(480).key,
          srcset: webp.map((v) => `${MEDIA_BASE}${v.key} ${v.width}w`).join(", "),
          large: pick(2560) && MEDIA_BASE + pick(2560).key,
          drive,
        };
      });
  }

  // Yerel dosya yoksa (media_pipeline çalıştırılmamışsa) Drive önizlemesine, o da olmazsa LQIP'e düş
  function attachFallback(img, item, width) {
    img.addEventListener("error", () => {
      const stage = Number(img.dataset.fb || 0);
      img.removeAttribute("srcset");
      if (stage === 0 && item.drive) { img.dataset.fb = "1"; img.src = item.drive(width); }
      else if (stage < 2 && item.m.lqip) { img.dataset.fb = "2"; img.src = item.m.lqip; }
    });
  }

  function galleryBlock(items) {
    if (!items.length) return "";
    return `<div class="gallery">${items.map((it, i) => {
      const fx = it.am.focal_x ?? 0.5, fy = it.am.focal_y ?? 0.5;
      return `<button type="button" class="shot${it.am.is_cover ? " cover" : ""}" data-shot="${i}"
          style="background:${esc(it.m.dominant_color || "")}" aria-label="${esc(it.am.caption_tr)} (büyüt)">
          <img src="${esc(it.thumb || "")}" srcset="${esc(it.srcset)}" sizes="${it.am.is_cover ? "(max-width: 860px) 100vw, 40vw" : "(max-width: 860px) 50vw, 200px"}"
               alt="${esc(it.am.alt_tr)}" loading="lazy" decoding="async" style="object-position:${fx * 100}% ${fy * 100}%">
          <span class="tag${it.am.is_cover ? " cover-tag" : ""}">${esc(it.am.media_key)}${it.am.is_cover ? " · kapak" : ""}</span>
        </button>`;
    }).join("")}</div>`;
  }

  // ───────────────────────────── lightbox
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  let lbItems = [], lbIndex = 0;
  function showShot(i) {
    lbIndex = (i + lbItems.length) % lbItems.length;
    const it = lbItems[lbIndex];
    lbImg.dataset.fb = "0";
    lbImg.src = it.large || "";
    lbImg.alt = it.am.alt_tr;
    document.getElementById("lb-cap").innerHTML = `<strong>${esc(it.am.caption_tr)}</strong>
      <dl>
        <dt>alt_tr</dt><dd>${esc(it.am.alt_tr)}</dd>
        <dt>credit</dt><dd>${esc(it.m.credit)}${it.m.photographer ? " · " + esc(it.m.photographer) : ""}</dd>
        <dt>boyut</dt><dd>${fmt(it.m.width)} × ${fmt(it.m.height)} px · orijinal ${fmt(Math.round(it.m.original_bytes / 1024))} KB</dd>
        <dt>kaynak</dt><dd><code>${esc(it.m.source_provider)}</code> · <code>${esc(it.m.source_ref || "")}</code></dd>
      </dl>`;
    document.getElementById("lb-count").textContent = `${lbIndex + 1} / ${lbItems.length} · ${it.am.media_key}`;
  }
  attachFallback(lbImg, { get drive() { return lbItems[lbIndex]?.drive; }, get m() { return lbItems[lbIndex]?.m || {}; } }, 1600);
  lb.addEventListener("click", (e) => {
    const act = e.target.closest("[data-lb]")?.dataset.lb;
    if (act === "prev") showShot(lbIndex - 1);
    else if (act === "next") showShot(lbIndex + 1);
    else if (act === "close" || e.target === lb) lb.close();
  });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") showShot(lbIndex - 1);
    if (e.key === "ArrowRight") showShot(lbIndex + 1);
  });
  lb.addEventListener("close", () => lenis?.start());

  // ───────────────────────────── sayfalar
  function renderHome() {
    const byCity = groupAssets(D.assets);
    const districts = new Set(D.assets.map((a) => a.city + "/" + a.district));
    const images = D.assets.reduce((n, a) => n + a.rows.asset_media.length, 0);
    const allTables = [...D.shared_tables, ...D.asset_tables];
    const totals = Object.fromEntries(allTables.map((t) => [t, D.shared_tables.includes(t)
      ? D.shared[t].length : D.assets.reduce((n, a) => n + a.rows[t].length, 0)]));
    const totalRows = Object.values(totals).reduce((a, b) => a + b, 0);

    main.innerHTML = `
      <p class="eyebrow">Veri seti · ${esc(new Date(D.generated_at).toLocaleString("tr-TR"))} itibarıyla</p>
      <h1>Elimizdeki veri</h1>
      <p class="lede">İçe aktarma çalıştırıldığında veritabanına yazılacak satırların tamamı. Tablolar ve sütunlar README'deki şemayla aynıdır; hiçbir alan gizlenmez.</p>
      <div class="stats">
        <div class="stat"><div class="v">${fmt(D.assets.length)}</div><div class="l">eser</div></div>
        <div class="stat"><div class="v">${fmt(byCity.size)}</div><div class="l">il</div></div>
        <div class="stat"><div class="v">${fmt(districts.size)}</div><div class="l">ilçe</div></div>
        <div class="stat"><div class="v">${fmt(images)}</div><div class="l">görsel</div></div>
        <div class="stat"><div class="v">${fmt(totalRows)}</div><div class="l">DB satırı · ${allTables.length} tablo</div></div>
      </div>

      <h2>Şehirler</h2>
      <div class="cities">${[...byCity].map(([city, dists]) => {
        const count = [...dists.values()].reduce((n, l) => n + l.length, 0);
        return `<article class="city-card">
          <h3>${esc(cityLabel(city))}</h3>
          <p class="sub">${count} eser · ${dists.size} ilçe</p>
          ${[...dists].map(([d, list]) => `<h4>${esc(d)}</h4><ul>${list.map((a) =>
            `<li><a href="${route("eser/" + esc(a.id))}"><span class="dot ${esc(a.status)}" title="${esc(a.status)}"></span>${esc(a.name)}</a></li>`).join("")}</ul>`).join("")}
        </article>`;
      }).join("")}
      ${D.shared.city.filter((c) => !byCity.has(c.code)).map((c) =>
        `<article class="city-card"><h3>${esc(c.label_tr)}</h3><p class="sub soon">Henüz eser yok</p></article>`).join("")}
      </div>

      <h2>Tablo başına satır sayısı</h2>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">tablo</th><th scope="col">satır</th><th scope="col">sütun</th><th scope="col">açıklama</th></tr></thead>
        <tbody>${allTables.map((t) => `<tr><td><code>${esc(t)}</code></td><td><span class="num">${fmt(totals[t])}</span></td>
          <td><span class="num">${D.tables[t].length}</span></td><td>${esc(TABLE_NOTES[t] || "")}</td></tr>`).join("")}</tbody>
      </table></div>`;
    setPage("home", "Genel bakış");
  }

  function renderShared() {
    main.innerHTML = `
      <p class="eyebrow"><a href="${route("")}">Genel bakış</a> / Ortak tablolar</p>
      <h1>Ortak tablolar</h1>
      <p class="lede">Bütün eserlerin başvurduğu sabit listeler (<code>enums.json</code>) ve kaynaklar (<code>sources.json</code>).</p>
      ${tocBlock(D.shared_tables, (n) => D.shared[n])}
      ${D.shared_tables.map((t) => tableBlock(t, D.shared[t])).join("")}`;
    setPage("ortak", "Ortak tablolar");
  }

  function renderAsset(id) {
    const a = assetsById.get(id);
    if (!a) {
      main.innerHTML = `<h1>Eser bulunamadı</h1><p class="lede"><code>${esc(id)}</code> veri setinde yok. <a href="${route("")}">Genel bakışa dön</a></p>`;
      setPage(null, "Bulunamadı");
      return;
    }
    const r = a.rows.asset[0];
    const items = imagesOf(a);
    const typeLabel = D.shared.asset_type.find((t) => t.code === r.type_code)?.label_tr || r.type_code;
    main.innerHTML = `
      <p class="eyebrow"><a href="${route("")}">Genel bakış</a> / ${esc(a.city_label)} / ${esc(a.district)}</p>
      <h1>${esc(r.name_tr)}</h1>
      ${r.subtitle_tr ? `<p class="subtitle">${esc(r.subtitle_tr)}</p>` : ""}
      <ul class="chips">
        <li class="chip"><span class="k">id</span><code>${esc(r.id)}</code></li>
        <li class="chip"><span class="k">durum</span><span class="badge ${esc(r.status)}">${esc(r.status)}</span></li>
        <li class="chip"><span class="k">tür</span>${esc(typeLabel)}</li>
        <li class="chip"><span class="k">konum</span>${esc(a.city_label)} · ${esc(r.district)}${r.neighborhood ? " · " + esc(r.neighborhood) : ""}</li>
        <li class="chip"><span class="k">koordinat</span><code>${r.lat}, ${r.lng}</code> ${r.coord_verified ? "✓" : "(doğrulanmadı)"}</li>
      </ul>
      ${a.warning ? `<p class="warning" role="alert">${esc(a.warning)}</p>` : ""}
      ${galleryBlock(items)}
      ${tocBlock(D.asset_tables, (n) => a.rows[n])}
      ${D.asset_tables.map((t) => tableBlock(t, a.rows[t])).join("")}`;

    main.querySelectorAll(".gallery img").forEach((img, i) => attachFallback(img, items[i], 480));
    main.querySelectorAll("[data-shot]").forEach((btn) => btn.addEventListener("click", () => {
      lbItems = items; showShot(Number(btn.dataset.shot)); lenis?.stop(); lb.showModal();
    }));
    setPage("eser/" + id, r.name_tr);
  }

  function setPage(key, title) {
    document.title = `${title} · Vakıf Eserleri · Veri`;
    document.querySelectorAll("[aria-current]").forEach((el) => el.removeAttribute("aria-current"));
    if (key === "home" || key === "ortak") document.querySelector(`[data-route="${key}"]`)?.setAttribute("aria-current", "page");
    if (key?.startsWith("eser/")) {
      const link = document.querySelector(`.tree a[data-id="${CSS.escape(key.slice(5))}"]`);
      if (link) { link.setAttribute("aria-current", "page"); link.closest("details.city")?.setAttribute("open", ""); link.closest("details.district")?.setAttribute("open", ""); }
    }
    closeSidebar();
    scrollToTop();
    main.focus({ preventScroll: true });
  }

  // Tablo atlama, "devamını göster" (sayfa içi tüm etkileşimler tek dinleyicide)
  main.addEventListener("click", (e) => {
    const jump = e.target.closest("[data-jump]");
    if (jump) { const el = document.getElementById(jump.dataset.jump); if (el) scrollToEl(el); return; }
    const more = e.target.closest(".more");
    if (more) {
      const box = more.previousElementSibling;
      const open = box.classList.toggle("open");
      more.textContent = open ? "daralt" : "devamını göster";
      lenis?.resize();
    }
  });
  main.addEventListener("toggle", () => lenis?.resize(), true);

  // ───────────────────────────── kenar çubuğu ağacı
  function cityLabel(code) {
    return D.shared.city.find((c) => c.code === code)?.label_tr || code;
  }
  function groupAssets(list) {
    const byCity = new Map();
    [...list].sort((a, b) => a.city_label.localeCompare(b.city_label, "tr") || a.district.localeCompare(b.district, "tr")
      || a.name.localeCompare(b.name, "tr")).forEach((a) => {
      if (!byCity.has(a.city)) byCity.set(a.city, new Map());
      const d = byCity.get(a.city);
      if (!d.has(a.district)) d.set(a.district, []);
      d.get(a.district).push(a);
    });
    return byCity;
  }
  function renderTree(query = "") {
    const q = lower(query.trim());
    const list = q ? D.assets.filter((a) => [a.name, a.id, a.district, a.city_label].some((s) => lower(s).includes(q))) : D.assets;
    const byCity = groupAssets(list);
    const tree = document.getElementById("tree");
    if (!byCity.size) { tree.innerHTML = `<p class="empty">“${esc(query)}” için eser yok.</p>`; return; }
    tree.innerHTML = [...byCity].map(([city, dists]) => {
      const count = [...dists.values()].reduce((n, l) => n + l.length, 0);
      return `<details class="city" open><summary>${esc(cityLabel(city))}<span class="count">${count}</span></summary>
        ${[...dists].map(([d, items]) => `<details class="district" open><summary>${esc(d)}<span class="count">${items.length}</span></summary>
          <ul>${items.map((a) => `<li><a href="${route("eser/" + esc(a.id))}" data-id="${esc(a.id)}">
            <span class="dot ${esc(a.status)}" title="${esc(a.status)}"></span>${esc(a.name)}</a></li>`).join("")}</ul>
        </details>`).join("")}
      </details>`;
    }).join("");
    const current = location.hash.match(/^#\/eser\/(.+)$/);
    if (current) document.querySelector(`.tree a[data-id="${CSS.escape(decodeURIComponent(current[1]))}"]`)?.setAttribute("aria-current", "page");
  }
  document.getElementById("q").addEventListener("input", (e) => renderTree(e.target.value));

  // Telefonda kenar çubuğu çekmece olarak açılır
  const sidebar = document.getElementById("sidebar");
  const scrim = document.querySelector(".scrim");
  const toggle = document.querySelector(".nav-toggle");
  function closeSidebar() {
    sidebar.classList.remove("open"); scrim.hidden = true; toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    scrim.hidden = !open; toggle.setAttribute("aria-expanded", String(open));
    if (open) document.getElementById("q").focus();
  });
  scrim.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sidebar.classList.contains("open")) closeSidebar(); });

  // ───────────────────────────── yönlendirme (#/, #/ortak, #/eser/<id>)
  function router() {
    const h = location.hash;
    if (h && !h.startsWith("#/")) return; // sayfa içi çapa (#main vb.): sayfayı değiştirme
    const m = h.match(/^#\/eser\/(.+)$/);
    if (m) renderAsset(decodeURIComponent(m[1]));
    else if (h === "#/ortak") renderShared();
    else renderHome();
  }
  window.addEventListener("hashchange", router);

  const totalImgs = D.assets.reduce((n, a) => n + a.rows.asset_media.length, 0);
  document.getElementById("meta").textContent = `${D.assets.length} eser · ${totalImgs} görsel`;
  renderTree();
  router();
})();
