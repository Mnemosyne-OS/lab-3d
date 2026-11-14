/**
 * useLang — the language the app speaks: the host's inside Mnemosyne OS, the
 * browser's on its own. Only the language is read here (`apply: false`): the
 * host's theme is applied once, by onHostConfig() in main.tsx.
 *
 * @module app/useLang
 */
import { useEffect, useState } from 'react';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';

export function useLang(): string {
  const [lang, setLang] = useState<string>(() => (typeof navigator !== 'undefined' && navigator.language) || 'en');
  useEffect(() => onHostConfig((cfg) => { if (cfg.lang) setLang(cfg.lang); }, { apply: false }), []);
  return lang;
}
