import { useEffect, useMemo, useState } from "react"

export function useProgressive<T>(items: T[], batchSize = 50, intervalMs = 200): T[] {
  const [count, setCount] = useState(() => Math.min(batchSize, items.length))

  useEffect(() => {
    setCount(Math.min(batchSize, items.length))
  }, [items, batchSize])

  useEffect(() => {
    if (count >= items.length) return

    const id = setInterval(() => {
      setCount((prev) => {
        const next = Math.min(prev + batchSize, items.length)
        if (next >= items.length) {
          clearInterval(id)
        }
        return next
      })
    }, intervalMs)

    return () => clearInterval(id)
  }, [count, items.length, batchSize, intervalMs])

  return useMemo(() => items.slice(0, count), [items, count])
}
