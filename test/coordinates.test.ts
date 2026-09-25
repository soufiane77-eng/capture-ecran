import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MIN_SELECTION_PX,
  clampToBounds,
  clampToViewport,
  computeCropRegion,
  hasArea,
  isTooSmall,
  normalizeRect,
  resolveCaptureScale,
  roundToPixels,
  toDevicePixels,
  type Rect,
} from '../src/utils/coordinates.ts'

/** Assertion de rectangle : évite de comparer quatre champs à la main. */
function assertRect(actual: Rect, expected: Rect): void {
  assert.deepEqual(actual, expected)
}

describe('normalizeRect', () => {
  const anchor = { x: 100, y: 100 }

  it('gère haut → bas / gauche → droite', () => {
    assertRect(normalizeRect(anchor, { x: 300, y: 250 }), { x: 100, y: 100, w: 200, h: 150 })
  })

  it('gère bas → haut / droite → gauche', () => {
    assertRect(normalizeRect(anchor, { x: 40, y: 20 }), { x: 40, y: 20, w: 60, h: 80 })
  })

  it('gère les diagonales croisées', () => {
    assertRect(normalizeRect({ x: 100, y: 100 }, { x: 40, y: 250 }), {
      x: 40,
      y: 100,
      w: 60,
      h: 150,
    })
    assertRect(normalizeRect({ x: 100, y: 100 }, { x: 300, y: 20 }), {
      x: 100,
      y: 20,
      w: 200,
      h: 80,
    })
  })

  it('produit une surface nulle si aucun déplacement', () => {
    assertRect(normalizeRect(anchor, anchor), { x: 100, y: 100, w: 0, h: 0 })
  })
})

describe('clampToViewport', () => {
  const viewport = { width: 1000, height: 800 }

  it('laisse passer un rectangle déjà dans les bornes', () => {
    const rect = { x: 10, y: 20, w: 100, h: 200 }
    assertRect(clampToViewport(rect, viewport), rect)
  })

  it('coupe un rectangle qui dépasse en bas à droite', () => {
    assertRect(clampToViewport({ x: 900, y: 700, w: 400, h: 400 }, viewport), {
      x: 900,
      y: 700,
      w: 100,
      h: 100,
    })
  })

  it('coupe un rectangle qui dépasse en haut à gauche', () => {
    assertRect(clampToViewport({ x: -50, y: -30, w: 200, h: 200 }, viewport), {
      x: 0,
      y: 0,
      w: 150,
      h: 170,
    })
  })

  it('réduit la taille quand le rectangle commence hors cadre', () => {
    // Régression : en glissant vers le haut-gauche de la fenêtre, le navigateur
    // rapporte des clientX/clientY négatifs. Déccaler seulement l'origine
    // donnerait une capture trop large de toute la portion hors écran.
    assertRect(clampToViewport({ x: -40, y: -20, w: 340, h: 320 }, viewport), {
      x: 0,
      y: 0,
      w: 300,
      h: 300,
    })
  })

  it('gère un viewport dégénéré sans produire de surface négative', () => {
    assertRect(clampToViewport({ x: 10, y: 10, w: 500, h: 500 }, { width: 0, height: 0 }), {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    })
  })
})

describe('toDevicePixels', () => {
  it('applique une échelle uniforme', () => {
    assertRect(toDevicePixels({ x: 10, y: 20, w: 100, h: 50 }, { x: 2, y: 2 }), {
      x: 20,
      y: 40,
      w: 200,
      h: 100,
    })
  })

  it('applique des axes non uniformes', () => {
    assertRect(toDevicePixels({ x: 10, y: 20, w: 100, h: 50 }, { x: 1.5, y: 2 }), {
      x: 15,
      y: 40,
      w: 150,
      h: 100,
    })
  })
})

describe('roundToPixels', () => {
  it('arrondit les deux bords indépendamment', () => {
    // Arrondir la largeur elle-même donnerait 1 + round(9.5) = 11, donc un
    // bord droit à 11 au lieu de 10 : un pixel de dérive vers la droite.
    assertRect(roundToPixels({ x: 0.5, y: 0.5, w: 9.5, h: 9.5 }), {
      x: 1,
      y: 1,
      w: 9,
      h: 9,
    })
  })

  it('ne décale jamais le bord droit après arrondi', () => {
    const rect = { x: 33.3, y: 66.6, w: 100.1, h: 50.4 }
    const rounded = roundToPixels(rect)
    assert.equal(rounded.x + rounded.w, Math.round(rect.x + rect.w))
    assert.equal(rounded.y + rounded.h, Math.round(rect.y + rect.h))
  })

  it('laisse intact un rectangle déjà aligné', () => {
    const rect = { x: 0, y: 0, w: 640, h: 480 }
    assertRect(roundToPixels(rect), rect)
  })
})

