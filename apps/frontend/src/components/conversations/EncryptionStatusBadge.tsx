/**
 * Encryption Status Badge
 * 
 * Displays the encryption status of a conversation (E2EE or Pending)
 */

import { useEffect, useState } from 'react';
import { getConversationEncryptionStatus } from '../../lib/e2ee/messagingIntegration';

interface EncryptionStatusBadgeProps {
  peerUsername: string | undefined;
  className?: string;
}

export function EncryptionStatusBadge({ peerUsername, className = '' }: EncryptionStatusBadgeProps) {
  const [status, setStatus] = useState<'e2ee' | 'pending' | 'none'>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!peerUsername) {
      setStatus('none');
      setLoading(false);
      return;
    }

    setLoading(true);
    getConversationEncryptionStatus(peerUsername)
      .then((result) => {
        // Map 'legacy' to 'pending' since we no longer support legacy
        setStatus(result === 'e2ee' ? 'e2ee' : 'pending');
      })
      .catch(() => setStatus('pending'))
      .finally(() => setLoading(false));
  }, [peerUsername]);

  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${className}`}>
        <span className="animate-pulse">🔄</span>
        <span className="text-slate-400">...</span>
      </span>
    );
  }

  if (status === 'e2ee') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30 ${className}`}
        title="End-to-End Encrypted - Messages are encrypted on your device and can only be read by you and the recipient"
      >
        <span>🔒</span>
        <span className="font-medium">E2EE</span>
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 ${className}`}
        title="Waiting for key exchange - The recipient needs to come online to enable E2EE"
      >
        <span>⏳</span>
        <span className="font-medium">Pending</span>
      </span>
    );
  }

  return null;
}

/**
 * Compact version for conversation list
 */
export function EncryptionStatusIcon({ peerUsername }: { peerUsername: string | undefined }) {
  const [status, setStatus] = useState<'e2ee' | 'pending' | 'none'>('none');

  useEffect(() => {
    if (!peerUsername) {
      setStatus('none');
      return;
    }

    getConversationEncryptionStatus(peerUsername)
      .then((result) => setStatus(result === 'e2ee' ? 'e2ee' : 'pending'))
      .catch(() => setStatus('pending'));
  }, [peerUsername]);

  if (status === 'e2ee') {
    return (
      <span className="text-green-400" title="End-to-End Encrypted">
        🔒
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="text-blue-400" title="Waiting for key exchange">
        ⏳
      </span>
    );
  }

  return null;
}

