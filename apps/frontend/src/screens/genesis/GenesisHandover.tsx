import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listVaultFiles,
  revealVaultFiles,
  saveVaultFileCopies,
  saveVaultKeybundle,
  type VaultFileInfo,
  type VaultFileSkipped,
} from '../../lib/vaultFiles';
import { button, buttonDisabled, buttonGhost, buttonPrimary, exportErr, exportOk } from './genesisStyles';

/**
 * End-of-ceremony handover. Explains the two vault files and the keybundle,
 * lets the user save them through native dialogs (main-side copies, no bytes
 * through IPC), and gates "Enter Cipher" until at least one save succeeded.
 *
 * The gate can be bypassed on purpose — a native dialog can fail — but only
 * through an explicit two-step path: a small link, then a checkbox
 * acknowledging that no backup exists.
 *
 * Nothing here ever shows a path or file contents: only filename, size and a
 * sha256 prefix, exactly what main.js returns.
 */

type Props = {
  /** Vault id from the phase-9 payload; empty when the ceremony did not report one. */
  vaultId: string;
  continueLabel: string;
  onContinue: () => void;
  /** "View my hologram" / "Claim your seat" — rendered inside the action row. */
  extraActions?: ReactNode;
};

type Notice = { tone: 'ok' | 'error' | 'info'; text: string };

const SHA_PREFIX_LENGTH = 12;

