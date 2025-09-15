import { resolve, sep } from 'path'
import { access, readFile } from 'fs/promises'
import { constants as fsConstants } from 'fs'

type FaviconResult = { found: true; dataUrl: string } | { found: false }

const toMime = (path: string): string => {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ico')) return 'image/x-icon'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

const canRead = async (path: string): Promise<boolean> =>
  access(path, fsConstants.R_OK).then(
    () => true,
    () => false
  )

const isWithin = (root: string, path: string): boolean => {
  const r = resolve(root)
  const p = resolve(path)
  return p === r || p.startsWith(r + sep)
}

const toDataUrl = async (path: string): Promise<string> => {
  const buf = await readFile(path)
  const mime = toMime(path)
  const base64 = buf.toString('base64')
  return `data:${mime};base64,${base64}`
}

const candidateRelPaths: Array<string> = [
  'favicon.ico',
  'favicon.png',
  'favicon.jpg',
  'favicon.jpeg',
  'favicon.svg',
  'public/favicon.ico',
  'public/favicon.png',
  'public/favicon.jpg',
  'public/favicon.jpeg',
  'public/favicon.svg',
  'app/favicon.ico',
  'app/favicon.svg',
  'app/icon.svg',
  'app/icon.png',
  'app/icon.ico',
  'app/apple-icon.png',
  'app/apple-touch-icon.png',
  'src/app/favicon.ico',
  'src/app/favicon.svg',
  'src/app/icon.svg',
  'src/app/icon.png',
  'src/app/icon.ico',
  'src/app/apple-icon.png',
  'src/app/apple-touch-icon.png',
  'public/icon.svg',
  'public/icon.png',
  'public/icon.ico'
]

const frameworkFiles: Array<string> = [
  'index.html',
  'public/index.html',
  'src/index.html',
  'app/index.html',
  'pages/_document.tsx',
  'pages/_document.js',
  'src/pages/_document.tsx',
  'src/pages/_document.js',
  'pages/_app.tsx',
  'pages/_app.js',
  'src/pages/_app.tsx',
  'src/pages/_app.js',
  'app/layout.tsx',
  'app/layout.js',
  'src/app/layout.tsx',
  'src/app/layout.js',
  'nuxt.config.ts',
  'nuxt.config.js',
  'app.vue',
  'layouts/default.vue',
  'src/app.html',
  'app/app.html',
  'src/layouts/Layout.astro',
  'src/pages/index.astro'
]

const extractIconHrefs = (filePath: string, content: string): Array<string> => {
  if (filePath.endsWith('.html')) {
    const a = Array.from(
      content.matchAll(
        /<link[^>]+rel\s*=\s*["']?(?:icon|shortcut icon|apple-touch-icon)["']?[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi
      )
    )
    const b = Array.from(
      content.matchAll(
        /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']?(?:icon|shortcut icon|apple-touch-icon)["']?[^>]*>/gi
      )
    )
    return [...a, ...b].map((m) => m[1]).filter(Boolean)
  }
  if (filePath.endsWith('.tsx') || filePath.endsWith('.js')) {
    const a = Array.from(
      content.matchAll(
        /<link[^>]+rel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*\/?>(?!\s*<\/link>)/gi
      )
    )
    const b = Array.from(
      content.matchAll(
        /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*\/?>(?!\s*<\/link>)/gi
      )
    )
    return [...a, ...b].map((m) => m[1]).filter(Boolean)
  }
  if (filePath.endsWith('.vue') || filePath.endsWith('.astro')) {
    const a = Array.from(
      content.matchAll(
        /<link[^>]+rel\s*=\s*["'](?:icon|shortcut icon)["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi
      )
    )
    const b = Array.from(
      content.matchAll(
        /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["'](?:icon|shortcut icon)["'][^>]*>/gi
      )
    )
    return [...a, ...b].map((m) => m[1]).filter(Boolean)
  }
  if (filePath.includes('nuxt.config')) {
    const a = Array.from(
      content.matchAll(
        /link\s*:\s*\[[\s\S]*?{\s*rel\s*:\s*["'](?:icon|shortcut icon)["'][^}]+href\s*:\s*["']([^"']+)["']/gi
      )
    )
    return a.map((m) => m[1]).filter(Boolean)
  }
  return []
}

const candidateResolutions = (projectRoot: string, iconPath: string): Array<string> => {
  const rel = iconPath.startsWith('/') ? iconPath.slice(1) : iconPath
  return [
    resolve(projectRoot, 'public', rel),
    resolve(projectRoot, 'static', rel),
    resolve(projectRoot, 'assets', rel),
    resolve(projectRoot, 'src/assets', rel),
    resolve(projectRoot, rel),
    resolve(projectRoot, 'icons', rel),
    resolve(projectRoot, 'images', rel)
  ]
}

const findFirstReadable = async (paths: Array<string>): Promise<string | null> => {
  const flags = await Promise.all(paths.map((p) => canRead(p)))
  const idx = flags.findIndex((f) => f)
  return idx >= 0 ? paths[idx] : null
}

export const resolveProjectFavicon = async (projectPath: string): Promise<FaviconResult> => {
  const root = resolve(projectPath)

  for (const rel of candidateRelPaths) {
    const full = resolve(root, rel)
    if (!isWithin(root, full)) continue
    const ok = await canRead(full)
    if (!ok) continue
    const dataUrl = await toDataUrl(full)
    return { found: true, dataUrl }
  }

  for (const relFile of frameworkFiles) {
    const filePath = resolve(root, relFile)
    if (!isWithin(root, filePath)) continue
    const ok = await canRead(filePath)
    if (!ok) continue
    const content = await readFile(filePath, 'utf-8')
    const hrefs = extractIconHrefs(relFile, content)
    if (hrefs.length === 0) continue
    for (const href of hrefs) {
      const paths = candidateResolutions(root, href)
      const found = await findFirstReadable(paths)
      if (!found) continue
      const dataUrl = await toDataUrl(found)
      return { found: true, dataUrl }
    }
  }

  return { found: false }
}
