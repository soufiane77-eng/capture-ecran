import { copyPngToClipboard } from '../utils/clipboard.ts'
import { base64ToBlob } from '../utils/base64.ts'
import {
  MSG,
  type SelectionDoneMessage,
  type SelectionDoneResponse,
  type StartSelectionMessage,
} from '../utils/messages.ts'
import { selectArea } from './selector.ts'

/**
 * Content script : machine à états de la session de capture (spec §12).
 *
 *   IDLE → SELECTING → CAPTURING → IDLE
 *
 * Le content script ne détient pas l'état global ; c'est le service worker qui
 * arbitre les sessions. Ici on ne fait que réagir à `START_SELECTION` et
 * empêcher deux sessions simultanées sur la même page.
 */

const PNG_MIME = 'image/png'
const LOG_PREFIX = '[capture-ecran]'

/** Empêche la ré-exécution de ce fichier de dupliquer les écouteurs. */
const INSTALL_FLAG = '__CAPTURE_ECRAN_INSTALLED__'

declare global {
  interface Window {
    __CAPTURE_ECRAN_INSTALLED__?: boolean
  }
}

let sessionActive = false

/**
 * Retire l'overlay avant que la capture ne parte, et laisse le navigateur
 * peindre au moins un frame.
 *
 * `captureVisibleTab` photographie l'image *composée*. Sans cette attente, la
 * suppression de l'overlay peut ne pas encore être peinte et l'assombrissement
 * se retrouve dans le PNG. Deux `requestAnimationFrame` garantissent que le
 * rendu a eu lieu — le coût (~32ms) est invisible à l'utilisateur.
 */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function runSession(): Promise<void> {
  const restoreScroll = lockScroll()

  try {
    const outcome = await selectArea()

    if (outcome.status === 'cancelled') {
      void notifyCancelled(outcome.reason)
      return
    }

    await afterNextPaint()

    const png = await requestCapture(outcome.rect)
    if (!png) return

    await copyPngToClipboard(png)
  } catch (error) {
    // Aucun dialogue possible (spec §4) : on journalise et on rend la main.
    console.warn(LOG_PREFIX, 'session interrompue', error)
  } finally {
    restoreScroll()
  }
}

async function requestCapture(rect: { x: number; y: number; w: number; h: number }): Promise<Blob | null> {
  const message: SelectionDoneMessage = {
    type: MSG.SELECTION_DONE,
    rect,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
  }

  let response: SelectionDoneResponse | undefined
  try {
    response = await chrome.runtime.sendMessage(message)
  } catch (error) {
    console.warn(LOG_PREFIX, 'capture refusée par le navigateur', error)
    return null
  }

  if (!response?.ok) {
    if (response && !response.ok) {
      console.warn(LOG_PREFIX, 'capture échouée', response.error)
    }
    return null
  }

  return base64ToBlob(response.pngBase64, PNG_MIME)
}

async function notifyCancelled(reason: 'escape' | 'too-small' | 'aborted'): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: MSG.SELECTION_CANCELLED, reason })
  } catch {
    // Le service worker a pu être tué entre-temps : l'abandon est déjà acquis.
  }
}

/**
 * Empêche le défilement pendant la sélection.
 *
 * Sans cela, un molettage accidentel pendant le glisser décale la page et la
 * zone advertise n'a plus aucun rapport avec les pixels capturés. La
 * compensation évite le saut visuel que provoque `overflow: hidden` seul.
 */
function lockScroll(): () => void {
  const root = document.documentElement
  const previousOverflow = root.style.overflow
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  root.style.overflow = 'hidden'
  if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
    window.scrollTo(scrollX, scrollY)
  }

  return () => {
    root.style.overflow = previousOverflow
  }
}

function openSession(): void {
  if (sessionActive) return
  sessionActive = true
  void runSession().finally(() => {
    sessionActive = false
  })
}

function install(): void {
  if (window[INSTALL_FLAG]) return
  window[INSTALL_FLAG] = true

  chrome.runtime.onMessage.addListener((message: StartSelectionMessage) => {
    if (message?.type === MSG.START_SELECTION) {
      openSession()
    }
    // Réponse synchrone : rien à renvoyer, la session est déjà ouverte.
    return false
  })
}

install()
