import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { errorText, t, tryT } from '../i18n'
import { useApp } from '../state'
import type { SiteInfo } from '../types'

const PRESETS: [string, string][] = [
  ['[{group} ({artist})] {title}', t('fileName.presets.groupArtistTitle')],
  ['{group}/{title}', t('fileName.presets.groupFolder')],
  ['{creator}/{title}', t('fileName.presets.creatorFolder')],
  ['{artist}/{title}', t('fileName.presets.artistFolder')],
  ['{group}/[{artist}] {title} ({id})', t('fileName.presets.groupFolderWithId')],
  ['{title} ({id})', t('fileName.presets.titleWithId')]
]

/** Placeholder descriptions ("{title}" -> fileName.placeholders.title in the string table) */
const placeholderDesc = (name: string) => tryT(`fileName.placeholders.${name.replace(/[{}]/g, '')}`) ?? ''

/**
 * cbz file name format setting (preview, inserting placeholders, applying to existing files). With site, the format
 * of that site's works (empty: the one its plugin suggests)
 */
export function FileNameFormat({ site }: { site?: SiteInfo }) {
  const { settings, updateSettings, toast } = useApp()
  const saved = site ? (settings?.siteFileNameFormats?.[site.id] ?? '') : (settings?.fileNameFormat ?? '')
  const [draft, setDraft] = useState(saved || (site?.fileNameFormat ?? ''))
  const [preview, setPreview] = useState('')
  const [holders, setHolders] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api
      .fileNamePlaceholders()
      .then(setHolders)
      .catch(() => {})
  }, [])

  // preview and save once typing settles
  useEffect(() => {
    const timer = setTimeout(() => {
      const format = draft.trim() || (site ? site.fileNameFormat || settings?.fileNameFormat : '') || ''
      api
        .previewFileName(site?.id ?? '', format, t('fileName.sampleSeries'))
        .then(setPreview)
        .catch(() => {})
      if (!site) {
        if (draft.trim() && draft !== settings?.fileNameFormat) updateSettings({ fileNameFormat: draft })
      } else if (draft.trim() !== saved) {
        // the plugin's own format is kept as "none chosen", so a later plugin version can change it
        const chosen = draft.trim() === site.fileNameFormat ? '' : draft.trim()
        if (chosen !== saved) updateSettings({ siteFileNameFormats: { ...settings?.siteFileNameFormats, [site.id]: chosen } })
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const insert = (token: string) => {
    const el = input.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + token + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const apply = async () => {
    if (!confirm(t('fileName.applyConfirm'))) return
    setBusy(true)
    try {
      const n = await api.applyFileNameFormat()
      toast(t('fileName.renamed', { n }))
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fname">
      <div className="fname-head">
        <span>
          {t('fileName.title')}
          <small className="muted">{site ? t('fileName.siteDescription', { name: site.name }) : t('fileName.description')}</small>
        </span>
        <select value="" onChange={(e) => e.target.value && setDraft(e.target.value)} title={t('fileName.preset')}>
          <option value="">{t('fileName.presetPlaceholder')}</option>
          {site?.fileNameFormat && <option value={site.fileNameFormat}>{t('fileName.sitePreset', { name: site.name })}</option>}
          {site && settings?.fileNameFormat && <option value={settings.fileNameFormat}>{t('fileName.commonPreset')}</option>}
          {PRESETS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <input ref={input} className="fname-input" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
      <div className="fname-holders">
        {holders.map((h) => (
          <button key={h} className="tag" title={placeholderDesc(h)} onClick={() => insert(h)}>
            {h}
          </button>
        ))}
      </div>
      <div className="fname-preview">
        <span className="muted small">{t('fileName.example')}</span>
        <code>{preview}</code>
      </div>
      <div className="fname-foot">
        <small className="muted">{t('fileName.autoRename')}</small>
        <button className="btn" disabled={busy} onClick={apply}>
          {busy ? t('fileName.applying') : t('fileName.apply')}
        </button>
      </div>
    </div>
  )
}
