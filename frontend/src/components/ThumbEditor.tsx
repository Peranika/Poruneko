import { useEffect, useRef, useState } from 'react'
import { api, imageUrl } from '../api'
import { errorText, t } from '../i18n'
import { useApp } from '../state'
import type { Bookmark, ThumbSpec } from '../types'
import { Icon } from './Icon'
import { Modal } from './Modal'

/** Aspect ratio of card thumbnails (width / height; same as .thumb in style.css) */
const CARD_RATIO = 0.7
/** Size of the saved image (enough not to look rough at the max card width of 300px on high-DPI displays) */
const OUT_W = 420
const OUT_H = Math.round(OUT_W / CARD_RATIO)
/** Max display size of the image being edited */
const VIEW_MAX_W = 520
const VIEW_MAX_H = 560
/** Min frame size (fraction of the page) */
const MIN_SIZE = 0.05

/** Area (fraction of the page width and height) */
interface Rect {
  x: number
  y: number
  w: number
  h: number
}
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

/**
 * The largest size within maxW x maxH (fractions of the page) whose width / height in pixels is CARD_RATIO
 * (fit the width, or the height if it overflows)
 */
function cardSize(natW: number, natH: number, maxW: number, maxH: number): { w: number; h: number } {
  const h = (maxW * natW) / (CARD_RATIO * natH)
  return h <= maxH ? { w: maxW, h } : { w: (maxH * CARD_RATIO * natH) / natW, h: maxH }
}

/** The largest area matching the card aspect ratio that fits the page (centered) */
function fittedRect(natW: number, natH: number, around?: Rect): Rect {
  const cx = around ? around.x + around.w / 2 : 0.5
  const cy = around ? around.y + around.h / 2 : 0.5
  const { w, h } = cardSize(natW, natH, around ? around.w : 1, around ? around.h : 1)
  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h })
}

function clampRect(r: Rect): Rect {
  const w = Math.min(1, Math.max(MIN_SIZE, r.w))
  const h = Math.min(1, Math.max(MIN_SIZE, r.h))
  return { x: Math.min(1 - w, Math.max(0, r.x)), y: Math.min(1 - h, Math.max(0, r.y)), w, h }
}

/** Crop the area into a card-sized image (when the aspect ratio is free, shrink the whole area to fit and fill the margins) */
function render(img: HTMLImageElement, r: Rect, free: boolean, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const cw = canvas.width
  const ch = canvas.height
  const sx = r.x * img.naturalWidth
  const sy = r.y * img.naturalHeight
  const sw = r.w * img.naturalWidth
  const sh = r.h * img.naturalHeight
  ctx.fillStyle = '#1b1f2a' // background of card thumbnails (--bg-2)
  ctx.fillRect(0, 0, cw, ch)
  ctx.imageSmoothingQuality = 'high'
  if (!free) {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch)
    return
  }
  const scale = Math.min(cw / sw, ch / sh)
  const dw = sw * scale
  const dh = sh * scale
  ctx.drawImage(img, sx, sy, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
}

const toBase64 = (canvas: HTMLCanvasElement): Promise<string> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('toBlob failed'))
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]*,/, ''))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(blob)
      },
      'image/webp',
      0.9
    )
  )

/**
 * Dialog to choose the page and area for the thumbnail.
 * Drag the frame to move it and its corners to resize it. The aspect ratio matches the card by default; unchecking frees it.
 */
