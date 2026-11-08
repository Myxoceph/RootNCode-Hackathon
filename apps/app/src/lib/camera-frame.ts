const PREFIX = "inscription-propose-";

/** A new name each time: the image cache would show the last frame for the same file. */
export const cameraFrameName = (now = Date.now()) => `${PREFIX}${now}.jpg`;

export const isCameraFrameName = (name: string) => new RegExp(`^${PREFIX}\\d+\\.jpg$`).test(name);

/**
 * Whether `photo` is a frame Taşın Dili's camera left in the app's cache for the sending screen. The
 * route's `photo` comes from a URL, which a link can set: nothing else may pass as "from the camera".
 */
export function isCameraFrame(photo: string, cacheUri: string): boolean {
  const name = photo.slice(photo.lastIndexOf("/") + 1);
  return isCameraFrameName(name) && photo === `${cacheUri.replace(/\/+$/, "")}/${name}`;
}
