import { useState, type DragEvent } from 'react'

/**
 * Reordering by drag and drop among a group of items (the sites in the sidebar, the screens of one site). kind keeps
 * groups apart: an item is dropped only among items of its own kind. Where it would land is marked on the item it is
 * over (before or after it, by the pointer's half: top / bottom, or left / right with horizontal)
 */
export function useDragReorder(kind: string, ids: string[], onReorder: (ids: string[]) => void, horizontal = false) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)
  const type = `application/x-poruneko-${kind}`

  const sideOf = (e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2
  }

  /** The props for one item (spread onto the element that is dragged and dropped on) */
  const itemProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData(type, id)
      e.dataTransfer.effectAllowed = 'move'
      e.stopPropagation()
      setDragging(id)
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(type)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const after = sideOf(e)
      if (over?.id !== id || over.after !== after) setOver({ id, after })
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null) && over?.id === id) setOver(null)
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      const from = e.dataTransfer.getData(type)
      if (!from) return
      e.preventDefault()
      e.stopPropagation()
      const after = sideOf(e)
      setOver(null)
      setDragging(null)
      if (from === id) return
      const rest = ids.filter((x) => x !== from)
      const at = rest.indexOf(id) + (after ? 1 : 0)
      onReorder([...rest.slice(0, at), from, ...rest.slice(at)])
    },
    onDragEnd: () => {
      setOver(null)
      setDragging(null)
    }
  })

  /** The class marking an item as dragged or where the dragged one would land */
  const itemClass = (id: string): string =>
    dragging === id ? 'dragging' : over?.id === id && dragging !== null ? (over.after ? 'drop-after' : 'drop-before') : ''

  return { itemProps, itemClass }
}

/** ids in the order chosen (those not in it keep their own order after the chosen ones) */
export function inOrder<T>(items: T[], idOf: (x: T) => string, order: string[] | undefined): T[] {
  if (!order?.length) return items
  const rank = new Map(order.map((id, i) => [id, i]))
  return items
    .map((x, i) => ({ x, i, r: rank.get(idOf(x)) }))
    .sort((a, b) => (a.r ?? order.length + a.i) - (b.r ?? order.length + b.i))
    .map((e) => e.x)
}
