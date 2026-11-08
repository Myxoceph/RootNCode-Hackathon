/**
 * Whether `photo` is a frame Taşın Dili's camera left in the app's cache for the sending screen. The
 * route's `photo` comes from a URL, which a link can set: nothing else may pass as "from the camera".
 */
export function isCameraFrame(photo: string, cacheUri: string): boolean {
  const name = photo.slice(photo.lastIndexOf("/") + 1);
  return /^inscription-propose-\d+\.jpg$/.test(name) && photo === `${cacheUri.replace(/\/+$/, "")}/${name}`;
}
