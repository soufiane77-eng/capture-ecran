/**
 * Géométrie de la capture.
 *
 * Tout ce module est volontairement pur : aucune dépendance au DOM, au service
 * worker ou à l'extension. C'est ici que se joue le « pixel-perfect » de la
 * spec (§3), donc c'est ici que se concentrent les tests.
 *
 * Deux espaces de coordonnées coexistent :
 *   - le viewport CSS (`clientX/clientY`) : ce que reçoit le pointeur ;
 *   - les pixels réels de l'image capturée : ce que contient le PNG renvoyé
 *     par `chrome.tabs.captureVisibleTab`.
 *
 * Le pont entre les deux est l'échelle, voir `resolveCaptureScale`.
 */

/** Rectangle exprimé dans un espace de coordonnées donné. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** Seuil de la spec §7 : en dessous, la sélection est considérée accidentelle. */
export const MIN_SELECTION_PX = 5

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Convertit un glisser de souris en rectangle, quelle que soit la direction
 * (§2 : haut→bas, bas→haut, gauche→droite, droite→gauche).
 */
export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  }
}

/** Borne un rectangle au viewport, en coordonnées CSS. */
export function clampToViewport(rect: Rect, viewport: Size): Rect {
  return clampToBounds(rect, { x: 0, y: 0, w: viewport.width, h: viewport.height })
}

/**
 * Borne un rectangle à l'intérieur d'un autre (typiquement la bitmap capturée).
 *
 * Les deux bords sont recalculés séparément : un rectangle qui commence hors
 * cadre voit sa *taille* réduite, pas seulement son origine décalée. C'est le
 * cas réel d'un glisser vers le haut-gauche de la fenêtre, où le navigateur
 * rapporte des `clientX/clientY` négatifs.
 */
export function clampToBounds(rect: Rect, bounds: Rect): Rect {
  const minX = bounds.x
  const minY = bounds.y
  const maxX = bounds.x + bounds.w
  const maxY = bounds.y + bounds.h

  const x = clamp(rect.x, minX, maxX)
  const y = clamp(rect.y, minY, maxY)
  const right = clamp(rect.x + rect.w, minX, maxX)
  const bottom = clamp(rect.y + rect.h, minY, maxY)

  return { x, y, w: right - x, h: bottom - y }
}

/**
 * Projette un rectangle CSS vers les pixels réels. L'échelle est un `Point` et
 * non un scalaire : sur les écrans à mise à l'échelle fractionnaire, X et Y
 * peuvent différer.
 */
export function toDevicePixels(rect: Rect, scale: Point): Rect {
  return {
    x: rect.x * scale.x,
    y: rect.y * scale.y,
    w: rect.w * scale.x,
    h: rect.h * scale.y,
  }
}

/**
 * Aligne un rectangle sur la grille de pixels entiers.
 *
 * On arrondit les bords gauche/haut et droit/bas séparément plutôt que la
 * largeur : `Math.round(10.4) + Math.round(9.6) = 21` décalerait le crop d'un
 * pixel par rapport à `Math.round(20) = 20`.
 */
export function roundToPixels(rect: Rect): Rect {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  return {
    x,
    y,
    w: Math.round(rect.x + rect.w) - x,
    h: Math.round(rect.y + rect.h) - y,
  }
}

/**
 * Détermine l'échelle pixels réels / pixels CSS.
 *
 * La bitmap capturée fait foi : le `devicePixelRatio` rapporté par la page peut
 * avoir bougé entre la sélection et la capture (changement d'écran, zoom
 * fractionnaire, extension multi-écrans). On ne s'y fie que si la mesure est
 * inexploitable.
 */
export function resolveCaptureScale(
  bitmap: Size,
  viewport: Size,
  reportedDpr: number,
): Point {
  const fallback: Point = { x: reportedDpr, y: reportedDpr }
  if (viewport.width <= 0 || viewport.height <= 0) return fallback

  const x = bitmap.width / viewport.width
  const y = bitmap.height / viewport.height
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return fallback

  return { x, y }
}

/**
 * Chaîne complète : rectangle CSS de l'utilisateur → région à découper dans la
 * bitmap, alignée sur les pixels et garantie dans ses bornes.
 */
export function computeCropRegion(cssRect: Rect, scale: Point, bitmap: Size): Rect {
  const bounds: Rect = { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
  return clampToBounds(roundToPixels(toDevicePixels(cssRect, scale)), bounds)
}

/** Garde-fou de la spec §7 : empêche les captures accidentelles. */
export function isTooSmall(rect: Rect, min: number = MIN_SELECTION_PX): boolean {
  return rect.w < min || rect.h < min
}

/** Vrai si le rectangle contient au moins un pixel, donc une image décodable. */
export function hasArea(rect: Rect): boolean {
  return rect.w >= 1 && rect.h >= 1
}
