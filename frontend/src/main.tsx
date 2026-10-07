import { createRoot } from 'react-dom/client'
import { go as Go, isWails } from './backend'
import { applyFontScale, applyTheme } from './display'
import { resolveLanguage, setLanguage } from './i18n'
import '@fontsource-variable/noto-sans-jp'
import '@fontsource-variable/noto-sans-mono'
import './style.css'

// decide the UI language before loading the UI modules (some keep text as constants)
async function start() {
  const [settings, lang, platform] = await Promise.all([
    Go.GetSettings().catch(() => null),
    Go.UILanguage().catch(() => ''),
    Go.Platform().catch(() => '')
  ])
  // the styles differ by OS (no window buttons on Android), and in a browser of remote access
  document.documentElement.dataset.platform = platform
  if (!isWails() && platform !== 'android') document.documentElement.dataset.remote = ''
  // the backend decides the language (the setting, or the OS display language) so both sides agree
  setLanguage(resolveLanguage(settings?.uiLanguage || lang))
  applyFontScale(settings?.fontScale)
  applyTheme(settings?.theme, settings?.accent)
  // Japanese names of the site's tags (from a site plugin; none without one). labels keeps text as constants,
  // so it is loaded only now that the language is set
  const [{ setTagNamesJa }, tagNames] = await Promise.all([import('./labels'), Go.TagNamesJa().catch(() => ({}))])
  setTagNamesJa(tagNames)
  const [{ default: App }, { AppProvider }] = await Promise.all([import('./App'), import('./state')])
  createRoot(document.getElementById('root')!).render(
    <AppProvider>
      <App />
    </AppProvider>
  )
}

void start()
