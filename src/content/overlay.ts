import type { Rect } from '../utils/coordinates.ts'
import styles from './selector.css'

/**
 * Construction et rendu de l'overlay de sélection.
 *
 * L'overlay vit dans un shadow root **fermé** (`mode: 'closed'`) : la page ne
 * peut ni lire son contenu ni le modifier via `host.shadowRoot`. C'est la
 * garantie qu'une page ne peut pas altérer ce que l'utilisateur est en train
 * de capturer.
 *
 * `all: initial` sur l'hôte neutralise les styles hérités avant d'appliquer
 * les nôtres ; les déclarations suivantes, plus tard dans le bloc, l'emportent.
 */
const HOST_STYLE = [
  'all: initial',
  'display: block',
  'position: fixed',
  'inset: 0',
  'z-index: 2147483647',
  'cursor: crosshair',
  'pointer-events: auto',
].join(';')

/** Hauteur réservée à l'étiquette, pour décider de la retourner. */
const LABEL_HEIGHT = 26

export interface Overlay {
  /** Hôte de l'overlay : cible naturelle des événements pointeur. */
  readonly element: HTMLElement
  /** Affiche le cadre à la position donnée, ou le masque si la zone est vide. */
  update(rect: Rect): void
  /** Retire l'overlay du DOM. Idempotent. */
  close(): void
}

export function createOverlay(doc: Document): Overlay {
  const host = doc.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = HOST_STYLE

  const root = doc.createElement('div')
  root.className = 'root'
  root.innerHTML = '<div class="dim"></div><div class="frame"><span class="frame__size"></span></div>'

  const shadow = host.attachShadow({ mode: 'closed' })
  const styleElement = doc.createElement('style')
  styleElement.textContent = styles
  shadow.append(styleElement, root)

  // `body` peut manquer sur un document encore en cours de parsing ; le
  // documentElement accepte alors l'hôte sans problème.
  ;(doc.body ?? doc.documentElement).appendChild(host)

  const frame = root.querySelector<HTMLElement>('.frame')
  const sizeLabel = root.querySelector<HTMLElement>('.frame__size')
  if (!frame || !sizeLabel) {
    throw new Error("Structure de l'overlay invalide")
  }

  let closed = false

  return {
    element: host,

    update(rect: Rect): void {
      if (closed || rect.w < 1 || rect.h < 1) {
        root.classList.remove('is-selecting')
        return
      }

      root.classList.add('is-selecting')
      frame.style.left = `${rect.x}px`
      frame.style.top = `${rect.y}px`
      frame.style.width = `${rect.w}px`
      frame.style.height = `${rect.h}px`
      sizeLabel.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`
      frame.classList.toggle('is-flipped', rect.y < LABEL_HEIGHT)
    },

    close(): void {
      if (closed) return
      closed = true
      host.remove()
    },
  }
}
