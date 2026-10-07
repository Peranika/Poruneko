import { useEffect, useState } from 'react'
import { api } from '../api'
import { errorText, t } from '../i18n'
import { useApp } from '../state'
import type { RemoteStatus } from '../types'

/**
 * Remote access: browsers on the user's other devices (a tablet, a phone) use this app's screen, on the home network
 * or through a mesh VPN such as NordVPN Meshnet or Tailscale. Only on the desktop (and not from such a browser)
 */
export function RemoteSettings() {
  const { toast } = useApp()
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [password, setPassword] = useState('')
  const load = () => void api.remoteStatus().then(setStatus)
  useEffect(load, [])

  const run = async (f: () => Promise<void>, done?: string) => {
    try {
      await f()
      if (done) toast(done)
    } catch (e) {
      toast(errorText(e))
    }
    load()
  }

  if (!status) return null
  return (
    <section id="set-remote" className="desktop-only">
      <h3>{t('remote.title')}</h3>
      <div className="row-setting">
        <span>{t('remote.hint')}</span>
      </div>
      <div className="row-setting">
        <span>
          {t('remote.password')}
          <small className="muted">{status.hasPassword ? t('remote.passwordSet') : t('remote.passwordHint')}</small>
        </span>
        <span className="btn-row">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            className="btn"
            disabled={!password}
            onClick={() =>
              void run(async () => {
                await api.setRemotePassword(password)
                setPassword('')
              }, t('remote.passwordSaved'))
            }
          >
            {t('remote.setPassword')}
          </button>
        </span>
      </div>
      <label className="row-setting">
        <span>
          {t('remote.enable')}
          <small className={status.error ? 'error' : 'muted'}>
            {status.error ? t('remote.failed', { error: status.error }) : t('remote.enableHint')}
          </small>
        </span>
        <input
          type="checkbox"
          checked={status.enabled}
          disabled={!status.hasPassword}
          onChange={(e) => void run(() => api.setRemoteEnabled(e.target.checked))}
        />
      </label>
      {status.listening && (
        <div className="row-setting">
          <span>
            {t('remote.urls')}
            <small className="muted">{t('remote.urlsHint')}</small>
            {status.urls.map((u) => (
              <code key={u} className="remote-url">
                {u}
              </code>
            ))}
          </span>
        </div>
      )}
      {status.sessions > 0 && (
        <div className="row-setting">
          <span>{t('remote.sessions', { n: status.sessions })}</span>
          <button className="btn ghost small" onClick={() => void run(() => api.remoteSignOutAll(), t('remote.signedOut'))}>
            {t('remote.signOutAll')}
          </button>
        </div>
      )}
    </section>
  )
}
