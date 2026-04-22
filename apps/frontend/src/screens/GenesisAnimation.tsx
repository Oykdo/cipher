import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import GenesisScene from './genesis/GenesisScene';
import { exportVaultKeybundle } from '../lib/keybundle';

type PhaseEvent = {
  phase: number;
  ratio: number;
  label: string;
  metadata: Record<string, unknown>;
};

type CeremonyState =
  | { kind: 'idle' }
  | { kind: 'running'; startedAt: number }
  | { kind: 'done'; finishedAt: number }
  | { kind: 'error'; message: string };

/**
 * Translation-key pickers for the coarse-grained ceremony stage / status
 * copy. The user never sees the cryptographic vocabulary — each block of
 * phases maps to a friendly stage name resolved through i18n.
 */
function stageKey(phase: number): string {
  if (phase <= 0) return 'genesis.stage_preparation';
  if (phase <= 2) return 'genesis.stage_invocation';
  if (phase <= 5) return 'genesis.stage_crystallization';
  if (phase <= 8) return 'genesis.stage_sealing';
  return 'genesis.stage_emergence';
}

function statusKey(phase: number): string {
  if (phase <= 0) return 'genesis.status_preparation';
  if (phase <= 2) return 'genesis.status_invocation';
  if (phase <= 5) return 'genesis.status_crystallization';
  if (phase <= 8) return 'genesis.status_sealing';
  return 'genesis.status_emergence';
}

