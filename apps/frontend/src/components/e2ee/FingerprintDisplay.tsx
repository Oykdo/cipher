/**
 * Fingerprint Display Component
 * 
 * Displays a cryptographic fingerprint with QR code
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface FingerprintDisplayProps {
  fingerprint: string;
  username: string;
  showQR?: boolean;
}

export function FingerprintDisplay({
  fingerprint,
  username,
  showQR = true,
}: FingerprintDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (showQR && fingerprint) {
      // Generate QR code
      const qrData = JSON.stringify({
        username,
        fingerprint: fingerprint.replace(/\s/g, ''),
      });

      QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
        .then(setQrDataUrl)
        .catch((err) => console.error('Failed to generate QR code:', err));
    }
  }, [fingerprint, username, showQR]);

  // Format fingerprint for display (groups of 4, 8 per line)
  const formatFingerprint = (fp: string): string[] => {
    const normalized = fp.replace(/\s/g, '');
    const groups: string[] = [];
    
    for (let i = 0; i < normalized.length; i += 4) {
      groups.push(normalized.substring(i, i + 4));
    }
    
    // Split into rows of 8 groups
    const rows: string[] = [];
    for (let i = 0; i < groups.length; i += 8) {
      rows.push(groups.slice(i, i + 8).join(' '));
    }
    
    return rows;
  };

  const rows = formatFingerprint(fingerprint);

  return (
    <div className="fingerprint-display">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Key Fingerprint</h3>
        <p className="text-sm text-muted-grey mb-4">
          User: <span className="font-mono font-bold">{username}</span>
        </p>
      </div>

      {/* Fingerprint Text */}
      <div className="bg-dark-grey p-4 rounded-lg mb-4">
        <div className="font-mono text-sm space-y-1">
          {rows.map((row, index) => (
            <div key={index} className="text-center tracking-wider">
              {row}
            </div>
          ))}
        </div>
      </div>

      {/* QR Code */}
      {showQR && qrDataUrl && (
        <div className="flex justify-center">
          <div className="bg-white p-4 rounded-lg">
            <img src={qrDataUrl} alt="Fingerprint QR Code" className="w-64 h-64" />
          </div>
        </div>
      )}

      {/* Copy Button */}
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => {
            navigator.clipboard.writeText(fingerprint.replace(/\s/g, ''));
            alert('Fingerprint copied to clipboard!');
          }}
          className="btn btn-secondary"
        >
          📋 Copy Fingerprint
        </button>
      </div>
    </div>
  );
}

