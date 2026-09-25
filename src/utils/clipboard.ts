/**
 * Écriture dans le presse-papiers système.
 *
 * Spécification §4 : la copie est automatique, sans confirmation. Cette
 * fonction ne pose donc aucune question à l'utilisateur — elle échoue ou elle
 * réussit, silencieusement.
 */

const PNG_MIME = 'image/png'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Copie un PNG dans le presse-papiers.
 *
 * La permission `clipboardWrite` du manifeste autorise l'écriture sans geste
 * utilisateur, mais Chrome refuse encore si le document n'a pas le focus — d'où
 * la remontée de fenêtre faite en amont par le service worker. Un échec peut
 * aussi être transitoire (autre application qui vient de prendre le
 * presse-papiers) : on réessaie brièvement avant d'abandonner.
 */
export async function copyPngToClipboard(blob: Blob, attempts = 2): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard API indisponible dans ce contexte')
  }

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [PNG_MIME]: blob })])
      return
    } catch (error) {
      lastError = error
      if (attempt + 1 < attempts) {
        await delay(120 * (attempt + 1))
      }
    }
  }

  throw new Error(`Échec de la copie après ${attempts} tentatives`, { cause: lastError })
}
