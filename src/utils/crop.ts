import {
  computeCropRegion,
  hasArea,
  resolveCaptureScale,
  type Rect,
  type Size,
} from './coordinates.ts'

/**
 * Recadrage de la capture, exécuté dans le service worker.
 *
 * Le service worker n'a pas de DOM, mais `createImageBitmap` et
 * `OffscreenCanvas` y sont disponibles : on découpe donc côté SW plutôt que
 * dans le content script. Deux raisons :
 *   1. la géométrie vit ici, à côté de ses tests ;
 *   2. seul le PNG final traverse la messagerie, pas l'image entière du viewport.
 */

export interface CropRequest {
  /** Rectangle de sélection en pixels CSS du viewport. */
  rect: Rect
  /** Taille du viewport au moment de la sélection. */
  viewport: Size
  /** `window.devicePixelRatio`, utilisé seulement si la bitmap ne permet pas de mesurer. */
  devicePixelRatio: number
}

/**
 * Découpe `source` selon la requête et renvoie un nouveau PNG.
 *
 * L'échelle est mesurée sur la bitmap décodée plutôt que déduite du
 * `devicePixelRatio` : la bitmap est la vérité, elle ne peut pas avoir bougé
 * entre la sélection et la capture.
 */
export async function cropCapture(source: Blob, request: CropRequest): Promise<Blob> {
  const bitmap = await createImageBitmap(source)

  try {
    const size: Size = { width: bitmap.width, height: bitmap.height }
    const scale = resolveCaptureScale(size, request.viewport, request.devicePixelRatio)
    const region = computeCropRegion(request.rect, scale, size)

    if (!hasArea(region)) {
      throw new Error(`Région de capture vide après recadrage (${region.w}×${region.h}px)`)
    }

    const canvas = new OffscreenCanvas(region.w, region.h)
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) {
      throw new Error('Contexte 2D indisponible dans le service worker')
    }

    // Région alignée sur la grille de pixels et copiée à l'échelle 1:1 :
    // le lissage n'a rien à faire ici et fausserait le « pixel-perfect ».
    context.imageSmoothingEnabled = false
    context.drawImage(bitmap, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h)

    return await canvas.convertToBlob({ type: 'image/png' })
  } finally {
    bitmap.close()
  }
}
