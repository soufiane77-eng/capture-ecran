import { blobToBase64, dataUrlToBlob } from '../utils/base64.ts'
import { cropCapture } from '../utils/crop.ts'
import {
  MSG,
  type SelectionDoneMessage,
  type SelectionDoneResponse,
} from '../utils/messages.ts'

/**
 * Service worker : point d'entrée unique (spec §5) et propriétaire de l'état.
 *
 * Le clic sur l'icône passe par `chrome.action.onClicked` — le manifeste ne
 * déclare aucun `default_popup`, il n'y a donc aucune fenêtre intermédiaire.
 *
 * `activeTab` est accordé par ce clic même : l'extension n'a pas de permission
 * d'hôte déclarée et ne voit les pages que pendant l'action volontaire de
 * l'utilisateur. C'est la lecture la plus stricte de la spec §10.
 */

const LOG_PREFIX = '[capture-ecran]'

type TabState = 'IDLE' | 'SELECTING' | 'CAPTURING'

/**
 * État par onglet, en mémoire.
 *
 * Un service worker MV3 est tué après quelques secondes d'inactivité : une
 * entrée disparue est donc relue comme IDLE. C'est correct — le seul état qui
 * doit survivre au redémarrage est « ne pas capturer deux fois en parallèle ».
 */
const tabStates = new Map<number, TabState>()

function isBusy(tabId: number): boolean {
  const state = tabStates.get(tabId)
  return state === 'SELECTING' || state === 'CAPTURING'
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Remonte la fenêtre avant d'injecter.
 *
 * Le presse-papiers exige un document focalisé : sans cela, l'écriture échoue
 * plus tard avec `NotAllowedError`, une fois la capture déjà perdue.
 */
async function ensureWindowFocused(windowId: number): Promise<void> {
  const window = await chrome.windows.get(windowId)
  // `focused` est un booléen distinct de `state` : une fenêtre en
  // `maximized` ou `fullscreen` peut parfaitement être au premier plan.
  if (window.focused) return
  await chrome.windows.update(windowId, { focused: true })
}

async function startSelection(tabId: number, windowId: number): Promise<void> {
  tabStates.set(tabId, 'SELECTING')

  try {
    await ensureWindowFocused(windowId)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
    await chrome.tabs.sendMessage(tabId, { type: MSG.START_SELECTION })
  } catch (error) {
    tabStates.delete(tabId)
    // Pages interdites à l'injection (chrome://, Chrome Web Store, PDF
    // intégré) : impossible d'agir, et aucun dialogue n'est prévu par la spec.
    console.warn(LOG_PREFIX, 'capture impossible sur cet onglet', describeError(error))
  }
}

async function finishCapture(
  tabId: number,
  windowId: number,
  message: SelectionDoneMessage,
): Promise<SelectionDoneResponse> {
  tabStates.set(tabId, 'CAPTURING')

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
    const fullFrame = await dataUrlToBlob(dataUrl)

    const cropped = await cropCapture(fullFrame, {
      rect: message.rect,
      viewport: message.viewport,
      devicePixelRatio: message.devicePixelRatio,
    })

    return { ok: true, pngBase64: await blobToBase64(cropped) }
  } catch (error) {
    return { ok: false, error: describeError(error) }
  } finally {
    tabStates.delete(tabId)
  }
}

chrome.action.onClicked.addListener((tab) => {
  const { id: tabId, windowId } = tab
  if (tabId === undefined || windowId === undefined) return
  if (isBusy(tabId)) return

  void startSelection(tabId, windowId)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id
  const windowId = sender.tab?.windowId
  if (tabId === undefined || windowId === undefined) return false

  if (message?.type === MSG.SELECTION_DONE) {
    void finishCapture(tabId, windowId, message as SelectionDoneMessage)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: describeError(error) }))
    return true // réponse asynchrone
  }

  if (message?.type === MSG.SELECTION_CANCELLED) {
    tabStates.delete(tabId)
  }

  return false
})
