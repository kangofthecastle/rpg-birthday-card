/**
 * True when `url` resolves to a real image (not a 404 or the dev SPA fallback
 * that serves index.html for missing paths). Used so optional/generated art
 * never logs a loader error when it is absent.
 */
export async function isImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    const contentType = response.headers.get('content-type') ?? '';
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}
