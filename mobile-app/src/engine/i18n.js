import en from '../../localization/en.json';
import hi from '../../localization/hi.json';
import sat from '../../localization/sat.json';

const bundles = { en, hi, sat };

export function t(lang, key) {
  const b = bundles[lang] || bundles.en;
  return b[key] ?? bundles.en[key] ?? key;
}
export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'sat', label: 'Santali / ᱥᱟᱱᱛᱟᱲᱤ' },
];
