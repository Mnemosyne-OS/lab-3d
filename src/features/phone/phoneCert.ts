/**
 * phoneCert — the PC's certificate, shown before a series' QR (doc 176 §22).
 * Installed once on the phone, it opens the capture page with no warning.
 * Asked until the person says it is installed (remembered in this window), or
 * until a phone opens the page with no certificate refused first (the host's
 * `phoneTrusted`, also remembered). « Skip » holds for this screen only.
 *
 * @module features/phone/phoneCert
 */
import { useEffect, useState } from 'react';
import type { PhoneStatus } from '../../host/phoneDoors';
import { readChoice, safeLocalStorage, writeChoice } from '../../lib/choiceStore';

const CERT_KEY = 'lab3d.phoneCert';

export interface PhoneCert {
  /** The certificate's QR comes before the series' one. */
  certFirst: boolean;
  /** The phone opened the page with no warning: it trusts the PC. */
  trusted: boolean;
  /** The certificate's QR can be shown again (an open series, a host that serves it, a phone not trusting yet). */
  canShow: boolean;
  /** Past the certificate: `installed` remembers it, else only for this screen. */
  done: (installed: boolean) => void;
  show: () => void;
}

export function usePhoneCert(st: Pick<PhoneStatus, 'active' | 'caUrl' | 'phoneTrusted'> | null): PhoneCert {
  const [ask, setAsk] = useState(() => readChoice(safeLocalStorage(), CERT_KEY, ['installed', 'ask'] as const, 'ask') === 'ask');
  const trusted = st?.phoneTrusted === true;
  useEffect(() => {
    if (!trusted) return;
    setAsk(false);
    writeChoice(safeLocalStorage(), CERT_KEY, 'installed');
  }, [trusted]);
  const served = !!st?.active && !!st.caUrl;
  return {
    certFirst: served && ask && !trusted,
    trusted,
    canShow: served && !ask && !trusted,
    done: (installed) => {
      setAsk(false);
      if (installed) writeChoice(safeLocalStorage(), CERT_KEY, 'installed');
    },
    show: () => setAsk(true),
  };
}
