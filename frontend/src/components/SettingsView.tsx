import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ACCENT_PRESETS, DEFAULT_ACCENT, FONT_SCALES } from '../display'
import { errorText, t } from '../i18n'
import { loadMoreOf, specFilters, textOf } from '../browseSpec'
import { useApp } from '../state'
import type { FilterSpec, LoadMore, LocalDir, PluginInfo, Settings, SiteInfo, ViewerSettings } from '../types'
import { FileNameFormat } from './FileNameFormat'
import { Icon } from './Icon'
import { ImageIcon, TAB_ICONS, TabIcon } from './TabIcon'
import { KeybindingSettings } from './KeybindingSettings'
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

/** The plugins loaded at startup (they are added here, or by putting .wasm files in a plugins folder) */
function PluginList({ list }: { list: PluginInfo[] | null }) {
  const { toast } = useApp()
  // the plugins added since the start (loaded once the app starts again)
  const [added, setAdded] = useState<PluginInfo[]>([])
  const add = async () => {
    try {
      const p = await api.addPlugin(t('settings.addPluginTitle'))
      if (p) setAdded((xs) => [...xs.filter((x) => x.id !== p.id), p])
    } catch (e) {
      toast(errorText(e))
    }
  }
  return (
    <section id="set-plugins">
      <h3>{t('settings.plugins')}</h3>
      <div className="row-setting">
        <span>
          {t('settings.addPlugin')}
          <small className="muted">{t('settings.addPluginHint')}</small>
        </span>
        <button className="btn" onClick={() => void add()}>
          {t('settings.addPluginButton')}
        </button>
      </div>
      {added.length > 0 && (
        <div className="row-setting">
          <span>
            {t('settings.pluginsAdded', { names: added.map((p) => `${p.name} ${p.version}`).join(', ') })}
          </span>
          <button className="btn" onClick={() => void api.restartApp().catch((e) => toast(errorText(e)))}>
            {t('settings.restart')}
          </button>
        </div>
      )}
      <div className="row-setting">
        <span>
          {list && list.length > 0 ? (
            list.map((p) => (
              <span key={p.id} className="plugin-row" title={p.file}>
                {p.name} <small className="muted">{pluginDetail(p)}</small>
              </span>
            ))
          ) : (
            <span className="muted">{t('settings.noPlugins')}</span>
          )}
          <small className="muted">
            {document.documentElement.dataset.platform === 'android' ? t('settings.pluginsHintAndroid') : t('settings.pluginsHint')}
          </small>
        </span>
      </div>
    </section>
  )
}

/** A plugin's version and hosts (or a Susie plug-in's formats) */
const pluginDetail = (p: PluginInfo): string =>
  p.kind === 'susie'
    ? t('settings.pluginFormats', { formats: p.formats.join(' ') })
    : `${p.version} — ${t('settings.pluginHosts', { hosts: (p.displayHosts?.length ? p.displayHosts : p.hosts).join(', ') })}`

/**
 * Everything about one site, in one section: its plugin, where its works are saved, their file names, when its lists
 * load the next page, the plugin's own settings and the values its filters start with
 */
