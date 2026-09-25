import {
  clampToViewport,
  isTooSmall,
  normalizeRect,
  type Point,
  type Rect,
} from '../utils/coordinates.ts'
import { createOverlay } from './overlay.ts'

/**
 * Boucle de sélection : du premier appui au rectangle validé ou annulé.
 *
 * `selectArea` possède le cycle de vie complet de l'overlay. Il est retiré du
 * DOM de façon **synchrone** au relâchement, avant toute promesse : si l'overlay
 * était encore là, son assombrissement serait cuit dans le PNG.
 */

export type CancelReason = 'escape' | 'too-small' | 'aborted'

export type SelectionOutcome =
  | { status: 'selected'; rect: Rect }
  | { status: 'cancelled'; reason: CancelReason }

export function selectArea(doc: Document = document): Promise<SelectionOutcome> {
  return new Promise((resolve) => {
    const overlay = createOverlay(doc)
    const surface = overlay.element

    let anchor: Point | null = null
    let pointer: Point = { x: 0, y: 0 }
    let activePointerId: number | null = null
    let settled = false

    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

    function currentRect(): Rect {
      return clampToViewport(normalizeRect(anchor ?? pointer, pointer), viewport())
    }

    function settle(outcome: SelectionOutcome): void {
      if (settled) return
      settled = true
      detach()
      overlay.close()
      resolve(outcome)
    }

    function onPointerDown(event: PointerEvent): void {
      // Bouton droit et molette : hors périmètre d'un outil de capture d'écran.
      if (event.button !== 0) return
      event.preventDefault()

      anchor = { x: event.clientX, y: event.clientY }
      pointer = { x: event.clientX, y: event.clientY }
      activePointerId = event.pointerId

      // Sans capture du pointeur, le glisser s'interrompt dès que le curseur
      // sort de la fenêtre — or on veut pouvoir tracer au-delà des bords.
      surface.setPointerCapture(event.pointerId)
      overlay.update(currentRect())
    }

    function onPointerMove(event: PointerEvent): void {
      if (anchor === null || event.pointerId !== activePointerId) return
      event.preventDefault()
      pointer = { x: event.clientX, y: event.clientY }
      overlay.update(currentRect())
    }

    function onPointerUp(event: PointerEvent): void {
      if (anchor === null || event.pointerId !== activePointerId) return
      event.preventDefault()

      pointer = { x: event.clientX, y: event.clientY }
      releaseCapture(event.pointerId)

      const rect = currentRect()
      activePointerId = null
      anchor = null

      // Garde-fou de la spec §7 : sous 5px de côté, c'est un clic, pas une zone.
      settle(
        isTooSmall(rect)
          ? { status: 'cancelled', reason: 'too-small' }
          : { status: 'selected', rect },
      )
    }

    // Perdre le pointeur (alt-tab, geste interrompu) doit tout annuler plutôt
    // que laisser un overlay coincé à l'écran.
    function onAborted(): void {
      settle({ status: 'cancelled', reason: 'aborted' })
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      settle({ status: 'cancelled', reason: 'escape' })
    }

    function releaseCapture(id: number): void {
      if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id)
    }

    function detach(): void {
      surface.removeEventListener('pointerdown', onPointerDown)
      // `pointermove`/`pointerup` restent sur `window` en repli : si la capture
      // de pointeur est révoquée en cours de route, on ne perd pas le suivi.
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onAborted, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onAborted, true)
    }

    surface.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onAborted, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onAborted, true)
  })
}
