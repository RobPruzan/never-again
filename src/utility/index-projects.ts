import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { homedir } from 'node:os'

type Project = {
  path: string
  name: string
  devScript: string
  packageManager: 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown'
  workspaces: boolean
  tags: string[]
}

const DEFAULT_MAX_DEPTH = 8
const DEFAULT_CONCURRENCY = 8
const YIELD_EVERY = 12
const DEFAULT_OUT = resolve(process.cwd(), 'projects.json')
const FILTER_SKIP_EXAMPLE_DIRS = true
const FILTER_SKIP_UNTAGGED = true

const debug = (msg: string) => {
  if (process.env.DEBUG) {
    console.log(`[debug] ${msg}`)
  }
}

const isDir = async (p: string) => {
  try {
    const s = await stat(p)
    return s.isDirectory()
  } catch {
    return false
  }
}

const readJson = async (file: string): Promise<any | null> => {
  try {
    const buf = await readFile(file, 'utf8')
    return JSON.parse(buf)
  } catch {
    return null
  }
}

const fileExists = (dir: string, name: string) => existsSync(join(dir, name))

const isExamplePath = (dir: string) => {
  const parts = dir.split('/').map((p) => p.toLowerCase())
  for (const p of parts) {
    if (
      p === 'example' ||
      p === 'examples' ||
      p.startsWith('example-') ||
      p.startsWith('examples-')
    )
      return true
  }
  return false
}

const detectPackageManager = (dir: string): Project['packageManager'] => {
  if (fileExists(dir, 'pnpm-lock.yaml')) return 'pnpm'
  if (fileExists(dir, 'yarn.lock')) return 'yarn'
  if (fileExists(dir, 'package-lock.json')) return 'npm'
  if (fileExists(dir, 'bun.lockb')) return 'bun'
  return 'unknown'
}

const detectTags = (dir: string, pkg: any): string[] => {
  const tags: string[] = []
  const deps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {})
  }
  if (
    deps['next'] ||
    fileExists(dir, 'next.config.js') ||
    fileExists(dir, 'next.config.ts') ||
    fileExists(dir, 'next.config.mjs') ||
    fileExists(dir, 'next.config.cjs')
  )
    tags.push('next')
  if (
    deps['@remix-run/dev'] ||
    deps['@remix-run/react'] ||
    fileExists(dir, 'remix.config.js') ||
    fileExists(dir, 'remix.config.ts') ||
    fileExists(dir, 'remix.config.mjs')
  )
    tags.push('remix')
  if (
    deps['@sveltejs/kit'] ||
    deps['svelte'] ||
    fileExists(dir, 'svelte.config.js') ||
    fileExists(dir, 'svelte.config.ts')
  )
    tags.push('svelte', 'sveltekit')
  if (deps['vue'] || deps['@vitejs/plugin-vue'] || fileExists(dir, 'vue.config.js'))
    tags.push('vue')
  if (
    deps['nuxt'] ||
    fileExists(dir, 'nuxt.config.js') ||
    fileExists(dir, 'nuxt.config.ts') ||
    fileExists(dir, 'nuxt.config.mjs')
  )
    tags.push('nuxt')
  if (
    deps['solid-js'] ||
    deps['solid-start'] ||
    deps['vite-plugin-solid'] ||
    fileExists(dir, 'solid.config.ts') ||
    fileExists(dir, 'solid.config.js')
  )
    tags.push('solid')
  if (
    deps['astro'] ||
    fileExists(dir, 'astro.config.ts') ||
    fileExists(dir, 'astro.config.mjs') ||
    fileExists(dir, 'astro.config.js')
  )
    tags.push('astro')
  if (deps['react'] || deps['react-dom']) tags.push('react')
  if (
    deps['vite'] ||
    fileExists(dir, 'vite.config.ts') ||
    fileExists(dir, 'vite.config.js') ||
    fileExists(dir, 'vite.config.mts') ||
    fileExists(dir, 'vite.config.mjs')
  )
    tags.push('vite')
  if (
    deps['webpack'] ||
    deps['webpack-dev-server'] ||
    fileExists(dir, 'webpack.config.js') ||
    fileExists(dir, 'webpack.config.ts')
  )
    tags.push('webpack')
  if (deps['parcel']) tags.push('parcel')
  return Array.from(new Set(tags))
}

const shouldIgnoreDir = (name: string) => {
  if (!name) return true
  const n = name.toLowerCase()
  if (n.startsWith('.') && n !== '.zenbu-buffer') return true
  if (n === 'node_modules') return true
  if (n === '.git') return true
  if (n === '.hg') return true
  if (n === '.svn') return true
  if (n === '.next') return true
  if (n === 'out') return true
  if (n === 'build') return true
  if (n === 'dist') return true
  if (n === '.turbo') return true
  if (n === '.cache') return true
  if (n === 'coverage') return true
  if (n === '.pnpm-store') return true
  if (n === '.yarn') return true
  return false
}

