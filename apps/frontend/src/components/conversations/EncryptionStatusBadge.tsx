import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConversationEncryptionStatus } from '../../lib/e2ee/messagingIntegration';
import { AtomLoader } from '../ui';

interface EncryptionStatusBadgeProps {
  peerUsername: string;
  className?: string;
}

type EncryptionStatus = 'e2ee' | 'legacy' | 'none';

export function EncryptionStatusBadge({
  peerUsername,
  className = '',
}: EncryptionStatusBadgeProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EncryptionStatus>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadStatus = async () => {
      try {
        setLoading(true);
        const nextStatus = await getConversationEncryptionStatus(peerUsername);
        if (mounted) {
          setStatus(nextStatus);
        }
      } catch (error) {
        console.error('[EncryptionStatusBadge] Failed to load encryption status:', error);
        if (mounted) {
          setStatus('none');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadStatus();

    return () => {
      mounted = false;
    };
  }, [peerUsername]);

  if (loading) {
    return (
      <span className={`inline-flex items-center justify-center rounded-full ${className}`.trim()}>
        <AtomLoader size="sm" />
      </span>
    );
  }

  if (status === 'e2ee') {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 ${className}`.trim()}
        title={t('encryption.e2ee_active', 'End-to-End Encryption Active')}
      >
        E2EE
      </span>
    );
  }

  if (status === 'legacy') {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-200 ${className}`.trim()}
        title={t('encryption.legacy_active', 'Legacy encryption session')}
      >
        LEGACY
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border border-slate-600/70 bg-slate-900/70 px-2 py-0.5 text-xs font-semibold text-slate-400 ${className}`.trim()}
      title={t('encryption.unavailable', 'Encryption unavailable')}
    >
      OFF
    </span>
  );
}
