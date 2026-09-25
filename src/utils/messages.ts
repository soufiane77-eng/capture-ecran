import type { Rect, Size } from './coordinates.ts'

/**
 * Contrat de messages entre le service worker et le content script.
 *
 * Aucun `enum` : TypeScript les effacerait à la compilation (et le type-stripping
 * de Node les refuse). Des objets `as const` donnent le même typage.
 */
export const MSG = {
  /** SW → content : ouvre une session de sélection. */
  START_SELECTION: 'capture-ecran:start-selection',
  /** content → SW : sélection valide, demande la capture. */
  SELECTION_DONE: 'capture-ecran:selection-done',
  /** content → SW : ESC, clic trop petit, ou abandon. */
  SELECTION_CANCELLED: 'capture-ecran:selection-cancelled',
} as const

export interface StartSelectionMessage {
  type: typeof MSG.START_SELECTION
}

export interface SelectionDoneMessage {
  type: typeof MSG.SELECTION_DONE
  /** Rectangle de sélection en pixels CSS du viewport. */
  rect: Rect
  /** Taille du viewport au moment du relâchement, pour recalculer l'échelle. */
  viewport: Size
  /** `window.devicePixelRatio`, repli si la bitmap ne permet pas de mesurer. */
  devicePixelRatio: number
}

export interface SelectionCancelledMessage {
  type: typeof MSG.SELECTION_CANCELLED
  reason: 'escape' | 'too-small' | 'aborted'
}

export type CaptureRequestMessage = SelectionDoneMessage | SelectionCancelledMessage

/**
 * Le PNG fait transiter en base64 : le canal de messagerie de Chrome sérialise
 * en JSON, donc ni `Blob` ni `ArrayBuffer` ne surviveraient au transport.
 */
export type SelectionDoneResponse =
  | { ok: true; pngBase64: string }
  | { ok: false; error: string }
