/** Reading and writing a draft's record (the dataset's JSON, data/README.md) by path, loosely: the worker wrote it. */

export type Rec = Record<string, unknown>;
export type Path = Array<string | number>;

export const obj = (value: unknown): Rec | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null);

export function getIn(record: unknown, path: Path): unknown {
  let at: unknown = record;
  for (const key of path) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Rec)[key as string];
  }
  return at;
}

/** A copy of `record` with `value` at `path`; the objects on the way are made when missing. */
export function setIn(record: unknown, path: Path, value: unknown): Rec {
  const [key, ...rest] = path;
  const base: Rec | unknown[] = Array.isArray(record) ? [...record] : { ...(obj(record) ?? {}) };
  (base as Rec)[key as string] = rest.length === 0 ? value : setIn((base as Rec)[key as string], rest, value);
  return base as Rec;
}

/** A string there, or null when it is missing or blank. */
export const textAt = (record: unknown, path: Path): string | null => {
  const value = getIn(record, path);
  return typeof value === "string" && value.trim() ? value : null;
};