describe('clampToBounds', () => {
  const bitmap = { x: 0, y: 0, w: 800, h: 600 }

  it('borne une région qui sort de la bitmap', () => {
    assertRect(clampToBounds({ x: 700, y: 550, w: 400, h: 400 }, bitmap), {
      x: 700,
      y: 550,
      w: 100,
      h: 50,
    })
  })

  it('borne une région négative', () => {
    assertRect(clampToBounds({ x: -20, y: -20, w: 100, h: 100 }, bitmap), {
      x: 0,
      y: 0,
      w: 80,
      h: 80,
    })
  })
})

describe('resolveCaptureScale', () => {
  it('mesure l’échelle sur la bitmap, qui fait foi', () => {
    assert.deepEqual(
      resolveCaptureScale({ width: 1600, height: 1000 }, { width: 800, height: 500 }, 1),
      { x: 2, y: 2 },
    )
  })

  it('privilégie la mesure quand le devicePixelRatio ment', () => {
    // Échelle réelle 1.5, mais la page annonce 1 : la bitmap gagne.
    assert.deepEqual(
      resolveCaptureScale({ width: 1200, height: 600 }, { width: 800, height: 400 }, 1),
      { x: 1.5, y: 1.5 },
    )
  })

  it('supporte les axes non uniformes', () => {
    assert.deepEqual(
      resolveCaptureScale({ width: 1600, height: 500 }, { width: 800, height: 500 }, 1),
      { x: 2, y: 1 },
    )
  })

  it('retombe sur le devicePixelRatio si le viewport est inexploitable', () => {
    assert.deepEqual(
      resolveCaptureScale({ width: 800, height: 600 }, { width: 0, height: 0 }, 1.25),
      { x: 1.25, y: 1.25 },
    )
    assert.deepEqual(
      resolveCaptureScale({ width: 800, height: 600 }, { width: -10, height: 600 }, 2),
      { x: 2, y: 2 },
    )
  })
})

describe('computeCropRegion', () => {
  const bitmap = { width: 2400, height: 1400 }

  it('reproduit exactement la sélection en pixels réels', () => {
    const region = computeCropRegion({ x: 100, y: 50, w: 300, h: 200 }, { x: 2, y: 2 }, bitmap)
    assertRect(region, { x: 200, y: 100, w: 600, h: 400 })
  })

  it('gère les échelles fractionnaires (écran 125 % / 150 %)', () => {
    assertRect(computeCropRegion({ x: 10, y: 10, w: 100, h: 100 }, { x: 1.25, y: 1.25 }, bitmap), {
      x: 13,
      y: 13,
      w: 125,
      h: 125,
    })
    assertRect(computeCropRegion({ x: 0, y: 0, w: 100, h: 100 }, { x: 1.5, y: 1.5 }, bitmap), {
      x: 0,
      y: 0,
      w: 150,
      h: 150,
    })
  })

  it('ne déborde jamais de la bitmap après arrondi', () => {
    // 799.6 * 3 = 2398.8 → arrondi à 2399, +3 px de largeur dépassent 2400.
    const region = computeCropRegion({ x: 799.6, y: 0, w: 799.6, h: 10 }, { x: 3, y: 3 }, bitmap)
    assertRect(region, { x: 2399, y: 0, w: 1, h: 30 })
    assert.ok(region.x + region.w <= bitmap.width)
    assert.ok(region.y + region.h <= bitmap.height)
  })

  it('reste dans les bornes sur les quatre coins du viewport', () => {
    for (const rect of [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 750, y: 0, w: 50, h: 50 },
      { x: 0, y: 350, w: 50, h: 50 },
      { x: 750, y: 350, w: 50, h: 50 },
    ]) {
      const region = computeCropRegion(rect, { x: 2, y: 2 }, bitmap)
      assert.ok(region.x >= 0 && region.y >= 0)
      assert.ok(region.x + region.w <= bitmap.width)
      assert.ok(region.y + region.h <= bitmap.height)
    }
  })
})

describe('isTooSmall', () => {
  it('annule en dessous de 5px sur un côté (spec §7)', () => {
    assert.equal(MIN_SELECTION_PX, 5)
    assert.equal(isTooSmall({ x: 0, y: 0, w: 4, h: 100 }), true)
    assert.equal(isTooSmall({ x: 0, y: 0, w: 100, h: 4 }), true)
    assert.equal(isTooSmall({ x: 0, y: 0, w: 4, h: 4 }), true)
    assert.equal(isTooSmall({ x: 0, y: 0, w: 0, h: 0 }), true)
  })

  it('accepte à partir de 5px sur les deux côtés', () => {
    assert.equal(isTooSmall({ x: 0, y: 0, w: 5, h: 5 }), false)
    assert.equal(isTooSmall({ x: 0, y: 0, w: 5, h: 100 }), false)
    assert.equal(isTooSmall({ x: 0, y: 0, w: 6, h: 5 }), false)
  })
})

describe('hasArea', () => {
  it('exige au moins un pixel dans chaque dimension', () => {
    assert.equal(hasArea({ x: 0, y: 0, w: 0, h: 10 }), false)
    assert.equal(hasArea({ x: 0, y: 0, w: 10, h: 0 }), false)
    assert.equal(hasArea({ x: 0, y: 0, w: 1, h: 1 }), true)
  })
})
