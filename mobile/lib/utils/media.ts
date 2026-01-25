export function hasAnyMedia(p: any): boolean {
  const urls = p?.imageUrls;
  if (Array.isArray(urls) && urls.length > 0) return true;

  const single = p?.imageUrl;
  if (typeof single === "string" && single.length > 0) return true;

  const media = p?.media;
  if (Array.isArray(media) && media.length > 0) return true;

  return false;
}
