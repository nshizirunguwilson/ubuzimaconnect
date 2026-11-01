/** Helpers for files sent as base64 data URLs (voice notes and identity photos). */

/** How many bytes a base64 data URL holds once decoded (every 4 characters carry 3 bytes). */
export function decodedSize(dataUrl: string) {
  const base64Length = dataUrl.length - dataUrl.indexOf(",") - 1;
  return Math.floor((base64Length * 3) / 4);
}

/** True when the file has these bytes from position `offset`: how a file's real type is recognised. */
export function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}