export function ThumbEditor({
  b,
  pageCount,
  initialPage,
  onClose
}: {
  b: Bookmark
  pageCount: number
  initialPage: number
  onClose(): void
}) {
  const { toast } = useApp()
  const spec = b.customThumb
  const [page, setPage] = useState(spec?.page ?? Math.min(Math.max(0, initialPage), Math.max(0, pageCount - 1)))
  const [free, setFree] = useState(spec?.free ?? false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ handle: Handle; px: number; py: number; start: Rect } | null>(null)

  // display size (fit in the box keeping the image's aspect ratio)
  const scale = nat ? Math.min(VIEW_MAX_W / nat.w, VIEW_MAX_H / nat.h) : 1
  const viewW = nat ? nat.w * scale : VIEW_MAX_W
  const viewH = nat ? nat.h * scale : VIEW_MAX_H

  const onLoad = () => {
    const el = img.current!
    const n = { w: el.naturalWidth, h: el.naturalHeight }
    setNat(n)
    // on the saved page start from the saved area, otherwise from the default area
    if (spec && spec.page === page) setRect({ x: spec.x, y: spec.y, w: spec.w, h: spec.h })
    else setRect(free ? { x: 0, y: 0, w: 1, h: 1 } : fittedRect(n.w, n.h))
  }

  // preview of the result
  useEffect(() => {
    if (rect && img.current?.complete && preview.current) render(img.current, rect, free, preview.current)
  }, [rect, free])

  const toggleFree = (on: boolean) => {
    setFree(on)
    if (!on && rect && nat) setRect(fittedRect(nat.w, nat.h, rect))
  }

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    if (!rect) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { handle, px: e.clientX, py: e.clientY, start: rect }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !nat) return
    const dx = (e.clientX - d.px) / viewW
    const dy = (e.clientY - d.py) / viewH
    const s = d.start
    if (d.handle === 'move') return setRect(clampRect({ ...s, x: s.x + dx, y: s.y + dy }))
    // fix the corner opposite the one being dragged
    const west = d.handle === 'nw' || d.handle === 'sw'
    const north = d.handle === 'nw' || d.handle === 'ne'
    const ax = west ? s.x + s.w : s.x
    const ay = north ? s.y + s.h : s.y
    let w = Math.max(MIN_SIZE, west ? s.w - dx : s.w + dx)
    let h = Math.max(MIN_SIZE, north ? s.h - dy : s.h + dy)
    // keep it between the fixed corner and the page edges
    const maxW = west ? ax : 1 - ax
    const maxH = north ? ay : 1 - ay
    w = Math.min(w, maxW)
    h = Math.min(h, maxH)
    // keep the aspect ratio
    if (!free) ({ w, h } = cardSize(nat.w, nat.h, w, maxH))
    setRect({ x: west ? ax - w : ax, y: north ? ay - h : ay, w, h })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const save = async () => {
    if (!rect || !img.current) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUT_W
      canvas.height = OUT_H
      render(img.current, rect, free, canvas)
      const data = await toBase64(canvas)
      const next: ThumbSpec = { page, ...rect, free, updatedAt: 0 }
      await api.setCustomThumb(b.key, next, data)
      toast(t('thumb.saved'))
      onClose()
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const reset = async () => {
    try {
      await api.clearCustomThumb(b.key)
      toast(t('thumb.reset'))
      onClose()
    } catch (e) {
      toast(errorText(e))
    }
  }

  const go = (p: number) => {
    const next = Math.min(pageCount - 1, Math.max(0, p))
    if (next === page) return
    setRect(null)
    setNat(null)
    setPage(next)
  }

  return (
    <Modal
      title={t('thumb.title')}
      onClose={onClose}
      className="thumb-editor"
      bodyClassName="thumb-editor-body"
      footer={
        <>
          {spec && (
            <button className="btn ghost" onClick={reset}>
              {t('thumb.resetButton')}
            </button>
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={save} disabled={busy || !rect}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="thumb-editor-stage" style={{ width: viewW, height: viewH }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <img
          ref={img}
          key={page}
          src={imageUrl(b.key, page)}
          alt=""
          draggable={false}
          onLoad={onLoad}
          style={{ width: viewW, height: viewH }}
        />
        {!nat && (
          <div className="center">
            <div className="spinner" />
          </div>
        )}
        {rect && nat && (
          <div
            className="thumb-crop"
            style={{ left: rect.x * viewW, top: rect.y * viewH, width: rect.w * viewW, height: rect.h * viewH }}
            onPointerDown={onPointerDown('move')}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
              <span key={h} className={`thumb-handle ${h}`} onPointerDown={onPointerDown(h)} />
            ))}
          </div>
        )}
      </div>
      <div className="thumb-editor-side">
        <div className="thumb-pager">
          <button className="icon-btn small" onClick={() => go(page - 1)} disabled={page === 0} title={t('thumb.prevPage')}>
            <Icon name="back" size={14} />
          </button>
          <input type="number" min={1} max={pageCount} value={page + 1} onChange={(e) => go((Number(e.target.value) || 1) - 1)} />
          <span className="muted small">/ {pageCount}</span>
          <button className="icon-btn small" onClick={() => go(page + 1)} disabled={page >= pageCount - 1} title={t('thumb.nextPage')}>
            <Icon name="forward" size={14} />
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={!free} onChange={(e) => toggleFree(!e.target.checked)} />
          {t('thumb.lockRatio')}
        </label>
        <div className="muted small">{free ? t('thumb.freeHint') : t('thumb.lockHint')}</div>
        <div className="thumb-preview">
          <canvas ref={preview} width={OUT_W / 2} height={OUT_H / 2} />
        </div>
      </div>
    </Modal>
  )
}
