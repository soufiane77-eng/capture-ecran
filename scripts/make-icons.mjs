import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Génération des icônes de l'extension, sans aucune dépendance.
 *
 * Un PNG n'est qu'une signature suivie de chunks `IHDR` / `IDAT` / `IEND`, et
 * `zlib` — inclus dans Node — fournit la compression. Plutôt que d'embarquer
 * des binaires dans le dépôt, on dessine le glyphe ici : les icônes restent
 * lisibles, versionnables, et ajustables en changeant une constante.
 */

/** Même accent que le cadre de sélection : l'icône et l'overlay sont un seul geste. */
const ACCENT = [0x38, 0xbd, 0xf8]

const SIZES = [16, 32, 48, 128]

/** On dessine en 4× puis on moyenne : c'est ce qui donne les bords lisses. */
const SUPERSAMPLE = 4

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)

  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // profondeur de bit
  ihdr[9] = 6 // RGBA
  // compression, filtre, entrelacement : 0, 0, 0

  // Chaque ligne est préfixée d'un octet de filtre ; 0 = « None ».
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function insideBar(u, v, x0, x1, y0, y1) {
  return u >= x0 && u <= x1 && v >= y0 && v <= y1
}

/**
 * Glyphe : quatre équerres d'angle, l'icône « capture de zone » universally
 * reconnue. Plus lisible qu'un cadre complet à 16px, où les bords ne tiennent
 * plus qu'un pixel.
 */
function coverage(size) {
  const thickness = 0.085
  const arm = 0.3
  const margin = 0.115

  const hi = size * SUPERSAMPLE
  const mask = new Uint8Array(hi * hi)

  for (let py = 0; py < hi; py += 1) {
    for (let px = 0; px < hi; px += 1) {
      const u = (px + 0.5) / hi
      const v = (py + 0.5) / hi
      let hit = false

      for (const sx of [0, 1]) {
        for (const sy of [0, 1]) {
          const hx0 = sx === 0 ? margin : 1 - margin - arm
          const hx1 = sx === 0 ? margin + arm : 1 - margin
          const hy0 = sy === 0 ? margin : 1 - margin - thickness
          const hy1 = sy === 0 ? margin + thickness : 1 - margin

          const vx0 = sx === 0 ? margin : 1 - margin - thickness
          const vx1 = sx === 0 ? margin + thickness : 1 - margin
          const vy0 = sy === 0 ? margin : 1 - margin - arm
          const vy1 = sy === 0 ? margin + arm : 1 - margin

          if (insideBar(u, v, hx0, hx1, hy0, hy1) || insideBar(u, v, vx0, vx1, vy0, vy1)) {
            hit = true
          }
        }
      }

      mask[py * hi + px] = hit ? 1 : 0
    }
  }

  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0
      for (let dy = 0; dy < SUPERSAMPLE; dy += 1) {
        for (let dx = 0; dx < SUPERSAMPLE; dx += 1) {
          sum += mask[(y * SUPERSAMPLE + dy) * hi + (x * SUPERSAMPLE + dx)]
        }
      }
      out[y * size + x] = sum / (SUPERSAMPLE * SUPERSAMPLE)
    }
  }

  return out
}

function renderIcon(size) {
  const alpha = coverage(size)
  const rgba = Buffer.alloc(size * size * 4)
  const [r, g, b] = ACCENT

  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = Math.round(alpha[i] * 255)
  }

  return encodePng(size, size, rgba)
}

export function generateIcons(outputDir) {
  mkdirSync(outputDir, { recursive: true })

  for (const size of SIZES) {
    const file = join(outputDir, `icon${size}.png`)
    writeFileSync(file, renderIcon(size))
    console.log(`  ✓ icons/icon${size}.png`)
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  generateIcons(join(root, 'icons'))
}
