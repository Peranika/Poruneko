import { useEffect, useState } from 'react'
import { api } from '../api'
import { ACCENT_PRESETS, DEFAULT_ACCENT, FONT_SCALES } from '../display'
import { t } from '../i18n'
import { LANGUAGES, SORTS } from '../labels'
import { useApp } from '../state'
import type { PluginInfo, Settings, SortMode, ViewerSettings } from '../types'
import { FileNameFormat } from './FileNameFormat'
import { KeybindingSettings } from './KeybindingSettings'
import { Options } from './ListControls'
import { PredecodeSetting } from './PredecodeSetting'
import { SlideCurveSetting } from './SlideCurveSetting'

/** Accent color: a few presets, and any color through the color picker at the end */
function AccentPicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const custom = !ACCENT_PRESETS.includes(value.toLowerCase())
  return (
    <span className="accent-picker">
      {ACCENT_PRESETS.map((c) => (
        <button
          key={c}
          className={`accent-swatch ${value.toLowerCase() === c ? 'on' : ''}`}
          style={{ background: c }}
          title={c === DEFAULT_ACCENT ? t('settings.accentDefault') : c}
          onClick={() => onChange(c)}
        />
      ))}
      <label className={`accent-swatch custom ${custom ? 'on' : ''}`} title={t('settings.accentCustom')} style={custom ? { background: value } : undefined}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </span>
  )
}

/** The plugins loaded at startup (they are added by putting .wasm files in a plugins folder) */
function PluginList() {
  const [list, setList] = useState<PluginInfo[] | null>(null)
  useEffect(() => void api.plugins().then(setList), [])
  return (
    <section>
      <h3>{t('settings.plugins')}</h3>
      <div className="row-setting">
        <span>
          {list && list.length > 0 ? (
            list.map((p) => (
              <span key={p.id} className="plugin-row" title={p.file}>
                {p.name}{' '}
                <small className="muted">
                  {p.kind === 'susie'
                    ? t('settings.pluginFormats', { formats: p.formats.join(' ') })
                    : `${p.version} — ${t('settings.pluginHosts', { hosts: p.hosts.join(', ') })}`}
                </small>
              </span>
            ))
          ) : (
            <span className="muted">{t('settings.noPlugins')}</span>
          )}
          <small className="muted">{t('settings.pluginsHint')}</small>
        </span>
      </div>
    </section>
  )
}