export const findProjectsBFS = async (
  startDir: string,
  opts?: { maxDepth?: number; concurrency?: number }
): Promise<Project[]> => {
  const root = resolve(startDir)
  const maxDepth = Math.max(0, opts?.maxDepth ?? DEFAULT_MAX_DEPTH)
  const concurrency = Math.max(1, opts?.concurrency ?? DEFAULT_CONCURRENCY)
  const results: Project[] = []
  const visited = new Set<string>()
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  let processed = 0

  debug(`Starting project search from ${root}`)
  debug(`Max depth: ${maxDepth}, Concurrency: ${concurrency}`)

  while (queue.length) {
    const depth = queue[0].depth
    const currentLevel: Array<{ dir: string; depth: number }> = []
    while (queue.length && queue[0].depth === depth) currentLevel.push(queue.shift()!)
    const nextLevel: Array<{ dir: string; depth: number }> = []

    debug(`Processing depth ${depth} with ${currentLevel.length} directories`)

    for (let i = 0; i < currentLevel.length; i += concurrency) {
      const slice = currentLevel.slice(i, i + concurrency)
      await Promise.all(
        slice.map(async ({ dir }) => {
          if (visited.has(dir)) return
          visited.add(dir)
          if (!(await isDir(dir))) return
          const pkgPath = join(dir, 'package.json')
          const hasPkg = existsSync(pkgPath)
          if (hasPkg) {
            const pkg = await readJson(pkgPath)
            const scripts = pkg?.scripts || {}
            if (typeof scripts?.dev === 'string' && scripts.dev.trim()) {
              const name = typeof pkg?.name === 'string' ? pkg.name : dir.split('/').pop() || dir
              const tags = detectTags(dir, pkg)
              if (FILTER_SKIP_EXAMPLE_DIRS && isExamplePath(dir)) {
                debug(`Skipping example directory: ${dir}`)
                return
              }
              if (FILTER_SKIP_UNTAGGED && tags.length === 0) {
                debug(`Skipping untagged project: ${dir}`)
                return
              }
              const project: Project = {
                path: dir,
                name,
                devScript: scripts.dev,
                packageManager: detectPackageManager(dir),
                workspaces: !!(pkg?.workspaces || existsSync(join(dir, 'pnpm-workspace.yaml'))),
                tags
              }
              results.push(project)
              debug(`Found project: ${name} at ${dir} (tags: ${tags.join(', ')})`)
            }
          }
          if (depth >= maxDepth) return
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
          for (const ent of entries) {
            if (!ent.isDirectory()) continue
            if (shouldIgnoreDir(ent.name)) continue
            const sub = join(dir, ent.name)
            nextLevel.push({ dir: sub, depth: depth + 1 })
          }
        })
      )
      processed += slice.length
      if (processed % YIELD_EVERY === 0) await delay(0)
    }

    for (const n of nextLevel) queue.push(n)
  }

  debug(`Found ${results.length} projects total`)
  return results
}

if (process.send) {
  const main = async () => {
    try {
      const dir = process.env.PROJECT_START_DIR || homedir()
      debug(`Running in process mode, starting from: ${dir}`)
      const projects = await findProjectsBFS(dir, {
        maxDepth: DEFAULT_MAX_DEPTH,
        concurrency: DEFAULT_CONCURRENCY
      })

      process.send!({ type: 'projects-found', projects })
      process.exit(0)
    } catch (error) {
      debug(`Error occurred: ${error instanceof Error ? error.message : String(error)}`)
      process.send!({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      process.exit(1)
    }
  }

  main()
} else {
  const main = async () => {
    try {
      const dir = process.env.PROJECT_START_DIR || homedir()
      debug(`Running in standalone mode, starting from: ${dir}`)
      debug(`Output file: ${DEFAULT_OUT}`)
      const projects = await findProjectsBFS(dir, {
        maxDepth: DEFAULT_MAX_DEPTH,
        concurrency: DEFAULT_CONCURRENCY
      })
      await writeFile(DEFAULT_OUT, JSON.stringify(projects, null, 2), 'utf8')
      debug(`Written ${projects.length} projects to ${DEFAULT_OUT}`)
    } catch (error) {
      debug(`Error occurred: ${error instanceof Error ? error.message : String(error)}`)
      await writeFile(DEFAULT_OUT, error instanceof Error ? error.message : String(error), 'utf8')
    }
  }

  main()
}
