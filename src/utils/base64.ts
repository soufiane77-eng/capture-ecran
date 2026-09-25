/**
 * Transport d'images entre le service worker (qui capture) et le content script
 * (qui écrit dans le presse-papiers). La messagerie de Chrome sérialise en
 * JSON : le binaire passe donc en base64.
 */

/** Chunk assez petit pour ne pas dépasser la limite d'arguments de `String.fromCharCode`. */
const CHUNK_SIZE = 0x8000

export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))
    }
    return btoa(binary)
  })
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

/** `captureVisibleTab` renvoie une data URL ; on la convertit en Blob. */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => response.blob())
}