function SiteSection({ site, plugin, onDirChanged }: { site: SiteInfo; plugin?: PluginInfo; onDirChanged(): void }) {
  const { settings, updateSettings, refreshSettings, toast } = useApp()
  const values = settings?.pluginSettings?.[site.id] ?? {}
  const setValue = (id: string, value: string) => {
    const all = settings?.pluginSettings ?? {}
    updateSettings({ pluginSettings: { ...all, [site.id]: { ...all[site.id], [id]: value } } })
  }
  const chooseDir = async () => {
    try {
      if (!(await api.chooseSiteDir(site.id, t('settings.siteDirDialog', { name: site.name })))) return
      toast(t('settings.libraryDirChanged'))
      onDirChanged()
      await refreshSettings()
    } catch (e) {
      toast(errorText(e))
    }
  }
  // the plugin's own settings first, then the values its filters start with (choosing one on the list screen sets
  // it too)
  const own = specFilters(site.browse, 'settings')
  const defaults = specFilters(site.browse, 'browse').filter((f) => !f.multi)
  const [signingIn, setSigningIn] = useState(false)
  const login = async (fresh: boolean) => {
    setSigningIn(true)
    try {
      const got = await api.siteLogin(site.id, t('settings.loginTitle', { name: site.name }), fresh)
      if (!got) return
      const all = settings?.pluginSettings ?? {}
      updateSettings({ pluginSettings: { ...all, [site.id]: { ...all[site.id], ...got } } })
      toast(t('settings.loggedIn', { name: site.name }))
    } catch (e) {
      toast(errorText(e))
    } finally {
      setSigningIn(false)
    }
  }
  return (
    <section id={`set-site-${site.id}`}>
      <h3 className="settings-site-head">
        <span className="site-head-icon">{site.icon ? <ImageIcon url={site.icon} /> : <Icon name="globe" size={18} />}</span>
        {site.name}
        {plugin && <small className="muted">{pluginDetail(plugin)}</small>}
      </h3>
      {site.login && (
        <div className="row-setting">
          <span>
            {t('settings.login')}
            <small className="muted">{t('settings.loginHint')}</small>
          </span>
          <div className="login-buttons">
            <button className="btn" disabled={signingIn} onClick={() => void login(false)}>
              {t('settings.loginOpen')}
            </button>
            <button className="btn" disabled={signingIn} onClick={() => void login(true)}>
              {t('settings.loginOther')}
            </button>
          </div>
        </div>
      )}
      {own.map((f) => (
        <label key={f.id} className="row-setting">
          <span>
            {textOf(f.label)}
            {f.hint && <small className="muted">{textOf(f.hint)}</small>}
          </span>
          <PluginValue f={f} value={values[f.id] ?? f.default ?? ''} onChange={(v) => setValue(f.id, v)} />
        </label>
      ))}
      <div className="row-setting">
        <span>
          {t('settings.siteDir')}
          <small className="muted">{t('settings.libraryDirHint')}</small>
        </span>
        <div className="path-pick">
          <code title={site.dir}>{site.dir}</code>
          <button className="btn" onClick={() => void chooseDir()}>
            {t('settings.change')}
          </button>
        </div>
      </div>
      <FileNameFormat site={site} />
      {settings?.infiniteScroll && (
        <label className="row-setting">
          <span>
            {t('settings.loadMore')}
            <small className="muted">{t('settings.loadMoreHint')}</small>
          </span>
          <select
            value={loadMoreOf(site.id, settings.siteLoadMore)}
            onChange={(e) => updateSettings({ siteLoadMore: { ...settings.siteLoadMore, [site.id]: e.target.value as LoadMore } })}
          >
            <option value="near">{t('settings.loadMoreNear')}</option>
            <option value="bottom">{t('settings.loadMoreBottom')}</option>
            <option value="button">{t('settings.loadMoreButton')}</option>
          </select>
        </label>
      )}
      {defaults.map((f) => (
        <label key={f.id} className="row-setting">
          <span>
            {t('settings.pluginDefault', { filter: textOf(f.label) })}
            <small className="muted">{t('settings.pluginDefaultHint')}</small>
          </span>
          <PluginValue f={f} value={values[f.id] ?? f.default ?? ''} onChange={(v) => setValue(f.id, v)} />
        </label>
      ))}
    </section>
  )
}

/** The value of a plugin's setting or filter: a line of text, or a choice of its options */
function PluginValue({ f, value, onChange }: { f: FilterSpec; value: string; onChange(v: string): void }) {
  if (f.kind === 'text' || f.kind === 'secret') return <PluginTextSetting value={value} secret={f.kind === 'secret'} onChange={onChange} />
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {f.options.map((o) => (
        <option key={o.value} value={o.value}>
          {textOf(o.label)}
        </option>
      ))}
    </select>
  )
}

/** A plugin's setting that is a line of text (saved when the field is left; a secret one is shown hidden) */
function PluginTextSetting({ value, secret, onChange }: { value: string; secret: boolean; onChange(v: string): void }) {
  const [v, setV] = useState(value)
  const [shown, setShown] = useState(false)
  useEffect(() => setV(value), [value])
  const commit = () => v.trim() !== value && onChange(v.trim())
  return (
    <span className="plugin-text">
      <input
        type={secret && !shown ? 'password' : 'text'}
        value={v}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {secret && (
        <button type="button" className="icon-btn small" title={shown ? t('settings.hideSecret') : t('settings.showSecret')} onClick={() => setShown(!shown)}>
          <Icon name="eye" size={14} />
        </button>
      )}
    </span>
  )
}

/** The app's own sections, in page order (the sites' sections follow them) */
const SECTIONS: [id: string, label: () => string][] = [
  ['general', () => t('settings.general')],
  ['browse', () => t('settings.browse')],
  ['viewer', () => t('settings.viewer')],
  ['downloads', () => t('settings.downloads')],
  ['localDirs', () => t('settings.localDirs')],
  ['meta', () => t('settings.metaSources')],
  ['update', () => t('update.title')],
  ['plugins', () => t('settings.plugins')],
  ['window', () => t('settings.window')],
  ['keys', () => t('settings.keys')]
]

