import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { errorText, t } from '../i18n'
import type { GallerySummary, ListResult } from '../types'
import { cachedPage, storePage } from '../workSequence'
import { Pagination } from './Pagination'

/*
 * A paged list. Scrolling loads the next page automatically, stacking pages vertically with a divider and page number.
 *
 * Memory: pages far from the screen are replaced by empty boxes of the same height, freeing images and elements
 * (the list data is small, so it is kept and redrawn at once when coming back).
 */

/** Pages farther from the screen than this are replaced by empty boxes */
const KEEP_MARGIN = '2500px 0px'
/** Load the next page when the end of the list is this close */
const LOAD_AHEAD = '0px 0px 1500px 0px'

interface SavedState {
  key: string
  first: number
  last: number
  /** The page that was shown */
  current: number
  scroll: number
}

interface Props<R extends ListResult> {
  /** Query (other than the page number). Reloads from the start when it changes */
  resetKey: string
  startPage: number
  load(page: number): Promise<R>
  /** If false, show one page at a time with page navigation */
  infinite: boolean
  layout: 'list' | 'grid'
  /** page / result are the page the work is on (passed for next/previous work when opening it) */
  renderItem(s: GallerySummary, page: number, result: ListResult): ReactNode
  onResult?(r: R): void
  /** Show again from the given page (page navigation) */
  onJump(page: number): void
  scroller: RefObject<HTMLDivElement | null>
  /** Saved state of the history entry (restores the loaded range and scroll position on going back) */
  entryState: Record<string, unknown>
  emptyText: string
}

export function PagedResults<R extends ListResult>(props: Props<R>) {
  const { resetKey, startPage, load, infinite, layout, renderItem, onResult, onJump, scroller, entryState, emptyText } = props
  const fresh = (p: number) => cachedPage<R>(resetKey, p)

  // when coming back, restore from the previously loaded range if it is still cached (even if expired).
  // Otherwise reload from the page that was shown
  const saved = entryState.paged as SavedState | undefined
  const restore =
    saved?.key === resetKey && (infinite || (saved.first === startPage && saved.last === startPage)) && rangeCached(saved.first, saved.last)
      ? saved
      : undefined
  const begin = restore?.first ?? (infinite && saved?.key === resetKey && saved.current ? saved.current : startPage)
  function rangeCached(a: number, b: number) {
    for (let p = a; p <= b; p++) if (!cachedPage(resetKey, p, true)) return false
    return true
  }

  const [first, setFirst] = useState(begin)
  const [last, setLast] = useState(restore?.last ?? begin)
  const [results, setResults] = useState<Record<number, R>>(() => {
    const out: Record<number, R> = {}
    for (let p = begin; p <= (restore?.last ?? begin); p++) {
      const r = restore ? cachedPage<R>(resetKey, p, true) : fresh(p)
      if (r) out[p] = r
    }
    return out
  })
  const [errors, setErrors] = useState<Record<number, string>>({})
  const loading = useRef(new Set<number>())
  const [current, setCurrent] = useState(first)

  const anyResult = results[first] ?? Object.values(results)[0]
  const perPage = anyResult?.perPage ?? 25
  const totalPages = anyResult ? Math.max(1, Math.ceil(anyResult.total / perPage)) : undefined

  const loadPage = useCallback(
    (p: number) => {
      if (loading.current.has(p)) return
      const hit = fresh(p)
      if (hit) {
        setResults((rs) => (rs[p] ? rs : { ...rs, [p]: hit }))
        return
      }
      loading.current.add(p)
      setErrors(({ [p]: _, ...rest }) => rest)
      load(p)
        .then((r) => {
          storePage(resetKey, p, r)
          setResults((rs) => ({ ...rs, [p]: r }))
          onResult?.(r)
        })
        .catch((e) => setErrors((es) => ({ ...es, [p]: errorText(e) })))
        .finally(() => loading.current.delete(p))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey, load, onResult]
  )

  // the first page (and the restored range)
  useEffect(() => {
    for (let p = first; p <= last; p++) {
      if (!results[p]) loadPage(p)
      else if (p === first) onResult?.(results[p])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // to the restored scroll position (to the top when the query changed)
  // the parent scroll area's ref is not attached yet at this point, so use our own parent element
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scroller.current ?? root.current?.parentElement
    if (el) el.scrollTop = restore?.scroll ?? 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // load the next page when the end of the list gets close
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!infinite || !sentinel.current || !scroller.current) return
    const io = new IntersectionObserver(
      (es) => {
        if (!es[0].isIntersecting || !results[last] || errors[last]) return
        if (totalPages !== undefined && last >= totalPages) return
        setLast(last + 1)
        loadPage(last + 1)
      },
      { root: scroller.current, rootMargin: LOAD_AHEAD }
    )
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [infinite, last, results, errors, totalPages, loadPage, scroller])

  // prepend the previous page
  // (remember where the viewed page is on screen and return there each time a loading box or result arrives)
  const anchor = useRef<{ page: number; top: number } | null>(null)
  const sectionTop = (p: number) => root.current?.querySelector(`[data-page="${p}"]`)?.getBoundingClientRect().top
  const loadPrev = () => {
    if (first <= 1) return
    const top = sectionTop(first)
    anchor.current = top === undefined ? null : { page: first, top }
    setFirst(first - 1)
    loadPage(first - 1)
  }
  useLayoutEffect(() => {
    const el = scroller.current
    const a = anchor.current
    if (!el || !a) return
    const top = sectionTop(a.page)
    if (top !== undefined) el.scrollTop += top - a.top
    if (results[first]) anchor.current = null
  }, [first, results, scroller])

  // find the page being shown and save the range and scroll position for going back
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      const top = el.scrollTop + 80
      let cur = first
      for (const s of el.querySelectorAll<HTMLElement>('[data-page]')) {
        if (s.offsetTop <= top) cur = Number(s.dataset.page)
      }
      setCurrent(cur)
      entryState.paged = { key: resetKey, first, last, current: cur, scroll: el.scrollTop } satisfies SavedState
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [first, last, resetKey, scroller, entryState])

  if (anyResult && anyResult.total === 0) return <div className="center muted">{emptyText}</div>
  if (!anyResult && errors[first]) {
    return (
      <div className="center error">
        <p>{t('paged.loadFailed')}</p>
        <code>{errors[first]}</code>
        <button className="btn" onClick={() => loadPage(first)}>
          {t('common.retry')}
        </button>
      </div>
    )
  }

  const pages: number[] = []
  for (let p = first; p <= last; p++) pages.push(p)

  return (
    <div ref={root}>
      {anyResult && (
        <div className="result-info">
          <span>
            {t('common.items', { n: anyResult.total.toLocaleString() })}
            {totalPages && t('paged.pageOf', { page: infinite ? t('paged.showing', { page: current }) : startPage, total: totalPages })}
          </span>
          {infinite && totalPages && totalPages > 1 && <JumpInput pages={totalPages} onJump={onJump} />}
        </div>
      )}
      {infinite && first > 1 && (
        <div className="load-prev">
          <button className="btn" onClick={loadPrev}>
            {t('paged.loadPrev', { page: first - 1 })}
          </button>
        </div>
      )}
      {pages.map((p) => (
        <PageSection
          key={p}
          page={p}
          totalPages={totalPages}
          showDivider={infinite && !(p === first && p === 1)}
          result={results[p]}
          error={errors[p]}
          onRetry={() => loadPage(p)}
          layout={layout}
          renderItem={renderItem}
          scroller={scroller}
        />
      ))}
      {infinite ? (
        <div ref={sentinel} className="page-end">
          {totalPages !== undefined && last >= totalPages && results[last] && <span className="muted small">{t('paged.lastPage')}</span>}
        </div>
      ) : (
        totalPages && <Pagination page={startPage} pages={totalPages} onPage={onJump} />
      )}
    </div>
  )
}

