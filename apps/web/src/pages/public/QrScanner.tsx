// Camera QR scanning. ZXing is loaded only when someone taps "Scan", so the verify
// page stays light for everyone who just types or opens a link.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

/** Accepts a verify URL (…/verify/PSM-…) or a bare certificate number. */
export function certificateFromQr(text: string): string | null {
  const m = /PSM-\d{4}-[0-9A-Z]{11}/i.exec(text);
  return m ? m[0].toUpperCase() : null;
}

export function QrScanner({ onResult, onClose }: { onResult: (certificateNumber: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem(t('verify.scanUnavailable'));
        return;
      }
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled || !video.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video.current, (result) => {
          if (!result) return;
          const n = certificateFromQr(result.getText());
          if (n) {
            controls.stop();
            onResult(n);
          } else {
            setProblem(t('verify.scanWrongCode'));
          }
        });
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch (e) {
        const name = (e as Error).name;
        setProblem(name === 'NotAllowedError' ? t('verify.scanDenied') : t('verify.scanUnavailable'));
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // Start once per mount; onResult/t identity changes must not restart the camera.
  }, []); // eslint-disable-line

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square max-h-80 w-full bg-[#0a111c] sm:aspect-video">
        <video ref={video} className="size-full object-cover" muted playsInline aria-label={t('verify.scanHint')} />
        {/* Aim box */}
        <span aria-hidden className="pointer-events-none absolute inset-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className={problem ? 'text-caption text-status-red-fg' : 'text-caption text-muted'} role={problem ? 'alert' : undefined}>
          {problem ?? t('verify.scanHint')}
        </p>
        <button type="button" onClick={onClose} className="shrink-0 rounded-md px-3 py-1.5 text-caption font-medium text-fg hover:bg-surface-2">
          {t('verify.scanStop')}
        </button>
      </div>
    </div>
  );
}