export default function GenesisHandover({ vaultId, continueLabel, onContinue, extraActions }: Props) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<VaultFileInfo[]>([]);
  const [busy, setBusy] = useState<'keybundle' | 'copies' | null>(null);
  const [keybundleNotice, setKeybundleNotice] = useState<Notice | null>(null);
  const [copiesNotice, setCopiesNotice] = useState<Notice | null>(null);
  const [revealNotice, setRevealNotice] = useState<Notice | null>(null);
  const [hasBackup, setHasBackup] = useState(false);
  const [skipStep, setSkipStep] = useState<'hidden' | 'confirm'>('hidden');
  const [skipAcknowledged, setSkipAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listVaultFiles().then((result) => {
      if (cancelled) return;
      // A missing bridge context simply means no list: the explanation and the
      // keybundle action still render, and so does the gate.
      setFiles(result.ok ? result.files : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sizeLabel = (size: number) => t('genesis.handover_size_kb', { kb: Math.max(1, Math.round(size / 1024)) });

  const describeError = (code: string): string => {
    switch (code) {
      case 'canceled':
        return t('genesis.handover_canceled');
      case 'exists':
        return t('genesis.handover_exists');
      case 'no_sources':
        return t('genesis.handover_no_sources');
      case 'unavailable':
        return t('genesis.handover_unavailable');
      default:
        return t('genesis.export_failed', { message: code });
    }
  };

  const onSaveKeybundle = async () => {
    if (!vaultId) {
      setKeybundleNotice({ tone: 'error', text: t('genesis.vault_id_missing') });
      return;
    }
    setBusy('keybundle');
    setKeybundleNotice(null);
    const result = await saveVaultKeybundle(vaultId);
    setBusy(null);
    if (result.ok) {
      setHasBackup(true);
      const label = `${result.filename} (${sizeLabel(result.size)}) · ${result.sha256.slice(0, SHA_PREFIX_LENGTH)}`;
      setKeybundleNotice({ tone: 'ok', text: t('genesis.handover_saved', { label }) });
      return;
    }
    setKeybundleNotice({
      tone: result.error === 'canceled' ? 'info' : 'error',
      text: describeError(result.error),
    });
  };

  const onSaveCopies = async () => {
    setBusy('copies');
    setCopiesNotice(null);
    const result = await saveVaultFileCopies(['psnx', 'blend']);
    setBusy(null);
    if (result.saved.length > 0) setHasBackup(true);

    const names = (list: Array<VaultFileInfo | VaultFileSkipped>) =>
      list.map((entry) => entry.filename || entry.kind).join(', ');
    const parts: string[] = [];
    if (result.saved.length > 0) {
      parts.push(t('genesis.handover_copies_saved', { n: result.saved.length, label: names(result.saved) }));
    }
    const exists = result.skipped.filter((entry) => entry.reason === 'exists');
    if (exists.length > 0) parts.push(t('genesis.handover_skipped_exists', { label: names(exists) }));
    const missing = result.skipped.filter((entry) => entry.reason === 'missing');
    if (missing.length > 0) parts.push(t('genesis.handover_skipped_missing', { label: names(missing) }));
    const failed = result.skipped.filter((entry) => entry.reason === 'copy_failed');
    if (failed.length > 0) parts.push(t('genesis.export_failed', { message: names(failed) }));
    if (!result.ok && parts.length === 0) parts.push(describeError(result.error));

    const tone: Notice['tone'] =
      result.saved.length > 0 ? 'ok' : !result.ok && result.error === 'canceled' ? 'info' : 'error';
    setCopiesNotice({ tone, text: parts.join(' ') });
  };

  const onReveal = async () => {
    setRevealNotice(null);
    const result = await revealVaultFiles();
    if (!result.ok) setRevealNotice({ tone: 'error', text: describeError(result.error) });
  };

  const canContinue = hasBackup || (skipStep === 'confirm' && skipAcknowledged);
  const hasFiles = files.length > 0;

  return (
    <div style={panel}>
      <div style={panelTitle}>{t('genesis.handover_title')}</div>

      <ul style={explanation}>
        <li>{t('genesis.handover_psnx')}</li>
        <li>{t('genesis.handover_blend')}</li>
        <li>{t('genesis.handover_keybundle')}</li>
      </ul>

      <div style={warning}>{t('genesis.handover_warning')}</div>

      {hasFiles && (
        <div style={fileList}>
          <div style={fileListTitle}>{t('genesis.handover_files_title')}</div>
          {files.map((file) => (
            <div key={file.kind} style={fileRow}>
              <span style={fileName}>{file.filename}</span>
              <span style={fileMeta}>{sizeLabel(file.size)}</span>
              <span style={fileHash}>{file.sha256.slice(0, SHA_PREFIX_LENGTH)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={actionRow}>
        <button onClick={onSaveKeybundle} disabled={busy !== null} style={buttonPrimary}>
          {busy === 'keybundle' ? t('genesis.handover_saving') : t('genesis.handover_save_keybundle')}
        </button>
        {hasFiles && (
          <button onClick={onSaveCopies} disabled={busy !== null} style={button}>
            {busy === 'copies' ? t('genesis.handover_saving') : t('genesis.handover_save_copies')}
          </button>
        )}
        {hasFiles && (
          <button onClick={onReveal} style={buttonGhost}>
            {t('genesis.handover_reveal')}
          </button>
        )}
        {extraActions}
      </div>

      {keybundleNotice && <NoticeLine notice={keybundleNotice} />}
      {copiesNotice && <NoticeLine notice={copiesNotice} />}
      {revealNotice && <NoticeLine notice={revealNotice} />}

      <div style={gate}>
        {hasBackup && <div style={exportOk}>{t('genesis.handover_backup_ok')}</div>}
        <button
          onClick={onContinue}
          disabled={!canContinue}
          style={canContinue ? buttonGhost : buttonDisabled}
        >
          {continueLabel}
        </button>
        {!hasBackup && skipStep === 'hidden' && (
          <>
            <div style={gateHint}>{t('genesis.handover_gate_hint')}</div>
            <button type="button" onClick={() => setSkipStep('confirm')} style={linkButton}>
              {t('genesis.handover_skip_link')}
            </button>
          </>
        )}
        {!hasBackup && skipStep === 'confirm' && (
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={skipAcknowledged}
              onChange={(e) => setSkipAcknowledged(e.target.checked)}
              style={{ pointerEvents: 'auto' }}
            />
            <span>{t('genesis.handover_skip_confirm')}</span>
          </label>
        )}
      </div>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  const style = notice.tone === 'ok' ? exportOk : notice.tone === 'error' ? exportErr : noticeInfo;
  return <div style={style}>{notice.text}</div>;
}

const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  alignItems: 'center',
  width: 'min(560px, 92vw)',
  maxHeight: 'min(64vh, 640px)',
  overflowY: 'auto',
  padding: '18px 22px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  pointerEvents: 'auto',
  textAlign: 'left',
};
const panelTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 300,
  letterSpacing: 1.2,
  color: '#f6ecd0',
  alignSelf: 'center',
  textAlign: 'center',
};
const explanation: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12.5,
  lineHeight: 1.55,
  opacity: 0.8,
  alignSelf: 'stretch',
};
const warning: React.CSSProperties = {
  alignSelf: 'stretch',
  fontSize: 12.5,
  lineHeight: 1.5,
  padding: '8px 12px',
  borderRadius: 8,
  color: '#f0c070',
  background: 'rgba(240,192,112,0.08)',
  border: '1px solid rgba(240,192,112,0.28)',
};
const fileList: React.CSSProperties = {
  alignSelf: 'stretch',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const fileListTitle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 3,
  textTransform: 'uppercase',
  opacity: 0.5,
  marginBottom: 2,
};
const fileRow: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'baseline',
  fontSize: 12,
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Mono", monospace',
};
const fileName: React.CSSProperties = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 };
const fileMeta: React.CSSProperties = { opacity: 0.55, whiteSpace: 'nowrap' };
const fileHash: React.CSSProperties = { opacity: 0.45, letterSpacing: 0.5, whiteSpace: 'nowrap' };
const actionRow: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: 4,
};
const noticeInfo: React.CSSProperties = { fontSize: 12, opacity: 0.6 };
const gate: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'center',
  marginTop: 6,
  paddingTop: 12,
  borderTop: '1px solid rgba(255,255,255,0.08)',
  alignSelf: 'stretch',
};
const gateHint: React.CSSProperties = { fontSize: 11, opacity: 0.5 };
const linkButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 11,
  color: 'rgba(215,217,230,0.55)',
  textDecoration: 'underline',
  cursor: 'pointer',
  pointerEvents: 'auto',
};
const checkboxRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  fontSize: 11.5,
  lineHeight: 1.45,
  color: '#f0a0a0',
  maxWidth: 440,
  cursor: 'pointer',
  pointerEvents: 'auto',
};
