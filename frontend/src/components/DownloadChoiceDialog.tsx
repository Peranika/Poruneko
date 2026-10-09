import { useEffect, useState } from 'react'
import { api } from '../api'
import { errorText, t } from '../i18n'
import type { Bookmark, DownloadChoice, DownloadOptions } from '../types'
import { Modal } from './Modal'
import { formatBytes } from './viewer/usePredecode'

/*
 * Choosing what to download of a work with attachments: its images and videos, and the archives among its
 * attachments (their images and videos are added after the pages, so the saved work shows them). One dialog for the
 * whole app (DownloadChoiceHost), asked for from anywhere a download starts
 */

interface Ask {
  options: DownloadOptions
  /** What is kept now (choosing again for a downloaded work); absent for a new download */
  current?: DownloadChoice
  resolve(choice: DownloadChoice | null): void
}

let show: ((ask: Ask) => void) | null = null

/** Asks what to download (null when cancelled) */
const askDownloadChoice = (options: DownloadOptions, current?: DownloadChoice): Promise<DownloadChoice | null> =>
  new Promise((resolve) => (show ? show({ options, current, resolve }) : resolve(null)))

/**
 * Asks what to download of a work: the choice, 'none' when it has no archives to choose among, null when cancelled
 * (or the work could not be read: told to onError). current: what is kept now (choosing again for a downloaded work)
 */
async function askFor(key: string, onError: (msg: string) => void, current?: DownloadChoice): Promise<DownloadChoice | 'none' | null> {
  let options: DownloadOptions
  try {
    options = await api.downloadOptions(key)
  } catch (e) {
    onError(t('downloadChoice.failed', { error: errorText(e) }))
    return null
  }
  return options.attachments.length ? askDownloadChoice(options, current) : 'none'
}

/** Starts a download, asking first what of it when the work has archives among its attachments */
export async function downloadChoosing(key: string, onError: (msg: string) => void): Promise<void> {
  const c = await askFor(key, onError)
  const run = c === 'none' ? api.startDownload(key) : c && api.startDownloadWith(key, c.pages, c.attachments ?? [])
  await run?.catch((e) => onError(errorText(e)))
}

/** Chooses again what to keep of a downloaded work (its cbz is built again with it) */
export async function rechooseDownload(b: Bookmark, onError: (msg: string) => void): Promise<void> {
  const c = await askFor(b.key, onError, b.downloadChoice ?? { pages: true })
  if (c === 'none') return onError(t('downloadChoice.noAttachments'))
  if (c) await api.changeDownloadChoice(b.key, c.pages, c.attachments ?? []).catch((e) => onError(errorText(e)))
}

/** The dialog, put once in the app */
export function DownloadChoiceHost() {
  const [ask, setAsk] = useState<Ask | null>(null)
  const [pages, setPages] = useState(true)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  useEffect(() => {
    show = (a) => {
      setAsk(a)
      // choosing again starts from what is kept now; a new download has the archives checked (what the dialog is for)
      setPages(a.current ? a.current.pages : a.options.pages > 0)
      setChosen(new Set(a.current ? (a.current.attachments ?? []) : a.options.attachments.map((x) => x.index)))
    }
    return () => {
      show = null
    }
  }, [])
  if (!ask) return null
  const close = (choice: DownloadChoice | null) => {
    ask.resolve(choice)
    setAsk(null)
  }
  const toggle = (i: number) =>
    setChosen((s) => {
      const n = new Set(s)
      if (!n.delete(i)) n.add(i)
      return n
    })
  const nothing = !pages && chosen.size === 0
  return (
    <Modal
      title={ask.current ? t('downloadChoice.rechooseTitle') : t('downloadChoice.title')}
      onClose={() => close(null)}
      className="download-choice"
      footer={
        <>
          <button className="btn ghost" onClick={() => close(null)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={nothing}
            onClick={() => close({ pages, attachments: ask.options.attachments.map((x) => x.index).filter((i) => chosen.has(i)) })}
          >
            {ask.current ? t('downloadChoice.rechoose') : t('downloadChoice.start')}
          </button>
        </>
      }
    >
      <label className="choice-row">
        <input type="checkbox" checked={pages} disabled={ask.options.pages === 0} onChange={(e) => setPages(e.target.checked)} />
        <span>{t('downloadChoice.pages', { n: ask.options.pages })}</span>
      </label>
      {ask.options.attachments.map((a) => (
        <label key={a.index} className="choice-row">
          <input type="checkbox" checked={chosen.has(a.index)} onChange={() => toggle(a.index)} />
          <span className="choice-name">{a.name}</span>
          {a.size ? <small className="muted">{formatBytes(a.size)}</small> : null}
        </label>
      ))}
      <small className="muted">{t('downloadChoice.hint')}</small>
      {ask.current && <small className="muted">{t('downloadChoice.rechooseHint')}</small>}
    </Modal>
  )
}