export function SettingsView() {
  const { settings, updateSettings, checkUpdate } = useApp()
  const [version, setVersion] = useState('')
  useEffect(() => void api.appVersion().then(setVersion), [])
  const [sites, setSites] = useState<SiteInfo[]>([])
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null)
  const reloadSites = () => void api.sites().then(setSites)
  useEffect(() => {
    reloadSites()
    void api.plugins().then(setPlugins)
  }, [])
  // the contents: the section being read is marked, clicking one scrolls to it
  const scroller = useRef<HTMLDivElement>(null)
  const [currentSection, setCurrentSection] = useState('general')
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      let cur = 'general'
      const top = el.getBoundingClientRect().top
      for (const sec of el.querySelectorAll<HTMLElement>('section[id^="set-"]')) {
        if (sec.getBoundingClientRect().top - top <= 60) cur = sec.id.slice(4)
      }
      // at the very bottom the last sections cannot reach the top: mark the last one
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
        const all = el.querySelectorAll<HTMLElement>('section[id^="set-"]')
        if (all.length) cur = all[all.length - 1].id.slice(4)
      }
      setCurrentSection(cur)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [sites.length, settings !== null]) // eslint-disable-line react-hooks/exhaustive-deps
  const goTo = (id: string) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      <div className="scroll" ref={scroller}>
        <div className="settings-layout">
          <nav className="settings-nav">
            {SECTIONS.map(([id, label]) => (
              <button key={id} className={`${currentSection === id ? 'active' : ''} ${id === 'window' ? 'desktop-only' : ''}`} onClick={() => goTo(id)}>
                {label()}
              </button>
            ))}
            {sites.length > 0 && <div className="settings-nav-sep">{t('settings.sites')}</div>}
            {sites.map((site) => (
              <button key={site.id} className={currentSection === `site-${site.id}` ? 'active' : ''} onClick={() => goTo(`site-${site.id}`)}>
                <span className="site-head-icon">{site.icon ? <ImageIcon url={site.icon} /> : <Icon name="globe" size={16} />}</span>
                {site.name}
              </button>
            ))}
          </nav>
          <div className="settings-inner">
            <h2>{t('settings.title')}</h2>

            <section id="set-general">
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
              <label className="row-setting">
                <span>
                  {t('settings.siteScreens')}
                  <small className="muted">{t('settings.siteScreensHint')}</small>
                </span>
                <select value={s.siteScreens ?? ''} onChange={(e) => updateSettings({ siteScreens: e.target.value as Settings['siteScreens'] })}>
                  <option value="">{t('settings.siteScreensList')}</option>
                  <option value="grid">{t('settings.siteScreensGrid')}</option>
                </select>
              </label>
              <label className="row-setting">
                <span>
                  {t('settings.siteScreensOpen')}
                  <small className="muted">{t('settings.siteScreensOpenHint')}</small>
                </span>
                <input type="checkbox" checked={!!s.siteScreensOpen} onChange={(e) => updateSettings({ siteScreensOpen: e.target.checked })} />
              </label>
              <div className="row-setting">
                <span>{t('settings.accent')}</span>
                <AccentPicker value={s.accent || DEFAULT_ACCENT} onChange={(accent) => updateSettings({ accent: accent === DEFAULT_ACCENT ? '' : accent })} />
              </div>
            </section>

            <section id="set-browse">
              <h3>{t('settings.browse')}</h3>
              <label className="row-setting">
                <span>
                  {t('settings.infiniteScroll')}
                  <small className="muted">{t('settings.infiniteScrollHint')}</small>
                </span>
                <input type="checkbox" checked={s.infiniteScroll} onChange={(e) => updateSettings({ infiniteScroll: e.target.checked })} />
              </label>
            </section>

            <section id="set-viewer">
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
              <label className="row-setting">
                <span>
                  {t('settings.moire')}
                  <small className="muted">{t('settings.moireHint')}</small>
                </span>
                <select value={s.viewer.moire ?? ''} onChange={(e) => updateSettings({ viewer: { moire: e.target.value } as ViewerSettings })}>
                  <option value="">{t('settings.moireOff')}</option>
                  <option value="weak">{t('settings.moireWeak')}</option>
                  <option value="strong">{t('settings.moireStrong')}</option>
                </select>
              </label>
              <PredecodeSetting />
              <SlideCurveSetting />
            </section>

            <section id="set-downloads">
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
            </section>

            <LocalDirs />

            <section id="set-meta">
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

            <section id="set-update">
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

            <PluginList list={plugins} />

            <section id="set-window" className="desktop-only">
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

            <section id="set-keys">
              <h3>{t('settings.keys')}</h3>
              <KeybindingSettings />
            </section>

            {/* each site's settings, together at the bottom */}
            {sites.map((site) => (
              <SiteSection key={site.id} site={site} plugin={plugins?.find((p) => p.id === site.id)} onDirChanged={reloadSites} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The local folders, each a tab: add with a dialog, change the tab's name and icon, reorder, remove with their works */
function LocalDirs() {
  const { settings, refreshSettings, localIcons, reloadLocalIcons, toast } = useApp()
  const dirs = settings?.localDirs ?? []
  // the folder whose icon picker is open
  const [picking, setPicking] = useState<number | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      toast(errorText(e))
    }
    await refreshSettings()
  }
  const add = () =>
    run(async () => {
      if (await api.addLocalDir(t('settings.localDirsDialog'))) toast(t('settings.localDirAdded'))
    })
  const remove = (d: LocalDir) => {
    if (!confirm(t('settings.localDirRemoveConfirm', { name: d.name }))) return
    void run(async () => {
      await api.removeLocalDir(d.id)
      toast(t('settings.localDirRemoved'))
    })
  }
  const setIcon = (d: LocalDir, icon: string) => {
    setPicking(null)
    void run(() => api.setLocalDir(d.id, d.name, icon))
  }
  return (
    <section id="set-localDirs">
      <h3>{t('settings.localDirs')}</h3>
      <p className="muted small">{t('settings.localDirsHint')}</p>
      <ul className="local-dirs">
        {dirs.map((d, i) => (
          <li key={d.id}>
            <div className="local-dir-row">
              <button className="icon-btn" title={t('settings.localDirIcon')} onClick={() => setPicking(picking === d.id ? null : d.id)}>
                <TabIcon icon={d.icon} />
              </button>
              <input
                className="local-dir-name"
                defaultValue={d.name}
                key={d.name}
                title={t('settings.localDirName')}
                onBlur={(e) => e.target.value.trim() !== d.name && void run(() => api.setLocalDir(d.id, e.target.value, d.icon))}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <code title={d.path}>{d.path}</code>
              <button className="icon-btn small" disabled={i === 0} title={t('settings.localDirUp')} onClick={() => void run(() => api.moveLocalDir(d.id, -1))}>
                <Icon name="back" size={14} className="rot90" />
              </button>
              <button
                className="icon-btn small"
                disabled={i === dirs.length - 1}
                title={t('settings.localDirDown')}
                onClick={() => void run(() => api.moveLocalDir(d.id, 1))}
              >
                <Icon name="forward" size={14} className="rot90" />
              </button>
              <button className="btn ghost small" onClick={() => remove(d)}>
                {t('settings.localDirRemove')}
              </button>
            </div>
            {picking === d.id && (
              <div className="icon-picker">
                {TAB_ICONS.map((name) => (
                  <button key={name} className={d.icon === name ? 'on' : ''} onClick={() => setIcon(d, name)}>
                    <Icon name={name} size={20} />
                  </button>
                ))}
                {localIcons.map((f) => (
                  <button key={f.name} className={d.icon === 'file:' + f.name ? 'on' : ''} title={f.name} onClick={() => setIcon(d, 'file:' + f.name)}>
                    <ImageIcon url={f.url} />
                  </button>
                ))}
                <span className="icon-picker-actions">
                  <button className="btn ghost small desktop-only" onClick={() => void api.openIconsFolder().catch((e) => toast(errorText(e)))}>
                    <Icon name="folder" size={14} /> {t('settings.iconsFolder')}
                  </button>
                  <button className="btn ghost small" onClick={reloadLocalIcons} title={t('settings.iconsReloadTitle')}>
                    <Icon name="refresh" size={14} />
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="local-dirs-actions">
        <button className="btn small" onClick={() => void add()}>
          <Icon name="plus" size={14} /> {t('settings.localDirAdd')}
        </button>
        {/* the works taken out of the library come back at the next scan */}
        <button
          className="btn ghost small"
          title={t('settings.restoreRemovedTitle')}
          onClick={() => void run(async () => toast(t('library.added', { n: await api.restoreIgnoredArchives() })))}
        >
          {t('settings.restoreRemoved')}
        </button>
      </div>
    </section>
  )
}

