import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { generateIcons } from './scripts/make-icons.mjs'

/**
 * Assemble `dist/`, le dossier à charger via « Charger l'extension non
 * empaquetée » dans chrome://extensions.
 *
 * Deux bundles parce que les deux mondes n'ont pas le même format : le service
 * worker est un module ES (le manifeste le déclare `type: "module"`), un content
 * script n'est pas un module et doit être un IIFE.
 */

const root = fileURLToPath(new URL('.', import.meta.url))
const dist = join(root, 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const shared = {
  bundle: true,
  platform: 'browser',
  target: 'chrome109',
  charset: 'utf8',
  legalComments: 'none',
  // `selector.css` est embarqué comme simple chaîne : il est injecté dans le
  // shadow root, il ne doit pas devenir une feuille de style de la page.
  loader: { '.css': 'text' },
}

await esbuild.build({
  ...shared,
  entryPoints: [join(root, 'src/background/service-worker.ts')],
  outfile: join(dist, 'background.js'),
  format: 'esm',
})

await esbuild.build({
  ...shared,
  entryPoints: [join(root, 'src/content/capture.ts')],
  outfile: join(dist, 'content.js'),
  format: 'iife',
})

console.log('Icônes :')
generateIcons(join(root, 'icons'))

cpSync(join(root, 'src/manifest.json'), join(dist, 'manifest.json'))
cpSync(join(root, 'icons'), join(dist, 'icons'), { recursive: true })

console.log('\n✓ dist/ prêt — c\'est le seul dossier à charger dans le navigateur')
console.log('  chrome://extensions → Mode développeur → Charger l\'extension non empaquetée → dist/')
