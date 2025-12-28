// mobile/lib/postComposer/media.ts
export const MAX_IMAGES = 4;

export function uniqueLimit(arr: string[], limit: number) {
  const out: string[] = [];
  for (const x of arr) {
    if (!x) continue;
    if (out.includes(x)) continue;
    out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}

export function remainingSlots(currentCount: number, limit = MAX_IMAGES) {
  return Math.max(0, limit - currentCount);
}

export function canAddImages(videoThumbUri: string | null) {
  return !videoThumbUri;
}

export function mediaForPost(opts: {
  imageUrls: string[];
  videoThumbUri: string | null;
  addVideoIcon: boolean;
}) {
  const { imageUrls, videoThumbUri, addVideoIcon } = opts;
  return {
    imageUrls: videoThumbUri ? [videoThumbUri] : uniqueLimit(imageUrls, MAX_IMAGES),
    addVideoIconForPost: Boolean(videoThumbUri) && Boolean(addVideoIcon),
  };
}