export function SettingsView() {
  const { settings, updateSettings, toast, checkUpdate } = useApp()
  const [version, setVersion] = useState('')
  useEffect(() => void api.appVersion().then(setVersion), [])
  if (!settings) return null
  const s = settings

  const toggleSource = (src: string) => {
    const has = s.metaSources.includes(src)
    const next = has ? s.metaSources.filter((x) => x !== src) : [...s.metaSources, src]
    updateSettings({ metaSources: next })
  }
  const moveSource = (src: string) => {
    const rest = s.metaSources.filter((x) => x !== src)
    updateSettings({ metaSources: [src, ...rest] })
  }
  // after changing the UI language, save and then reload the UI (some modules keep text as constants)
  const setUILanguage = (uiLanguage: Settings['uiLanguage']) => {
    void api.setSettings({ ...s, uiLanguage }).then(() => location.reload())
  }

  return (
    <div className="view settings">
      <div className="scroll">
        <div className="settings-inner">
          <h2>{t('settings.title')}</h2>

          <section>
            <label className="row-setting">
              <span>
                {t('settings.uiLanguage')}
                <small className="muted">{t('settings.uiLanguageHint')}</small>
              </span>
              <select value={s.uiLanguage ?? ''} onChange={(e) => setUILanguage(e.target.value as Settings['uiLanguage'])}>
                <option value="">{t('settings.uiLanguageAuto')}</option>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="row-setting">
              <span>{t('settings.fontScale')}</span>
              <select value={s.fontScale || 100} onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}>
                {FONT_SCALES.map((p) => (
                  <option key={p} value={p}>
                    {p === 100 ? t('settings.fontScaleNormal', { p }) : `${p}%`}
                  </option>
                ))}
              </select>
            </label>
            <label className="row-setting">
              <span>{t('settings.theme')}</span>
              <select value={s.theme ?? ''} onChange={(e) => updateSettings({ theme: e.target.value as Settings['theme'] })}>
                <option value="">{t('settings.themeDark')}</option>
                <option value="light">{t('settings.themeLight')}</option>
                <option value="system">{t('settings.themeSystem')}</option>
              </select>
            </label>
            <div className="row-setting">
              <span>{t('settings.accent')}</span>
              <AccentPicker value={s.accent || DEFAULT_ACCENT} onChange={(accent) => updateSettings({ accent: accent === DEFAULT_ACCENT ? '' : accent })} />
            </div>
          </section>

          <section>
            <h3>{t('settings.browse')}</h3>
            <label className="row-setting">
              <span>{t('settings.defaultLanguage')}</span>
              <select value={s.language} onChange={(e) => updateSettings({ language: e.target.value })}>
                <Options items={LANGUAGES} />
              </select>
            </label>
            <label className="row-setting">
              <span>
                {t('settings.defaultSort')}
                <small className="muted">{t('settings.defaultSortHint')}</small>
              </span>
              <select value={s.sort} onChange={(e) => updateSettings({ sort: e.target.value as SortMode })}>
                <Options items={SORTS} />
              </select>
            </label>
            <label className="row-setting">
              <span>
                {t('settings.infiniteScroll')}
                <small className="muted">{t('settings.infiniteScrollHint')}</small>
              </span>
              <input type="checkbox" checked={s.infiniteScroll} onChange={(e) => updateSettings({ infiniteScroll: e.target.checked })} />
            </label>
            <label className="row-setting">
              <span>{t('settings.imageFormat')}</span>
              <select value={s.imageFormat} onChange={(e) => updateSettings({ imageFormat: e.target.value as 'webp' | 'avif' })}>
                <option value="webp">{t('settings.webp')}</option>
                <option value="avif">{t('settings.avif')}</option>
              </select>
            </label>
          </section>

          <section>
            <h3>{t('settings.viewer')}</h3>
            <label className="row-setting">
              <span>
                {t('settings.autoFullscreen')}
                <small className="muted">{t('settings.autoFullscreenHint')}</small>
              </span>
              <input
                type="checkbox"
                checked={s.viewer.autoFullscreen ?? false}
                onChange={(e) => updateSettings({ viewer: { autoFullscreen: e.target.checked } as ViewerSettings })}
              />
            </label>
            <label className="row-setting">
              <span>
                {t('settings.spreadForManga')}
                <small className="muted">{t('settings.spreadForMangaHint')}</small>
              </span>
              <input
                type="checkbox"
                checked={s.viewer.spreadForManga ?? false}
                onChange={(e) => updateSettings({ viewer: { spreadForManga: e.target.checked } as ViewerSettings })}
              />
            </label>
            <PredecodeSetting />
            <SlideCurveSetting />
          </section>

          <section>
            <h3>{t('settings.downloads')}</h3>
            <label className="row-setting">
              <span>{t('settings.autoDownload')}</span>
              <input type="checkbox" checked={s.autoDownload} onChange={(e) => updateSettings({ autoDownload: e.target.checked })} />
            </label>
            <label className="row-setting">
              <span>{t('settings.deleteOnUnbookmark')}</span>
              <input
                type="checkbox"
                checked={s.deleteFilesOnUnbookmark}
                onChange={(e) => updateSettings({ deleteFilesOnUnbookmark: e.target.checked })}
              />
            </label>
            <label className="row-setting">
              <span>{t('settings.concurrency')}</span>
              <input
                type="number"
                min={1}
                max={8}
                value={s.downloadConcurrency}
                onChange={(e) => updateSettings({ downloadConcurrency: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </label>
            <label className="row-setting">
              <span>
                {t('settings.rangeThumb')}
                <small className="muted">{t('settings.rangeThumbHint')}</small>
              </span>
              <select value={s.rangeThumb ?? 'page'} onChange={(e) => updateSettings({ rangeThumb: e.target.value as 'page' | 'source' })}>
                <option value="page">{t('settings.rangeThumbPage')}</option>
                <option value="source">{t('settings.rangeThumbSource')}</option>
              </select>
            </label>
            <label className="row-setting">
              <span>
                {t('settings.tempFiles')}
                <small className="muted">{t('settings.tempFilesHint')}</small>
              </span>
              <select value={s.tempFiles ?? 'startup'} onChange={(e) => updateSettings({ tempFiles: e.target.value as Settings['tempFiles'] })}>
                <option value="startup">{t('settings.tempFilesStartup')}</option>
                <option value="viewerClose">{t('settings.tempFilesViewerClose')}</option>
                <option value="pack">{t('settings.tempFilesPack')}</option>
              </select>
            </label>
            <FileNameFormat />
            <div className="row-setting">
              <span>
                {t('settings.libraryDir')}
                <small className="muted">{t('settings.libraryDirHint')}</small>
              </span>
              <div className="path-pick">
                <code>{s.libraryDir}</code>
                <button
                  className="btn"
                  onClick={async () => {
                    const d = await api.chooseLibraryDir(t('settings.libraryDirDialog'))
                    if (d) {
                      updateSettings({ libraryDir: d })
                      toast(t('settings.libraryDirChanged'))
                    }
                  }}
                >
                  {t('settings.change')}
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3>{t('settings.metaSources')}</h3>
            <p className="muted small">{t('settings.metaSourcesHint')}</p>
            {['dlsite', 'fanza'].map((src) => (
              <label key={src} className="row-setting">
                <span>
                  {src === 'dlsite' ? t('settings.dlsite') : t('settings.fanza')}
                  {s.metaSources[0] === src && <small className="muted">{t('settings.preferred')}</small>}
                </span>
                <span className="inline">
                  {s.metaSources.includes(src) && s.metaSources[0] !== src && (
                    <button className="btn ghost small" onClick={() => moveSource(src)}>
                      {t('settings.makePreferred')}
                    </button>
                  )}
                  <input type="checkbox" checked={s.metaSources.includes(src)} onChange={() => toggleSource(src)} />
                </span>
              </label>
            ))}
            <h3>{t('settings.fallback')}</h3>
            <p className="muted small">{t('settings.fallbackHint')}</p>
            {[
              ['pawchive', 'pawchive', t('settings.pawchiveHint')],
              ['duckduckgo', 'DuckDuckGo', t('settings.duckduckgoHint')]
            ].map(([src, label, hint]) => (
              <label key={src} className="row-setting">
                <span>
                  {label}
                  {hint && <small className="muted">{hint}</small>}
                </span>
                <input
                  type="checkbox"
                  checked={(s.fallbackSources ?? []).includes(src)}
                  onChange={() => {
                    const cur = s.fallbackSources ?? []
                    updateSettings({ fallbackSources: cur.includes(src) ? cur.filter((x) => x !== src) : [...cur, src] })
                  }}
                />
              </label>
            ))}
          </section>

          <section>
            <h3>{t('update.title')}</h3>
            <div className="row-setting">
              <span>
                {t('update.version', { version })}
                <small className="muted">{t('update.checkHint')}</small>
              </span>
              <button className="btn" onClick={() => void checkUpdate(true)}>
                {t('update.checkNow')}
              </button>
            </div>
            <label className="row-setting">
              <span>{t('update.checkAtStart')}</span>
              <input
                type="checkbox"
                checked={s.updateCheck !== 'off'}
                onChange={(e) => updateSettings({ updateCheck: e.target.checked ? '' : 'off' })}
              />
            </label>
          </section>

          <PluginList />

          <section>
            <h3>{t('settings.window')}</h3>
            <label className="row-setting">
              <span>
                {t('settings.rememberWindow')}
                <small className="muted">{t('settings.rememberWindowHint')}</small>
              </span>
              <input type="checkbox" checked={s.rememberWindow} onChange={(e) => updateSettings({ rememberWindow: e.target.checked })} />
            </label>
            <label className="row-setting">
              <span>
                {t('settings.rememberScreen')}
                <small className="muted">{t('settings.rememberScreenHint')}</small>
              </span>
              <input type="checkbox" checked={s.rememberScreen} onChange={(e) => updateSettings({ rememberScreen: e.target.checked })} />
            </label>
          </section>

          <section>
            <h3>{t('settings.keys')}</h3>
            <KeybindingSettings />
          </section>
        </div>
      </div>
    </div>
  )
}
