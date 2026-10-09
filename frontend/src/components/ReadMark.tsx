import { t } from '../i18n'
import { useReadState } from '../reads'

// How far a work was read, on its card: a bar along the bottom of the thumbnail and a short label ("Read" or
// "12/30"); read works are shown dimmer (useIsRead)

/** Whether a work was read to its end (or marked read), following its changes */
export const useIsRead = (key: string): boolean => !!useReadState(key)?.read

/** The short label: "Read", or the page it was left at of how many (nothing when never opened or at its start) */
export function ReadLabel({ k, pill }: { k: string; pill?: boolean }) {
  const r = useReadState(k)
  if (!r || (!r.read && (r.page <= 0 || !r.pages))) return null
  const text = r.read ? t('read.read') : `${r.page + 1}/${r.pages}`
  const title = r.read ? t('read.readTitle') : t('read.progressTitle', { page: r.page + 1, pages: r.pages })
  return (
    <span className={`read-label ${r.read ? 'done' : ''} ${pill ? 'pill' : ''}`} title={title}>
      {text}
    </span>
  )
}

/** The bar along the bottom of a thumbnail: how far the work was read (full once read) */
export function ReadBar({ k }: { k: string }) {
  const r = useReadState(k)
  if (!r || (!r.read && (r.page <= 0 || !r.pages))) return null
  const share = r.read ? 1 : (r.page + 1) / r.pages
  return (
    <div className={`read-bar ${r.read ? 'done' : ''}`}>
      <span style={{ width: `${Math.round(share * 100)}%` }} />
    </div>
  )
}
