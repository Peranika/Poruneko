// Actions of a bookmark's download box. The Bookmarks screen cards and the gallery page use the same logic.
import { api, isLocalKey } from './api'
import { errorText, t } from './i18n'
import type { Bookmark } from './types'

/**
 * The download action to show now (null if none)
 * - retryRange / buildRange: build a page range bookmark's cbz (retry after an error / build one registered without saving)
 * - pause / download: pause / start or resume a normal work's download
 */
export type DownloadAction = 'retryRange' | 'buildRange' | 'pause' | 'download'

export const DOWNLOAD_ACTION_ICON: Record<DownloadAction, string> = {
  retryRange: 'refresh',
  buildRange: 'download',
  pause: 'pause',
  download: 'download'
}

export function downloadAction(b: Bookmark): DownloadAction | null {
  const s = b.download.status
  if (isLocalKey(b.key)) return s === 'error' ? 'retryRange' : s === 'none' ? 'buildRange' : null
  if (s === 'downloading' || s === 'queued') return 'pause'
  return s !== 'done' ? 'download' : null
}

/** Run the action (for page range cbz builds, the reason it could not start goes to onError) */
export function runDownloadAction(b: Bookmark, action: DownloadAction, onError: (msg: string) => void): void {
  switch (action) {
    case 'pause':
      void api.pauseDownload(b.key)
      break
    case 'download':
      void api.startDownload(b.key)
      break
    default:
      api.startDownload(b.key).catch((e) => onError(errorText(e)))
  }
}

/** Whether a page range bookmark has a cbz (including building and failed). Removing it deletes the cbz too */
export const hasRangeFile = (b: Bookmark): boolean => isLocalKey(b.key) && b.download.status !== 'none'

/** Whether there is a save location (the cbz or an in-progress work dir). "Show in folder" is hidden if not downloaded */
export const hasSavedFiles = (b: Bookmark): boolean => b.download.status !== 'none'

/** Whether the downloaded file can be deleted (page range bookmarks only once built; deleting turns them back into links) */
export const canDeleteFiles = (b: Bookmark): boolean => (isLocalKey(b.key) ? b.download.status === 'done' : b.download.status !== 'none')

export const DELETE_FILES_CONFIRM = {
  range: t('bookmarkActions.deleteRangeConfirm'),
  normal: t('bookmarkActions.deleteConfirm')
}

export const UNBOOKMARK_RANGE_CONFIRM = t('bookmarkActions.unbookmarkRangeConfirm')
