import { useEffect, useState } from 'react'
import { api } from '../api'
import { errorText, t } from '../i18n'
import { useApp } from '../state'
import type { SyncFound, SyncStatus } from '../types'

/**
 * Syncing the bookmarks, series and tags with the user's other devices on the same network: this device's name,
 * the paired devices, and pairing a new one (one device shows a code, the other enters it)
 */
export function SyncSettings() {
  const { toast } = useApp()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [name, setName] = useState('')
  // entering another device's code: the devices found showing one, the address chosen or typed, the code
  const [entering, setEntering] = useState(false)
  const [found, setFound] = useState<SyncFound[] | null>(null)
  const [addr, setAddr] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // the pairing code's time left, ticking
  const [, setTick] = useState(0)

  useEffect(() => {
    const load = () =>
      void api.syncStatus().then((s) => {
        setStatus(s)
        setName((n) => n || s.deviceName)
      })
    load()
    return api.onSyncChanged(load)
  }, [])
  useEffect(() => {
    if (!status?.pairing) return
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [status?.pairing])

  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    try {
      await f()
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const find = () =>
    run(async () => {
      setFound(null)
      const list = await api.findSyncDevices()
      setFound(list)
      if (list.length === 1) setAddr(list[0].addr)
    })
  const pair = () =>
    run(async () => {
      await api.pairSyncDevice(addr.trim(), code)
      toast(t('sync.paired'))
      setEntering(false)
      setCode('')
      setAddr('')
    })
  const syncNow = () =>
    run(async () => {
      const failed = await api.syncNow()
      toast(failed.length ? t('sync.notReached', { names: failed.map((f) => f.name).join(', ') }) : t('sync.done'))
    })

  if (!status) return null
  const pairing = status.pairing
  const left = pairing ? Math.max(0, Math.round((pairing.until - Date.now()) / 1000)) : 0

  return (
    <section id="set-sync">
      <h3>{t('sync.title')}</h3>
      <div className="row-setting">
        <span>
          {t('sync.hint')}
        </span>
      </div>
      <label className="row-setting">
        <span>
          {t('sync.deviceName')}
          <small className="muted">{t('sync.deviceNameHint')}</small>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void api.setSyncDeviceName(name.trim()).then(() => api.syncStatus().then((s) => setName(s.deviceName)))}
        />
      </label>

      {status.peers.map((p) => (
        <div key={p.id} className="row-setting">
          <span>
            {p.name}
            <small className={p.lastError ? 'error' : 'muted'}>
              {p.lastError
                ? t('sync.failed', { error: p.lastError })
                : p.lastSync
                  ? t('sync.lastSync', { date: new Date(p.lastSync).toLocaleString() })
                  : t('sync.never')}
            </small>
          </span>
          <button
            className="btn ghost small"
            onClick={() => {
              if (confirm(t('sync.unpairConfirm', { name: p.name }))) void api.removeSyncDevice(p.id)
            }}
          >
            {t('sync.unpair')}
          </button>
        </div>
      ))}
      {status.peers.length > 0 && (
        <div className="row-setting">
          <span>
            {t('sync.now')}
            <small className="muted">{t('sync.nowHint')}</small>
          </span>
          <button className="btn" disabled={busy || status.syncing} onClick={() => void syncNow()}>
            {status.syncing ? t('sync.syncing') : t('sync.nowButton')}
          </button>
        </div>
      )}

      {/* pairing: this device shows a code, or the code another device shows is entered here */}
      {pairing ? (
        <div className="row-setting sync-pairing">
          <span>
            {t('sync.showingCode')}
            <strong className="sync-code">{pairing.code}</strong>
            <small className="muted">{t('sync.codeHint', { seconds: left })}</small>
            {pairing.addrs.length > 0 && <small className="muted">{t('sync.addrs', { addrs: pairing.addrs.join('  ') })}</small>}
          </span>
          <button className="btn ghost small" onClick={() => void api.stopSyncPairing()}>
            {t('common.cancel')}
          </button>
        </div>
      ) : entering ? (
        <div className="row-setting sync-pairing">
          <span>
            {t('sync.enterTitle')}
            <small className="muted">{t('sync.enterHint')}</small>
            <span className="sync-found">
              <button className="btn small" disabled={busy} onClick={() => void find()}>
                {t('sync.find')}
              </button>
              {found?.map((f) => (
                <button key={f.id} className={`toggle ${addr === f.addr ? 'on' : ''}`} onClick={() => setAddr(f.addr)}>
                  {f.name}
                </button>
              ))}
              {found?.length === 0 && <small className="muted">{t('sync.noneFound')}</small>}
            </span>
            <span className="sync-inputs">
              <input placeholder={t('sync.addrPlaceholder')} value={addr} onChange={(e) => setAddr(e.target.value)} />
              <input
                className="sync-code-input"
                placeholder="XXXX-XXXX"
                value={code}
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </span>
          </span>
          <span className="btn-row">
            <button className="btn" disabled={busy || !addr.trim() || code.replace(/[^0-9A-Z]/gi, '').length < 8} onClick={() => void pair()}>
              {t('sync.pair')}
            </button>
            <button className="btn ghost small" onClick={() => setEntering(false)}>
              {t('common.cancel')}
            </button>
          </span>
        </div>
      ) : (
        <div className="row-setting">
          <span>
            {t('sync.addDevice')}
            <small className="muted">{t('sync.addDeviceHint')}</small>
          </span>
          <span className="btn-row">
            <button className="btn" onClick={() => void run(async () => void (await api.startSyncPairing()))}>
              {t('sync.showCode')}
            </button>
            <button
              className="btn"
              onClick={() => {
                setEntering(true)
                void find()
              }}
            >
              {t('sync.enterCode')}
            </button>
          </span>
        </div>
      )}
    </section>
  )
}