/** One page. When far from the screen it becomes an empty box of the same height, freeing images and elements */
function PageSection({
  page,
  totalPages,
  showDivider,
  result,
  error,
  onRetry,
  layout,
  renderItem,
  scroller
}: {
  page: number
  totalPages?: number
  showDivider: boolean
  result?: ListResult
  error?: string
  onRetry(): void
  layout: 'list' | 'grid'
  renderItem(s: GallerySummary, page: number, result: ListResult): ReactNode
  scroller: RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(true)
  const height = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el || !scroller.current) return
    const io = new IntersectionObserver((es) => setNear(es[0].isIntersecting), { root: scroller.current, rootMargin: KEEP_MARGIN })
    io.observe(el)
    const ro = new ResizeObserver(() => {
      if (el.firstElementChild?.classList.contains('page-body')) height.current = el.offsetHeight
    })
    ro.observe(el)
    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [scroller])

  const placeholder = !near && result && height.current > 0
  // every work on this page was hidden by the filters (only the divider shows "no matches")
  const allHidden = !!result && result.items.length === 0 && result.hidden > 0
  return (
    <section ref={ref} className="page-section" data-page={page} style={placeholder ? { height: height.current } : undefined}>
      {!placeholder && (
        <div className="page-body">
          {showDivider && (
            <div className="page-divider">
              <span>
                {t('paged.divider', { page, total: totalPages ? t('paged.dividerTotal', { total: totalPages }) : '' })}
                {allHidden && t('paged.noneMatched')}
              </span>
            </div>
          )}
          {error ? (
            <div className="center error small">
              <p>{t('paged.pageLoadFailed', { page })}</p>
              <button className="btn small" onClick={onRetry}>
                {t('common.retry')}
              </button>
            </div>
          ) : !result ? (
            <div className={`results ${layout}`}>
              {Array.from({ length: layout === 'grid' ? 10 : 4 }, (_, i) => (
                <div key={i} className={`skeleton ${layout === 'grid' ? 'card' : 'row'}`} />
              ))}
            </div>
          ) : (
            <>
              {result.failed.length > 0 && <div className="result-info muted">{t('paged.failedItems', { n: result.failed.length })}</div>}
              {allHidden && !showDivider && (
                <div className="page-filtered muted small">{t('paged.allHidden', { n: result.hidden })}</div>
              )}
              {result.items.length > 0 && <div className={`results ${layout}`}>{result.items.map((s) => renderItem(s, page, result))}</div>}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function JumpInput({ pages, onJump }: { pages: number; onJump(p: number): void }) {
  const [v, setV] = useState('')
  return (
    <input
      className="jump"
      placeholder={t('paged.jump')}
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v) {
          onJump(Math.min(pages, Math.max(1, Number(v))))
          setV('')
        }
      }}
    />
  )
}
