/**
 * useLang — the language the app speaks: the host's inside Mnemosyne OS, the
 * browser's on its own. The host's look is NOT applied (`apply: false`): Lab 3D
 * brings its own dark stage wherever it runs (tokens.css).
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