export default function GenesisAnimation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { defaultName, fromSignup } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      // Leave the input empty by default so the user consciously names their
      // vault. A query-string override (`?name=...`) is still honored for
      // tests / deep links.
      defaultName: params.get('name') ?? '',
      fromSignup: params.get('from') === 'signup',
    };
  }, []);

  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<CeremonyState>({ kind: 'idle' });
  const [currentPhase, setCurrentPhase] = useState<PhaseEvent | null>(null);
  const [finalPayload, setFinalPayload] = useState<Record<string, unknown> | null>(null);
  const [exportState, setExportState] = useState<'idle' | 'downloading' | 'ok' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => {
    sourceRef.current?.close();
  }, []);

  const startCeremony = () => {
    sourceRef.current?.close();
    setState({ kind: 'running', startedAt: Date.now() });
    setCurrentPhase(null);
    setFinalPayload(null);

    const url = `/api/v2/auth/genesis-stream?name=${encodeURIComponent(name)}`;
    let src: EventSource;
    try {
      src = new EventSource(url);
    } catch (err) {
      setState({ kind: 'error', message: `${t('genesis.stream_open_error')} ${String(err)}` });
      return;
    }
    sourceRef.current = src;

    src.addEventListener('phase', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as PhaseEvent;
        if (data.phase === -1 || data.label === 'ERROR') {
          const errMeta = data.metadata as { error?: string } | undefined;
          setState({ kind: 'error', message: errMeta?.error ?? t('genesis.generation_failed') });
          return;
        }
        setCurrentPhase(data);
        if (data.phase === 9 && data.label === 'HOLOGRAPHIC_CERTIFICATE') {
          setFinalPayload(data.metadata);
        }
      } catch {
        // ignore malformed events
      }
    });

    src.addEventListener('done', () => {
      src.close();
      sourceRef.current = null;
      setState({ kind: 'done', finishedAt: Date.now() });
    });

    src.addEventListener('error', (ev) => {
      const raw = typeof (ev as MessageEvent).data === 'string' ? (ev as MessageEvent).data : '';
      let msg = t('genesis.stream_generic_error');
      if (raw) {
        try {
          const data = JSON.parse(raw);
          msg = data.stderr?.trim() || data.message || (data.code !== undefined ? `exit ${data.code}` : msg);
        } catch {
          // keep default
        }
      } else if (src.readyState === EventSource.CLOSED) {
        msg = t('genesis.stream_closed_early');
      }
      setState({ kind: 'error', message: msg });
      src.close();
      sourceRef.current = null;
    });
  };

  const phase = currentPhase?.phase ?? 0;
  const running = state.kind === 'running';
  const done = state.kind === 'done';
  const status = done ? t('genesis.welcome') : t(statusKey(phase));
  const progress = Math.min(1, ((Math.max(1, phase) - 1) + (currentPhase?.ratio ?? 0)) / 9);

  return (
    <div style={outer}>
      <div style={canvasLayer}>
        <GenesisScene
          phase={phase}
          ratio={currentPhase?.ratio ?? 0}
          finalPayload={finalPayload}
        />
      </div>

      <div style={textLayer}>
        {state.kind === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <h1 style={title}>{t('genesis.idle_title')}</h1>
            <p style={subtitle}>{t('genesis.idle_subtitle')}</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('genesis.name_placeholder')}
              style={input}
            />
            {/* A quiet nod — an identity is a name that persists. */}
            {name.trim().toLowerCase() === 'benjamin' && (
              <div style={tribute}>pour Benjamin</div>
            )}
            <button onClick={startCeremony} disabled={!name.trim()} style={button}>
              {t('genesis.start')}
            </button>
          </div>
        )}

        {running && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={stageLabel}>{t(stageKey(phase))}</div>
            <div style={statusText}>{status}</div>
            <div style={barTrack}>
              <div style={{ ...barFill, width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}

        {done && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
            <div style={welcome}>{t('genesis.welcome')}</div>
            <div style={backupNotice}>{t('genesis.backup_notice')}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={async () => {
                  const vaultId = String(finalPayload?.vault_id ?? finalPayload?.key_id ?? '');
                  if (!vaultId) { setExportState('error'); setExportMessage(t('genesis.vault_id_missing')); return; }
                  setExportState('downloading');
                  setExportMessage('');
                  const r = await exportVaultKeybundle(vaultId);
                  if (r.ok) {
                    setExportState('ok');
                    setExportMessage(`${r.filename} (${Math.round(r.size / 1024)} KB)`);
                  } else {
                    setExportState('error');
                    setExportMessage(r.error);
                  }
                }}
                disabled={exportState === 'downloading'}
                style={buttonPrimary}
              >
                {exportState === 'downloading' ? t('genesis.downloading') : t('genesis.download')}
              </button>
              {typeof finalPayload?.viewer_url === 'string' && (
                <a
                  href={finalPayload.viewer_url as string}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonGhost}
                >
                  {t('genesis.view_hologram')}
                </a>
              )}
              {fromSignup ? (
                <button
                  onClick={() => navigate('/signup?step=vault-bridge&auto=connect')}
                  style={buttonGhost}
                >
                  {t('genesis.enter_cipher')}
                </button>
              ) : (
                <button onClick={() => navigate('/conversations')} style={buttonGhost}>
                  {t('genesis.continue')}
                </button>
              )}
            </div>
            {exportState === 'ok' && (
              <div style={exportOk}>{t('genesis.downloaded', { label: exportMessage })}</div>
            )}
            {exportState === 'error' && (
              <div style={exportErr}>{t('genesis.export_failed', { message: exportMessage })}</div>
            )}
            {typeof finalPayload?.viewer_error === 'string' && (
              <div style={exportErr}>{t('genesis.hologram_unavailable', { error: String(finalPayload.viewer_error) })}</div>
            )}
            {typeof finalPayload?.register_error === 'string' && (
              <div style={exportErr}>{t('genesis.register_error', { error: String(finalPayload.register_error) })}</div>
            )}
            {typeof finalPayload?.bridge_error === 'string' && (
              <div style={exportErr}>{t('genesis.bridge_error', { error: String(finalPayload.bridge_error) })}</div>
            )}
          </div>
        )}

        {state.kind === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={errorText}>{t('genesis.error_title')}</div>
            <div style={errorDetail}>{state.message}</div>
            <button onClick={startCeremony} style={button}>{t('genesis.retry')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const outer: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  background: '#04050c',
  color: '#d7d9e6',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  overflow: 'hidden',
};
const canvasLayer: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
};
const textLayer: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingBottom: '12vh',
  textAlign: 'center',
  pointerEvents: 'none',
};
const title: React.CSSProperties = { margin: 0, fontSize: 32, fontWeight: 300, letterSpacing: 1 };
const subtitle: React.CSSProperties = { margin: 0, fontSize: 14, opacity: 0.65 };
const tribute: React.CSSProperties = {
  fontStyle: 'italic',
  fontSize: 12,
  letterSpacing: 0.4,
  color: 'rgba(246,236,208,0.55)',
  marginTop: -4,
};
const stageLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 4,
  textTransform: 'uppercase',
  opacity: 0.55,
};
const statusText: React.CSSProperties = { fontSize: 18, fontWeight: 300, letterSpacing: 0.3 };
const welcome: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 200,
  letterSpacing: 2,
  color: '#f6ecd0',
};
const barTrack: React.CSSProperties = {
  marginTop: 6,
  width: 280,
  height: 2,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 1,
  overflow: 'hidden',
};
const barFill: React.CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg, rgba(122,150,255,0.7), rgba(180,140,255,0.9))',
  transition: 'width 500ms ease-out',
};
const input: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: '#eef1ff',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '10px 14px',
  fontFamily: 'inherit',
  fontSize: 15,
  width: 260,
  textAlign: 'center',
  outline: 'none',
  pointerEvents: 'auto',
};
const button: React.CSSProperties = {
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
const buttonPrimary: React.CSSProperties = {
  ...button,
  background: 'linear-gradient(180deg, rgba(246,236,208,0.14), rgba(246,236,208,0.04))',
  borderColor: 'rgba(246,236,208,0.42)',
  color: '#f6ecd0',
};
const buttonGhost: React.CSSProperties = {
  ...button,
  textDecoration: 'none',
  display: 'inline-block',
};
const errorText: React.CSSProperties = { fontSize: 16, color: '#f0a0a0' };
const errorDetail: React.CSSProperties = { fontSize: 12, opacity: 0.55, maxWidth: 420 };
const backupNotice: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
  maxWidth: 440,
  lineHeight: 1.5,
  marginTop: -4,
};
const exportOk: React.CSSProperties = { fontSize: 12, color: '#a0e0a0', opacity: 0.8 };
const exportErr: React.CSSProperties = { fontSize: 12, color: '#f0a0a0', opacity: 0.85, maxWidth: 420 };
