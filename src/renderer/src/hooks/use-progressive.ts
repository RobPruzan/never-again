import React from 'react'

export function useProgressive<T>(items: T[], batchSize = 50, intervalMs = 200): T[] {
  const [count, setCount] = React.useState(() => Math.min(batchSize, items.length))

  // Reset the counter when the source items array changes
  React.useEffect(() => {
    setCount(Math.min(batchSize, items.length))
  }, [items, batchSize])

  React.useEffect(() => {
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

  return React.useMemo(() => items.slice(0, count), [items, count])
}
