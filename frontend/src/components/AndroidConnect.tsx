import { androidPage } from '../backend'
import { t } from '../i18n'

/** In the Android app (a client of the computer's remote access): the computer it opens, and changing it */
export function AndroidConnect() {
  const android = androidPage()
  if (!android) return null
  return (
    <section id="set-androidConnect">
      <h3>{t('androidConnect.title')}</h3>
      <div className="row-setting">
        <span>
          {t('androidConnect.current', { url: android.serverUrl() })}
          <small className="muted">{t('androidConnect.hint')}</small>
        </span>
        <button className="btn" onClick={() => android.changeServer()}>
          {t('androidConnect.change')}
        </button>
      </div>
    </section>
  )
}
