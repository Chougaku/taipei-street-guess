import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useSettings } from '../stores/settings.ts';
import { en } from './en.ts';
import { zhTW } from './zh-TW.ts';

void i18n.use(initReactI18next).init({
  resources: { 'zh-TW': { translation: zhTW }, en: { translation: en } },
  lng: useSettings.getState().language,
  fallbackLng: 'zh-TW',
  interpolation: { escapeValue: false },
});

const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng === 'zh-TW' ? 'zh-Hant-TW' : 'en';
};
syncHtmlLang(i18n.language);

useSettings.subscribe((s, prev) => {
  if (s.language !== prev.language) {
    void i18n.changeLanguage(s.language);
    syncHtmlLang(s.language);
  }
});

export default i18n;

/** Localised name for a map (official maps have both languages). */
export function mapName(m: { name: string; nameEn: string }) {
  return i18n.language === 'en' && m.nameEn ? m.nameEn : m.name;
}
