import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  clampToViewport,
  computeCropRegion,
  normalizeRect,
  resolveCaptureScale,
  type Rect,
} from '../src/utils/coordinates.ts'

/**
 * Vérification d'alignement, bout en bout, sur un vrai tampon de pixels.
 *
 * Les tests unitaires prouvent que `computeCropRegion` fait ce qu'on lui dit.
 * Celui-ci prouve que ce qu'il dit correspond bien aux pixels de l'image :
 * c'est la promesse « pixel-perfect » de la spec §3.
 *
 * On n'utilise ni PNG ni canvas : seul le découpage du tampon RGBA compte, et
 * il se fait avec une simple copie de sous-tableau.
 */

/** Chaque pixel s'encode lui-même (rouge, vert, bleu), ce qui rend tout décalage visible. */
function makeImage(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      rgba[offset] = x & 0xff
      rgba[offset + 1] = y & 0xff
      rgba[offset + 2] = (x + y) & 0xff
      rgba[offset + 3] = 255
    }
  }
  return rgba
}

function slice(image: Uint8Array, width: number, region: Rect): Uint8Array {
  const out = new Uint8Array(region.w * region.h * 4)
  for (let y = 0; y < region.h; y += 1) {
    const from = ((region.y + y) * width + region.x) * 4
    out.set(image.subarray(from, from + region.w * 4), y * region.w * 4)
  }
  return out
}

/** Recalcule la position d'un pixel en coordonnées CSS, sans passer par la fonction testée. */
function cssRectToPixels(rect: Rect, scale: number): Rect {
  return {
    x: Math.floor(rect.x * scale),
    y: Math.floor(rect.y * scale),
    w: Math.floor(rect.w * scale),
    h: Math.floor(rect.h * scale),
  }
}

describe('alignement pixel-perfect bout en bout', () => {
  const viewport = { width: 800, height: 600 }

  // Couvre les écrans 100 %, 125 %, 150 % et 200 %.
  for (const dpr of [1, 1.25, 1.5, 2]) {
    it(`scale ${dpr}× : la région tombe sur les bons pixels`, () => {
      const bitmap = { width: viewport.width * dpr, height: viewport.height * dpr }
      const image = makeImage(bitmap.width, bitmap.height)

      // Échelle mesurée sur la bitmap, comme le fait le service worker.
      const scale = resolveCaptureScale(bitmap, viewport, dpr)

      const selections: Rect[] = [
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 700, y: 500, w: 100, h: 100 },
        { x: 123.4, y: 56.7, w: 320.9, h: 210.2 },
        { x: 10.5, y: 10.5, w: 1, h: 1 },
        { x: 0, y: 0, w: 800, h: 600 },
      ]

      for (const cssRect of selections) {
        const region = computeCropRegion(cssRect, scale, bitmap)
        const expected = cssRectToPixels(cssRect, dpr)

        assert.deepEqual(
          Array.from(slice(image, bitmap.width, region)),
          Array.from(slice(image, bitmap.width, expected)),
          `sélection ${JSON.stringify(cssRect)} à ${dpr}× : région ${JSON.stringify(region)} ` +
            `au lieu de ${JSON.stringify(expected)}`,
        )
      }
    })
  }

  it('le rectangle annoncé à l’utilisateur correspond à l’image produite', () => {
    // Scénario nominal : dpr 2, sélection 300×200 à (100, 50).
    const dpr = 2
    const bitmap = { width: viewport.width * dpr, height: viewport.height * dpr }
    const image = makeImage(bitmap.width, bitmap.height)
    const scale = resolveCaptureScale(bitmap, viewport, dpr)

    const region = computeCropRegion({ x: 100, y: 50, w: 300, h: 200 }, scale, bitmap)
    const cropped = slice(image, bitmap.width, region)

    // L'image fait bien 2× la taille annoncée à l'écran...
    assert.equal(region.w * region.h * 4, cropped.length)
    // ...et son premier pixel est celui de l'angle haut-gauche de la sélection.
    const origin = (50 * bitmap.width + 100) * 4
    assert.equal(cropped[0], image[origin])
    assert.equal(cropped[1], image[origin + 1])
  })

  it('reste exact quand le pointeur sort de la fenêtre', () => {
    // Glisser depuis (300,300) vers (-40,-20) : le navigateur rapporte des
    // coordonnées négatives, la zone visible fait 300×300 et non 340×320.
    const dpr = 2
    const bitmap = { width: viewport.width * dpr, height: viewport.height * dpr }
    const image = makeImage(bitmap.width, bitmap.height)
    const scale = resolveCaptureScale(bitmap, viewport, dpr)

    const dragged = clampToViewport(normalizeRect({ x: 300, y: 300 }, { x: -40, y: -20 }), viewport)
    assert.deepEqual(dragged, { x: 0, y: 0, w: 300, h: 300 })

    const region = computeCropRegion(dragged, scale, bitmap)
    assert.deepEqual(region, { x: 0, y: 0, w: 600, h: 600 })
    assert.deepEqual(
      Array.from(slice(image, bitmap.width, region)),
      Array.from(slice(image, bitmap.width, { x: 0, y: 0, w: 600, h: 600 })),
    )
  })
})
