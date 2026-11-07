/**
 * The journal's stickers: drawn here as vector paths on a 100 by 100 square, so they weigh nothing in the
 * app, are sharp at any size and need no download. A page saves only a sticker's id.
 *
 * Faces are for the animals and the food. The buildings have none: a mosque or a tomb with a smiling
 * face would not be taken kindly, and they are sweet enough round. The inscription's lines are only
 * waves, not letters: no made-up writing that looks like Ottoman script.
 */

export interface StickerShape {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fillRule?: "evenodd";
  /** Part of the sticker's outline: the white paper edge is cut round these. */
  edge: boolean;
}

export const STICKER_IDS = [
  "mosque",
  "tomb",
  "bridge",
  "fountain",
  "caravanserai",
  "bath",
  "inscription",
  "deed",
  "tile",
  "tulip",
  "pomegranate",
  "lamp",
  "seal",
  "key",
  "pin",
  "cat",
  "pigeon",
  "camel",
  "tea",
  "simit",
] as const;
export type StickerId = (typeof STICKER_IDS)[number];

/** How the drawer shows them, in this order. */
export const STICKER_GROUPS = {
  sites: ["mosque", "tomb", "bridge", "fountain", "caravanserai", "bath", "inscription", "deed"],
  motifs: ["tile", "tulip", "pomegranate", "lamp", "seal", "key", "pin"],
  friends: ["cat", "pigeon", "camel", "tea", "simit"],
} as const satisfies Record<string, readonly StickerId[]>;

const INK = "#3A2B27";
const LINE = 2.4;

const STONE = "#F3E6CC";
const STONE_DARK = "#D9C49C";
const SAND = "#E7BE82";
const TURQUOISE = "#3FB8AF";
const TURQUOISE_LIGHT = "#8ADAD0";
const COBALT = "#2B5FA8";
const EMERALD = "#1F7A5C";
const GOLD = "#F0B83F";
const TERRACOTTA = "#D9764A";
const RED = "#D8433F";
const PINK = "#F49AA0";
const WATER = "#7CC8EE";
const WOOD = "#8A5A3C";
const WHITE = "#FFFDF6";

const body = (d: string, fill: string, strokeWidth = LINE): StickerShape => ({ d, fill, stroke: INK, strokeWidth, edge: true });
const detail = (d: string, fill: string): StickerShape => ({ d, fill, edge: false });
const line = (d: string, stroke: string = INK, strokeWidth = LINE): StickerShape => ({ d, stroke, strokeWidth, edge: false });
/** A line that stands free of the sticker, as steam does: the paper edge goes round it too. */
const freeLine = (d: string, stroke: string, strokeWidth = LINE): StickerShape => ({ d, stroke, strokeWidth, edge: true });

const dot = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
const oval = (x: number, y: number, rx: number, ry: number) => `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
const box = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`;
/** A window or a door: straight sides and a round head, standing on `bottom`. */
const arch = (x: number, bottom: number, w: number, h: number) => `M${x} ${bottom}V${bottom - h + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${bottom}Z`;

