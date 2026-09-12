import type { CSSProperties } from 'react';

/**
 * Button and status styles shared by the ceremony screen (GenesisAnimation)
 * and its end-of-ceremony handover panel (GenesisHandover). The text layer
 * of the ceremony has `pointerEvents: 'none'`, so every interactive element
 * re-enables it explicitly.
 */

export const button: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: '#eef1ff',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 999,
  padding: '9px 28px',
  fontFamily: 'inherit',
  fontSize: 14,
  cursor: 'pointer',
  letterSpacing: 1,
  pointerEvents: 'auto',
};

export const buttonPrimary: CSSProperties = {
  ...button,
  background: 'linear-gradient(180deg, rgba(246,236,208,0.14), rgba(246,236,208,0.04))',
  borderColor: 'rgba(246,236,208,0.42)',
  color: '#f6ecd0',
};

export const buttonGhost: CSSProperties = {
  ...button,
  textDecoration: 'none',
  display: 'inline-block',
};

export const buttonDisabled: CSSProperties = {
  ...button,
  opacity: 0.35,
  cursor: 'not-allowed',
};

export const exportOk: CSSProperties = { fontSize: 12, color: '#a0e0a0', opacity: 0.8 };

export const exportErr: CSSProperties = { fontSize: 12, color: '#f0a0a0', opacity: 0.85, maxWidth: 420 };
