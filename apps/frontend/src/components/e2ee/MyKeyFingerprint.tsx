/**
 * My Key Fingerprint Component
 * 
 * Displays the current user's key fingerprint
 */

import { useState, useEffect } from 'react';
import { FingerprintDisplay } from './FingerprintDisplay';
import { getMyFingerprint, getCurrentUsername } from '../../lib/e2ee/e2eeService';

export function MyKeyFingerprint() {
  const [fingerprint, setFingerprint] = useState<string>('');
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    loadFingerprint();
  }, []);

  const loadFingerprint = () => {
    const fp = getMyFingerprint();
    const user = getCurrentUsername();

    if (fp) setFingerprint(fp);
    if (user) setUsername(user);
  };

  if (!fingerprint) {
    return (
      <div className="alert alert-warning">
        ⚠️ E2EE not initialized. Please log in to view your fingerprint.
      </div>
    );
  }

  return (
    <div className="my-key-fingerprint">
      <h2 className="text-2xl font-bold mb-4">Your Security Key</h2>
      
      <div className="alert alert-info mb-4">
        ℹ️ Share this fingerprint with your contacts to verify your identity.
        They can scan the QR code or compare the text manually.
      </div>

      <FingerprintDisplay
        fingerprint={fingerprint}
        username={username}
        showQR={true}
      />
    </div>
  );
}