function star(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const corners = Array.from({ length: points * 2 }, (_unused, at) => {
    const radius = at % 2 === 0 ? outer : inner;
    const angle = (Math.PI * at) / points - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${corners.join("L")}Z`;
}

/** A round edge in small bumps, as a rosette or a pressed seal has. */
function scallop(cx: number, cy: number, radius: number, bumps: number): string {
  const step = (Math.PI * 2) / bumps;
  const bump = radius * Math.sin(step / 2) * 1.05;
  const at = (i: number) => `${(cx + radius * Math.cos(i * step)).toFixed(1)} ${(cy + radius * Math.sin(i * step)).toFixed(1)}`;
  const arcs = Array.from({ length: bumps }, (_unused, i) => `A${bump.toFixed(1)} ${bump.toFixed(1)} 0 0 1 ${at(i + 1)}`);
  return `M${at(0)}${arcs.join("")}Z`;
}

/** Two eyes with a shine, a small smile and pink cheeks, centred on `x`. */
function face(x: number, y: number, apart = 8, size = 1): StickerShape[] {
  const eye = 2.1 * size;
  return [
    detail(dot(x - apart, y, eye), INK),
    detail(dot(x + apart, y, eye), INK),
    detail(dot(x - apart + 0.7 * size, y - 0.8 * size, 0.7 * size), WHITE),
    detail(dot(x + apart + 0.7 * size, y - 0.8 * size, 0.7 * size), WHITE),
    detail(oval(x - apart - 3.6 * size, y + 4 * size, 2.8 * size, 1.8 * size), PINK),
    detail(oval(x + apart + 3.6 * size, y + 4 * size, 2.8 * size, 1.8 * size), PINK),
    line(`M${x - 2.6 * size} ${y + 2.8 * size}q${2.6 * size} ${2.8 * size} ${5.2 * size} 0`, INK, 1.8),
  ];
}

const ART: ReadonlyMap<StickerId, readonly StickerShape[]> = new Map<StickerId, readonly StickerShape[]>([
  [
    "mosque",
    [
      // Minarets either side, the great dome and two small ones, on a stone step.
      body(box(10, 34, 9, 52), WHITE),
      body("M9 34L14.5 13L20 34Z", TURQUOISE),
      body(box(8, 44, 13, 3.6), STONE_DARK, 2),
      body(box(81, 34, 9, 52), WHITE),
      body("M80 34L85.5 13L91 34Z", TURQUOISE),
      body(box(79, 44, 13, 3.6), STONE_DARK, 2),
      line("M50 27V17", INK, 2.6),
      detail(dot(50, 15, 2.8), GOLD),
      body(box(19, 56, 62, 30), STONE),
      body("M21 56a10.5 10.5 0 0 1 21 0Z", TURQUOISE_LIGHT),
      body("M58 56a10.5 10.5 0 0 1 21 0Z", TURQUOISE_LIGHT),
      body("M31 56a19 29 0 0 1 38 0Z", TURQUOISE),
      detail("M38 49c1-7 5-13 9-15c-2 5-3 10-3 15Z", TURQUOISE_LIGHT),
      body(arch(42, 86, 16, 22), EMERALD),
      body(arch(26, 76, 8, 12), COBALT, 2),
      body(arch(66, 76, 8, 12), COBALT, 2),
      body("M6 86H94V90a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z", STONE_DARK),
    ],
  ],
  [
    "tomb",
    [
      // A Seljuk kümbet: a pointed roof on a many-sided drum.
      body("M26 44L50 9L74 44Z", TURQUOISE),
      line("M42 42L50 16", TURQUOISE_LIGHT, 3),
      body("M28 44H72V84H28Z", SAND),
      line("M40 44V84M60 44V84", WOOD, 1.8),
      body("M23 42H77V49H23Z", STONE),
      detail(star(34, 57, 3.6, 1.6, 8), WOOD),
      detail(star(66, 57, 3.6, 1.6, 8), WOOD),
      body(arch(42, 84, 16, 28), EMERALD),
      detail(star(50, 69, 4, 1.8, 8), GOLD),
      body("M16 84H84V89a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3Z", STONE_DARK),
    ],
  ],
  [
    "bridge",
    [
      body("M10 72H90Q95 90 82 90H18Q5 90 10 72Z", WATER),
      line("M19 82q5 3.4 10 0t10 0", WHITE, 2.4),
      line("M57 84q5 3.4 10 0t10 0", WHITE, 2.4),
      // One great arch, higher in the middle, as the old stone bridges are.
      body("M6 62Q50 16 94 62V77H78A28 28 0 0 0 22 77H6Z", SAND),
      line("M9.5 59Q50 22 90.5 59", WOOD, 1.8),
      line("M50 49V37M36 53L32 41M64 53L68 41M25 60L18 51M75 60L82 51", WOOD, 1.8),
      body("M45 37H55L53 49H47Z", GOLD, 2),
    ],
  ],
  [
    "fountain",
    [
      body("M20 76V36Q20 22 50 9Q80 22 80 36V76Z", STONE),
      body("M31 66V41Q31 31 50 22Q69 31 69 41V66Z", TURQUOISE),
      detail(star(50, 37, 6, 2.6, 8), GOLD),
      body(box(45.5, 47, 9, 6), GOLD, 2),
      body("M50 55c-3.6 4.6-5 7-5 9a5 5 0 0 0 10 0c0-2-1.4-4.4-5-9Z", WATER, 2),
      body("M13 69H87V78Q87 92 73 92H27Q13 92 13 78Z", STONE_DARK),
      line("M24 79q4.5 3 9 0t9 0t9 0t9 0t9 0", WATER, 2.6),
    ],
  ],
  [
    "caravanserai",
    [
      // A carved Seljuk gate, taller than the walls, with its star above the door.
      body("M6 90V52H18V47H26V52H74V47H82V52H94V90Z", STONE_DARK),
      body("M22 90V15H78V90Z", SAND),
      body("M29 90V22H71V90Z", STONE),
      body("M36 90V52Q36 40 50 30Q64 40 64 52V90Z", TERRACOTTA),
      body("M42 90V57Q42 49 50 43Q58 49 58 57V90Z", WOOD),
      line("M50 44V90", INK, 1.8),
      detail(dot(46.5, 70, 1.4), GOLD),
      detail(dot(53.5, 70, 1.4), GOLD),
      detail(star(36, 30, 4.4, 1.9, 8), COBALT),
      detail(star(64, 30, 4.4, 1.9, 8), COBALT),
    ],
  ],
  [
    "bath",
    [
      freeLine("M36 21q-5-4 0-8t0-8", WATER, 3.4),
      freeLine("M64 21q-5-4 0-8t0-8", WATER, 3.4),
      freeLine("M50 18q-5-4 0-8t0-8", WATER, 3.4),
      // The dome's small round skylights are what a hamam is known by.
      body("M12 70a38 42 0 0 1 76 0Z", STONE),
      ...[
        [50, 38],
        [36, 44],
        [64, 44],
        [26, 56],
        [50, 54],
        [74, 56],
        [38, 60],
        [62, 60],
      ].map(([x, y]) => body(dot(x!, y!, 3.2), TURQUOISE_LIGHT, 1.8)),
      body(box(8, 70, 84, 20), TERRACOTTA),
      body(arch(42, 90, 16, 16), WOOD, 2),
      body(arch(19, 86, 9, 11), COBALT, 2),
      body(arch(72, 86, 9, 11), COBALT, 2),
    ],
  ],
  [
    "inscription",
    [
      body("M12 30Q12 12 30 12H70Q88 12 88 30V84Q88 89 83 89H17Q12 89 12 84Z", STONE_DARK),
      line("M20 32Q20 20 32 20H68Q80 20 80 32V81H20Z", WOOD, 1.8),
      // Only waves: the feel of an inscription, without made-up letters.
      line("M28 37q5-7 10 0t10 0t10 0t10 0t5-2", EMERALD, 3.2),
      line("M28 51q5 7 10 0t10 0t10 0t10 0t5 2", EMERALD, 3.2),
      line("M28 65q5-7 10 0t10 0t10 0t10 0t5-2", EMERALD, 3.2),
      detail(star(50, 74.5, 3.4, 1.5, 8), GOLD),
    ],
  ],
  [
    "deed",
    [
      // A foundation's deed: a scroll, with its red seal.
      body("M24 14H78Q70 18 70 26V78Q70 88 60 88H16Q24 84 24 76Z", STONE),
      body("M72 12a7 7 0 0 1 7 7v3H66V19a7 7 0 0 1 6-7Z", STONE_DARK, 2),
      body("M9 76H26V81a7 7 0 0 1-7 7H16a7 7 0 0 1-7-7Z", STONE_DARK, 2),
      line("M33 28H61M33 38H61M33 48H61M33 58H48", WOOD, 2.4),
      body(scallop(57, 68, 9.5, 12), RED, 2),
      detail(star(57, 68, 5, 2.2, 8), GOLD),
    ],
  ],
  [
    "tile",
    [
      body("M15 8H85Q92 8 92 15V85Q92 92 85 92H15Q8 92 8 85V15Q8 8 15 8Z", WHITE),
      detail("M8 28V15Q8 8 15 8H28Q28 28 8 28ZM72 8H85Q92 8 92 15V28Q72 28 72 8ZM8 72Q28 72 28 92H15Q8 92 8 85ZM72 92Q72 72 92 72V85Q92 92 85 92Z", TURQUOISE),
      body(star(50, 50, 37, 25, 8), COBALT),
      detail(star(50, 50, 22, 12, 8), TURQUOISE_LIGHT),
      detail(dot(50, 50, 7.5), RED),
      detail(dot(50, 50, 3), GOLD),
      line("M15 8H85Q92 8 92 15V85Q92 92 85 92H15Q8 92 8 85V15Q8 8 15 8Z"),
    ],
  ],
  [
    "tulip",
    [
      freeLine("M50 56V92", EMERALD, 4.2),
      body("M50 88C33 84 24 72 17 52C34 55 46 66 50 88Z", EMERALD),
      body("M50 92C65 88 76 77 83 58C66 61 54 72 50 92Z", EMERALD),
      // The long İznik tulip, its petals ending in points.
      body("M50 62C30 62 22 40 27 12C33 18 37 24 39 30C42 21 45 14 50 8C55 14 58 21 61 30C63 24 67 18 73 12C78 40 70 62 50 62Z", RED),
      line("M50 54C43 44 41 34 42 26M50 54C57 44 59 34 58 26", "#A82A2E", 2),
      detail(oval(35, 40, 2.6, 8), PINK),
    ],
  ],
  [
    "pomegranate",
    [
      body("M41 22L37 8L45 13L50 6L55 13L63 8L59 22Z", "#B8322F"),
      body("M50 18C72 18 88 34 88 55C88 77 71 92 50 92C29 92 12 77 12 55C12 34 28 18 50 18Z", RED),
      detail("M21 44C24 35 30 29 38 27C33 33 28 40 26 48C25 51 20 48 21 44Z", PINK),
      ...face(50, 50, 11, 1.25),
      ...[
        [30, 73],
        [41, 79],
        [59, 79],
        [70, 73],
        [50, 71],
      ].map(([x, y]) => detail(oval(x!, y!, 2.2, 3), "#FBE2C9")),
    ],
  ],
  [
    "lamp",
    [
      // A mosque lamp hanging on three chains.
      freeLine("M50 6V22", INK, 2.6),
      freeLine("M50 22L30 42M50 22L70 42M50 22V42", INK, 2.2),
      body("M26 42H74L70 46Q74 58 66 72Q60 83 50 83Q40 83 34 72Q26 58 30 46Z", TURQUOISE_LIGHT),
      body("M50 49C58 58 60 63 60 67A10 10 0 0 1 40 67C40 63 42 58 50 49Z", GOLD),
      detail("M50 58C54 63 55 65 55 68A5 5 0 0 1 45 68C45 65 46 63 50 58Z", RED),
      line("M34 53Q50 57 66 53", COBALT, 2),
      body(dot(50, 87, 4), GOLD, 2),
    ],
  ],
  [
    "seal",
    [
      body("M32 58L18 90L33 84L42 94L52 66Z", RED),
      body("M68 58L82 90L67 84L58 94L48 66Z", RED),
      body(scallop(50, 42, 33, 16), EMERALD),
      body(dot(50, 42, 24), GOLD, 2),
      detail(star(50, 42, 19, 9, 8), EMERALD),
      detail(dot(50, 42, 6), GOLD),
    ],
  ],
  [
    "key",
    [
      { ...body(`${dot(50, 25, 18)}${dot(50, 25, 9)}`, GOLD), fillRule: "evenodd" },
      body("M45 43H55V92H45Z", GOLD),
      body("M55 72H70V79H63V85H55Z", GOLD),
      body("M42 43H58V49H42Z", "#C98F22", 2),
      detail(oval(47.5, 66, 1, 11), "#FBE3A6"),
    ],
  ],
  [
    "pin",
    [
      body("M50 91C38 71 19 58 19 37A31 31 0 0 1 81 37C81 58 62 71 50 91Z", EMERALD),
      body(dot(50, 37, 21), STONE, 2),
      // A little dome on the map.
      body("M36 47H64V50H36Z", STONE_DARK, 1.8),
      body("M38 47a12 13 0 0 1 24 0Z", TURQUOISE, 2),
      line("M50 34V27", INK, 2),
      detail(dot(50, 26, 1.8), GOLD),
    ],
  ],
  [
    "cat",
    [
      // A site's cat: there is one at every old mosque.
      freeLine("M71 83C89 83 91 68 83 59", INK, 10),
      freeLine("M71 83C89 83 91 68 83 59", TERRACOTTA, 5.6),
      body("M26 91C22 68 32 54 50 54C68 54 78 68 74 91Z", "#E9974F"),
      line("M42 91V79M58 91V79", INK, 2),
      detail("M37 64L47 67L37 70ZM63 64L53 67L63 70Z", TERRACOTTA),
      body("M21 15L37 25A25 23 0 0 1 63 25L79 15L78 39A28 23 0 1 1 22 39Z", "#E9974F"),
      detail("M26 22L34 27L27 31Z", PINK),
      detail("M74 22L66 27L73 31Z", PINK),
      line("M50 20V28M42 21L44 28M58 21L56 28", TERRACOTTA, 2.8),
      detail(dot(39, 43, 2.5), INK),
      detail(dot(61, 43, 2.5), INK),
      detail(dot(40, 42, 0.8), WHITE),
      detail(dot(62, 42, 0.8), WHITE),
      detail("M47.5 48H52.5L50 50.8Z", "#C9555C"),
      line("M50 51q-2.6 3.4-5.5 1M50 51q2.6 3.4 5.5 1", INK, 1.7),
      line("M31 49L20 47M31 53L21 55M69 49L80 47M69 53L79 55", INK, 1.4),
      detail(oval(32, 56, 3, 1.8), PINK),
      detail(oval(68, 56, 3, 1.8), PINK),
    ],
  ],
  [
    "pigeon",
    [
      freeLine("M43 82V91M43 91L37 93M43 91L49 93M56 82V91M56 91L50 93M56 91L62 93", TERRACOTTA, 2.8),
      body("M92 54L74 42L66 66Z", "#6F7F96"),
      body("M18 52C18 72 35 86 52 84C70 82 80 64 74 48C68 34 48 34 38 40C28 44 18 42 18 52Z", "#B9C6D6"),
      body("M36 58C47 44 64 44 73 52C71 66 56 74 45 70C40 68 36 64 36 58Z", "#8E9DB2"),
      line("M47 57Q55 53 64 56M49 63Q56 60 63 62", "#5F6E84", 1.8),
      body("M13 28C13 15 42 10 44 29C45 37 41 46 32 48C21 49 13 40 13 28Z", "#7C8DA6"),
      detail("M18 44C24 50 38 50 42 40C40 47 34 52 30 53C24 53 20 49 18 44Z", TURQUOISE),
      body("M15 26L5 31L15 34Z", GOLD, 2),
      detail(dot(26, 26, 2.8), INK),
      detail(dot(27, 25, 0.9), WHITE),
      detail(oval(23, 35, 2.6, 1.7), PINK),
    ],
  ],
  [
    "camel",
    [
      // One of a caravan: its rug has the red of a kilim.
      body("M26 62V90H34V70Z", "#C99A63"),
      body("M36 66V90H44V70Z", "#D9AE78"),
      body("M56 68V90H64V66Z", "#C99A63"),
      body("M65 64V90H73V60Z", "#D9AE78"),
      body("M14 58C14 48 26 46 30 46C34 28 50 28 54 46C58 46 63 47 66 49C70 44 73 34 72 26C71 20 78 11 86 15C94 17 96 26 92 30C88 33 84 32 83 35C82 46 80 62 72 68C62 76 26 76 19 70C15 67 14 62 14 58Z", "#E7BE82"),
      freeLine("M15 56C10 60 9 67 11 72", WOOD, 3),
      body("M26 47C31 30 53 30 57 47L60 58H24Z", RED),
      line("M28 52H58", GOLD, 2.6),
      detail(star(42, 42, 4, 1.8, 8), GOLD),
      detail(dot(83, 22, 2.3), INK),
      detail(dot(83.8, 21.2, 0.8), WHITE),
      detail(oval(86, 30, 2.8, 1.7), PINK),
      line("M90 25q-1.8 2.4-4 1.2", INK, 1.7),
      line("M77 12L74 7", INK, 2.6),
    ],
  ],
  [
    "tea",
    [
      freeLine("M42 19q-4.5-3.5 0-7t0-7", "#C7CDD1", 3.2),
      freeLine("M58 19q-4.5-3.5 0-7t0-7", "#C7CDD1", 3.2),
      body("M9 79H91Q90 90 76 91H24Q10 90 9 79Z", TURQUOISE),
      line("M18 84H82", WHITE, 2.2),
      // The tulip-waisted glass: red tea in its belly, a little left for the air.
      body("M30 24H70Q70 40 62 50Q72 62 66 79H34Q28 62 38 50Q30 40 30 24Z", "#F5FBFA"),
      detail("M33.5 34H66.5Q65 43 60 50Q69 62 64 77H36Q31 62 40 50Q35 43 33.5 34Z", "#B8452A"),
      detail("M38 38C39 43 41 46 43 50C39 54 37 58 37 64C36 57 36 53 39 49C37 46 37 42 38 38Z", "#E08258"),
      line("M30 24H70Q70 40 62 50Q72 62 66 79H34Q28 62 38 50Q30 40 30 24Z"),
      detail(dot(43, 58, 2.3), "#2B1A16"),
      detail(dot(57, 58, 2.3), "#2B1A16"),
      detail(dot(43.8, 57.2, 0.8), WHITE),
      detail(dot(57.8, 57.2, 0.8), WHITE),
      line("M47 62q3 3.2 6 0", "#2B1A16", 1.8),
      detail(oval(38.5, 64, 2.6, 1.7), PINK),
      detail(oval(61.5, 64, 2.6, 1.7), PINK),
    ],
  ],
  [
    "simit",
    [
      { ...body(`${dot(50, 50, 41)}${dot(50, 50, 16)}`, "#C9803B"), fillRule: "evenodd" },
      line("M17 39C21 29 28 22 36 18M28 55C32 61 37 66 44 69M71 22C78 28 82 35 84 43M77 66C72 72 66 77 58 80", "#8F5121", 2.4),
      ...[
        [29, 25],
        [46, 17],
        [64, 21],
        [78, 34],
        [82, 56],
        [72, 72],
        [52, 83],
        [32, 77],
        [18, 62],
        [15, 46],
        [30, 44],
        [68, 50],
        [40, 66],
        [60, 28],
      ].map(([x, y]) => detail(oval(x!, y!, 1.5, 2.2), "#FBEBC8")),
    ],
  ],
]);

/** A sticker's drawing; null for one this version of the app does not know. */
export function stickerArt(id: string): readonly StickerShape[] | null {
  return ART.get(id as StickerId) ?? null;
}

/** How wide the white paper round a sticker is, on the 100 by 100 square. */
export const STICKER_EDGE = 7;
