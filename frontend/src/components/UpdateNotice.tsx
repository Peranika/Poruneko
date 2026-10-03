import { useEffect, useState } from 'react'
import { api } from '../api'
import { errorText, t } from '../i18n'
import { useApp } from '../state'
import { saveSkippedVersion } from '../storage'
import type { UpdateRelease } from '../types'
import { Icon } from './Icon'
import { Modal } from './Modal'

/** Release notes as plain text (without HTML comments such as the hidden heading, or anchors like <a id="japanese"></a>) */
const plainNotes = (notes: string): string =>
  notes
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<a id="[^"]*"><\/a>\s*/g, '')
    .trim()

/** Notice of a newer version (bottom right). "Update" downloads it, swaps it in and restarts */
export function UpdateNotice({ release, onClose }: { release: UpdateRelease; onClose(): void }) {
  const { toast } = useApp()
  const [notes, setNotes] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => api.onUpdateProgress(setProgress), [])

  const install = async () => {
    setProgress({ done: 0, total: 0 })
    try {
      await api.installUpdate() // the app restarts on success
    } catch (e) {
      setProgress(null)
      toast(errorText(e))
    }
  }
  const skip = () => {
    saveSkippedVersion(release.version)
    onClose()
  }
  const percent = progress && progress.total > 0 ? Math.floor((progress.done / progress.total) * 100) : null

  return (
    <>
      <div className="update-notice">
        <div className="update-notice-head">
          <Icon name="download" size={16} />
          <strong>{t('update.available', { version: release.version })}</strong>
          {!progress && (
            <button className="icon-btn small" title={t('update.later')} onClick={onClose}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        {progress ? (
          <div className="update-progress">
            <span className="muted small">{percent === null ? t('update.preparing') : t('update.downloading', { percent })}</span>
            <div className="bar">
              <div style={{ width: `${percent ?? 0}%` }} />
            </div>
          </div>
        ) : (
          <div className="btn-row">
            {release.canInstall ? (
              <button className="btn primary small" onClick={install}>
                {t('update.install')}
              </button>
            ) : (
              <button className="btn primary small" onClick={() => api.openExternal(release.url)}>
                {t('update.openGitHub')}
              </button>
            )}
            <button className="btn small" onClick={() => setNotes(true)}>
              {t('update.notes')}
            </button>
            <button className="btn ghost small" onClick={skip} title={t('update.skipTitle')}>
              {t('update.skip')}
            </button>
          </div>
        )}
      </div>
      {notes && <ReleaseNotes release={release} onClose={() => setNotes(false)} />}
    </>
  )
}

function ReleaseNotes({ release, onClose }: { release: UpdateRelease; onClose(): void }) {
  return (
    <Modal
      title={`Poruneko ${release.version}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => api.openExternal(release.url)}>
            <Icon name="external" size={14} /> {t('update.openGitHub')}
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >
      <pre className="release-notes">{plainNotes(release.notes)}</pre>
    </Modal>
  )
}
