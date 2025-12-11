/**
 * Safety Number Verification Component
 *
 * Implements Signal-style Safety Numbers for out-of-band public key verification.
 * Allows users to verify they are communicating with the intended person.
 */

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import {
  generateCombinedSafetyNumber,
  generateQRCodeData,
  parseQRCodeData,
  verifyPublicKeyMatch,
  formatSafetyNumberForDisplay,
  generateVoiceVerificationCode,
} from '../shared/identity';
import { Button } from './ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/Dialog';
import { logger } from '../lib/logger';

interface SafetyNumberVerificationProps {
  localPublicKey: string;
  localIdentifier: string;
  remotePublicKey: string;
  remoteIdentifier: string;
  isVerified?: boolean;
  onVerificationChange?: (verified: boolean) => void;
}

export function SafetyNumberVerification({
  localPublicKey,
  localIdentifier,
  remotePublicKey,
  remoteIdentifier,
  isVerified = false,
  onVerificationChange,
}: SafetyNumberVerificationProps) {
  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [voiceCode, setVoiceCode] = useState<string>('');
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showMyQRCode, setShowMyQRCode] = useState(false);
  const [verified, setVerified] = useState(isVerified);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  // Generate Safety Number on mount
  useEffect(() => {
    generateCombinedSafetyNumber(
      localPublicKey,
      remotePublicKey,
      localIdentifier,
      remoteIdentifier
    ).then(setSafetyNumber);

    generateVoiceVerificationCode(remotePublicKey).then(setVoiceCode);
  }, [localPublicKey, remotePublicKey, localIdentifier, remoteIdentifier]);

  // Generate QR Code for local user
  useEffect(() => {
    const qrData = generateQRCodeData(localPublicKey, localIdentifier);
    QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      width: 300,
      margin: 2,
    }).then(setQrCodeDataURL);
  }, [localPublicKey, localIdentifier]);

  // Initialize QR Scanner
  const startQRScanner = async () => {
    if (!videoRef.current) return;

    try {
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => handleQRScanned(result.data),
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
        }
      );

      await scannerRef.current.start();
      setShowQRScanner(true);
    } catch (error) {
      logger.error('Failed to start QR scanner', error);
      alert('Impossible de démarrer la caméra. Vérifiez les permissions.');
    }
  };

  // Stop QR Scanner
  const stopQRScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    setShowQRScanner(false);
  };

  // Handle QR Code scanned
  const handleQRScanned = (qrData: string) => {
    stopQRScanner();

    const parsed = parseQRCodeData(qrData);

    if (!parsed) {
      alert('❌ QR Code invalide');
      return;
    }

    // Verify the scanned public key matches the expected remote public key
    if (verifyPublicKeyMatch(parsed.publicKey, remotePublicKey)) {
      setVerified(true);
      onVerificationChange?.(true);
      alert(`✅ Vérification réussie!\n\nContact: ${parsed.identifier}`);
    } else {
      alert(
        `⚠️ ATTENTION: CLÉS NE CORRESPONDENT PAS!\n\n` +
        `Attendu: ${remoteIdentifier}\n` +
        `Scanné: ${parsed.identifier}\n\n` +
        `Possible attaque MITM! Ne partagez PAS de données sensibles.`
      );
    }
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopQRScanner();
    };
  }, []);

  return (
    <div className="safety-number-verification p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
          🔐 Vérification de Sécurité
          {verified && (
            <span className="text-green-600 dark:text-green-400 text-sm">
              ✅ Vérifié
            </span>
          )}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Vérifiez que vous communiquez avec la bonne personne en comparant ce numéro.
        </p>
      </div>

      {/* Safety Number Display */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Numéro de Sécurité avec {remoteIdentifier}
        </label>
        <div className="bg-white dark:bg-gray-800 p-4 rounded border-2 border-gray-300 dark:border-gray-700">
          <div className="font-mono text-2xl text-center leading-relaxed whitespace-pre-line">
            {safetyNumber ? formatSafetyNumberForDisplay(safetyNumber) : 'Calcul en cours...'}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Ce numéro doit être identique des deux côtés. Comparez-le par téléphone, vidéo, ou en personne.
        </p>
      </div>

      {/* Voice Verification Code */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Code Vocal de Vérification
        </label>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-300 dark:border-blue-700">
          <div className="font-mono text-3xl text-center text-blue-600 dark:text-blue-400">
            {voiceCode || '------'}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Pour vérification rapide par téléphone: lisez ces 6 chiffres et comparez.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <Button
          onClick={startQRScanner}
          variant="outline"
          className="w-full"
          disabled={showQRScanner}
        >
          📱 Scanner le QR Code du contact
        </Button>

        <Button
          onClick={() => setShowMyQRCode(true)}
          variant="outline"
          className="w-full"
        >
          📲 Afficher mon QR Code
        </Button>

        {verified && (
          <Button
            onClick={() => {
              if (confirm('Êtes-vous sûr de vouloir révoquer la vérification de ce contact?')) {
                setVerified(false);
                onVerificationChange?.(false);
              }
            }}
            variant="outline"
            className="w-full text-orange-600"
          >
            ⚠️ Révoquer la Vérification
          </Button>
        )}
      </div>

      {/* QR Scanner Dialog */}
      <Dialog open={showQRScanner} onOpenChange={(open) => !open && stopQRScanner()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scanner le QR Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Demandez à {remoteIdentifier} d'afficher son QR Code et scannez-le avec votre caméra.
            </p>
            
            <video
              ref={videoRef}
              className="w-full rounded border-2 border-gray-300 dark:border-gray-700"
              style={{ maxHeight: '400px' }}
            />
            
            <Button onClick={stopQRScanner} variant="outline" className="w-full">
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* My QR Code Dialog */}
      <Dialog open={showMyQRCode} onOpenChange={setShowMyQRCode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mon QR Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Montrez ce QR Code à {remoteIdentifier} pour qu'ils puissent vérifier votre identité.
            </p>
            
            {qrCodeDataURL && (
              <div className="flex justify-center bg-white p-4 rounded">
                <img src={qrCodeDataURL} alt="Mon QR Code" className="max-w-full" />
              </div>
            )}
            
            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              {localIdentifier}
            </div>
            
            <Button onClick={() => setShowMyQRCode(false)} variant="outline" className="w-full">
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Security Warning */}
      {!verified && (
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ <strong>Contact non vérifié</strong>
            <br />
            Vérifiez l'identité de ce contact avant de partager des informations sensibles.
          </p>
        </div>
      )}
    </div>
  );
}