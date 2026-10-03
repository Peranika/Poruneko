import { createRoot } from 'react-dom/client'
import * as Go from '../wailsjs/go/main/App'
import { applyFontScale, applyTheme } from './display'
import { resolveLanguage, setLanguage } from './i18n'
import '@fontsource-variable/noto-sans-jp'
import './style.css'

// decide the UI language before loading the UI modules (some keep text as constants)
async function start() {
  const [settings, lang] = await Promise.all([Go.GetSettings().catch(() => null), Go.UILanguage().catch(() => '')])
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
