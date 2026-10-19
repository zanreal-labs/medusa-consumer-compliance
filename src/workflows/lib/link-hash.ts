import { createHash } from "node:crypto";

/**
 * SHA-256 of the document a consent links to (for example the terms), taken
 * when a consent version is saved, so an order can prove which version of the
 * linked document was in force. Best effort: a link that cannot be fetched in
 * time yields null, and the consent is saved anyway.
 */
export async function hashLinkedDocument(url: string | null | undefined, timeoutMs = 5000): Promise<string | null> {
  if (!url || !/^https?:\/\//iu.test(url)) {
    return null;
  }
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return null;
    }
    const body = Buffer.from(await response.arrayBuffer());
    return createHash("sha256").update(body).digest("hex");
  } catch {
    return null;
  }
}
