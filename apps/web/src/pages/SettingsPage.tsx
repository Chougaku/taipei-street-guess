import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AccountSection } from '../components/AccountSection.tsx';
import { useMe } from '../components/Layout.tsx';
import { useSettings, type Language } from '../stores/settings.ts';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="font-semibold">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const { data: me } = useMe();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-black">{t('settings.title')}</h1>
      <div className="card divide-y divide-line px-5">
        <Row label={t('settings.language')}>
          <select
            className="rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line"
            value={s.language}
            onChange={(e) => s.set({ language: e.target.value as Language })}
          >
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
          </select>
        </Row>
        <Row label={t('settings.units')}>
          <select
            className="rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line"
            value={s.units}
            onChange={(e) => s.set({ units: e.target.value as 'metric' | 'imperial' })}
          >
            <option value="metric">{t('settings.metric')}</option>
            <option value="imperial">{t('settings.imperial')}</option>
          </select>
        </Row>
        <Row label={t('settings.sound')}>
          <Toggle label={t('settings.sound')} checked={s.sound} onChange={(v) => s.set({ sound: v })} />
        </Row>
        {s.sound && (
          <Row label={t('settings.volume')}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => s.set({ volume: Number(e.target.value) })}
              className="w-40 accent-[var(--color-accent)]"
            />
          </Row>
        )}
        <Row label={t('settings.haptics')}>
          <Toggle label={t('settings.haptics')} checked={s.haptics} onChange={(v) => s.set({ haptics: v })} />
        </Row>
        <Row label={t('settings.motionControl')}>
          <Toggle label={t('settings.motionControl')} checked={s.motionControl} onChange={(v) => s.set({ motionControl: v })} />
        </Row>
      </div>

      <h2 className="mb-3 mt-6 text-lg font-black">{t('account.title')}</h2>
      <div className="card p-5">
        <AccountSection />
      </div>
      <Link to="/friends" className="card mt-3 flex items-center justify-between p-5 font-semibold hover:ring-accent/60">
        {t('friends.title')} <span className="text-muted">›</span>
      </Link>
      {me?.isAdmin && (
        <Link to="/admin" className="card mt-3 flex items-center justify-between p-5 font-semibold hover:ring-accent/60">
          {t('admin.title')} <span className="text-muted">›</span>
        </Link>
      )}
    </div>
  );
}
