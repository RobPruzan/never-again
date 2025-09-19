import { readFile } from 'fs/promises'

type StitchedItem = { order: number; time: number; meta?: string }

const LOG_PATH = '/Users/robby/ide/src/main/stitched-lop.jsonl'

function isStitchedItem(x: any): x is StitchedItem {
  return x && typeof x === 'object' && typeof x.order === 'number' && typeof x.time === 'number'
}

const main = async () => {
  let raw: string
  try {
    raw = await readFile(LOG_PATH, 'utf8')
  } catch (e) {
    console.error('Failed to read stitched log at', LOG_PATH)
    return
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const entries: any[] = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    } catch {}
  }

  // First pass: collect all markers with timestamps
  type Marker = { kind: 'MARKER START' | 'MARKER END'; time: number }
  const markers: Marker[] = []
  const nonMarkers: any[] = []

  for (const entry of entries) {
    if (entry === 'MARKER START') {
      // Legacy format - use current time as fallback
      markers.push({ kind: 'MARKER START', time: Date.now() })
    } else if (entry === 'MARKER END') {
      // Legacy format - use current time as fallback
      markers.push({ kind: 'MARKER END', time: Date.now() })
    } else if (entry && typeof entry === 'object' && entry.kind === 'MARKER START') {
      markers.push({ kind: 'MARKER START', time: entry.time })
    } else if (entry && typeof entry === 'object' && entry.kind === 'MARKER END') {
      markers.push({ kind: 'MARKER END', time: entry.time })
    } else {
      nonMarkers.push(entry)
    }
  }

  // Second pass: group items by timestamp ranges between START/END markers
  type Group = { items: any[]; startTime: number; endTime: number }
  const groups: Group[] = []

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    if (marker.kind !== 'MARKER START') continue

    // Find the corresponding END marker
    let endMarker: Marker | null = null
    for (let j = i + 1; j < markers.length; j++) {
      if (markers[j].kind === 'MARKER END') {
        endMarker = markers[j]
        break
      }
    }

    if (!endMarker) continue

    const startTime = marker.time
    const endTime = endMarker.time

    // Collect all items that fall within this time range
    const groupItems = nonMarkers.filter(
      (item) =>
        item && typeof item.time === 'number' && item.time >= startTime && item.time <= endTime
    )

    groups.push({ items: groupItems, startTime, endTime })
  }

  if (groups.length === 0) {
    console.log('0 groups found. Nothing to report.')
    return
  }

  const lastGroupIndex = groups.length - 1
  const last = groups[lastGroupIndex]

  const earliestByOrder = new Map<number, StitchedItem>()
  for (const e of last.items) {
    if (!isStitchedItem(e)) continue
    const prev = earliestByOrder.get(e.order)
    if (!prev || e.time < prev.time) earliestByOrder.set(e.order, e)
  }

  const sorted = [...earliestByOrder.values()].sort((a, b) => a.order - b.order)

  console.log(`\n📊 Performance Report`)
  console.log(`═══════════════════════════════════════════════════════`)
  console.log(
    `Found ${groups.length} group${groups.length === 1 ? '' : 's'} • Analyzing group #${groups.length}`
  )
  console.log(``)

  if (sorted.length === 0) {
    console.log('❌ No timing data in the last group.')
    return
  }

  const start = sorted[0]
  const end = sorted[sorted.length - 1]
  const totalMs = end.time - start.time

  // Format timing steps
  console.log(`🚀 ${start.meta || 'Step 0'}`)
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i]
    const prev = sorted[i - 1]
    const delta = curr.time - prev.time
    const arrow = '   ↓'
    const timing = `+${delta}ms`
    const step = `${curr.meta || `Step ${curr.order}`}`
    console.log(`${arrow} ${step.padEnd(30)} ${timing.padStart(8)}`)
  }

  console.log(``)
  console.log(`⏱️  Total Duration: ${totalMs}ms`)
  console.log(`📈 Steps: ${start.order} → ${end.order} (${sorted.length} events)`)
  console.log(`═══════════════════════════════════════════════════════`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

export {}
