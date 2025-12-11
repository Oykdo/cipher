/**
 * P2P Key Exchange Module
 * 
 * ARCHITECTURE:
 * - Direct key bundle exchange between peers via P2P
 * - Fingerprint verification via QR code or shared secret
 * - Reduces dependency on server for /api/v2/e2ee/keys
 * - Server remains backup for users never online simultaneously
 * 
 * SECURITY:
 * - Key bundles signed by identity key
 * - Fingerprint comparison for MITM prevention
 * - Optional passphrase verification for extra security
 */

export interface KeyBundle {
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
  fingerprint: string;
  timestamp: number;
}

export interface KeyExchangeMessage {
  type: 'key_request' | 'key_response' | 'key_verify';
  payload: KeyExchangePayload;
  timestamp: number;
  signature?: string;
}

type KeyExchangePayload = 
  | { type: 'request'; requestId: string }
  | { type: 'response'; requestId: string; keyBundle: KeyBundle }
  | { type: 'verify'; fingerprint: string; verified: boolean };

export interface PendingKeyRequest {
  requestId: string;
  peerId: string;
  createdAt: number;
  resolve: (bundle: KeyBundle) => void;
  reject: (error: Error) => void;
}

export type KeyBundleSender = (peerId: string, message: KeyExchangeMessage) => Promise<void>;
export type KeyBundleProvider = () => Promise<KeyBundle | null>;
export type KeyBundleReceiver = (peerId: string, bundle: KeyBundle) => void;

export class P2PKeyExchange {
  private pendingRequests: Map<string, PendingKeyRequest> = new Map();
  private sendMessage?: KeyBundleSender;
  private getMyKeyBundle?: KeyBundleProvider;
  private onKeyBundleReceived?: KeyBundleReceiver;
  private requestTimeout = 30000; // 30 seconds

  /**
   * Set callback for sending key exchange messages
   */
  setSendCallback(callback: KeyBundleSender): void {
    this.sendMessage = callback;
  }

  /**
   * Set callback for providing own key bundle
   */
  setKeyBundleProvider(callback: KeyBundleProvider): void {
    this.getMyKeyBundle = callback;
  }

  /**
   * Set callback when key bundle is received
   */
  setKeyBundleReceiver(callback: KeyBundleReceiver): void {
    this.onKeyBundleReceived = callback;
  }

  /**
   * Request key bundle from peer via P2P
   */
  async requestKeyBundle(peerId: string): Promise<KeyBundle> {
    if (!this.sendMessage) {
      throw new Error('Send callback not configured');
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Key request timeout'));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, {
        requestId,
        peerId,
        createdAt: Date.now(),
        resolve: (bundle) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          resolve(bundle);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(error);
        },
      });

      const message: KeyExchangeMessage = {
        type: 'key_request',
        payload: { type: 'request', requestId },
        timestamp: Date.now(),
      };

      this.sendMessage!(peerId, message).catch(reject);
      console.log(`🔑 [KeyExchange] Requesting key bundle from ${peerId}`);
    });
  }

  /**
   * Handle incoming key exchange message
   */
  async handleMessage(peerId: string, message: KeyExchangeMessage): Promise<void> {
    console.log(`🔑 [KeyExchange] Received ${message.type} from ${peerId}`);

    switch (message.type) {
      case 'key_request':
        await this.handleKeyRequest(peerId, message.payload as { type: 'request'; requestId: string });
        break;
      case 'key_response':
        this.handleKeyResponse(peerId, message.payload as { type: 'response'; requestId: string; keyBundle: KeyBundle });
        break;
      case 'key_verify':
        this.handleKeyVerify(peerId, message.payload as { type: 'verify'; fingerprint: string; verified: boolean });
        break;
    }
  }

  /**
   * Handle key request from peer
   */
  private async handleKeyRequest(
    peerId: string,
    payload: { type: 'request'; requestId: string }
  ): Promise<void> {
    if (!this.sendMessage || !this.getMyKeyBundle) {
      console.warn('⚠️ [KeyExchange] Cannot respond to key request - not configured');
      return;
    }

    const keyBundle = await this.getMyKeyBundle();
    if (!keyBundle) {
      console.warn('⚠️ [KeyExchange] No key bundle available');
      return;
    }

    const response: KeyExchangeMessage = {
      type: 'key_response',
      payload: {
        type: 'response',
        requestId: payload.requestId,
        keyBundle,
      },
      timestamp: Date.now(),
    };

    await this.sendMessage(peerId, response);
    console.log(`🔑 [KeyExchange] Sent key bundle to ${peerId}`);
  }

  /**
   * Handle key response from peer
   */
  private handleKeyResponse(
    peerId: string,
    payload: { type: 'response'; requestId: string; keyBundle: KeyBundle }
  ): void {
    const pending = this.pendingRequests.get(payload.requestId);
    if (!pending) {
      console.warn('⚠️ [KeyExchange] Received response for unknown request');
      return;
    }

    if (pending.peerId !== peerId) {
      console.warn('⚠️ [KeyExchange] Response from unexpected peer');
      pending.reject(new Error('Response from unexpected peer'));
      return;
    }

    // Notify about received key bundle
    this.onKeyBundleReceived?.(peerId, payload.keyBundle);
    pending.resolve(payload.keyBundle);
    console.log(`🔑 [KeyExchange] Received key bundle from ${peerId}`);
  }

  /**
   * Handle key verification message
   */
  private handleKeyVerify(
    peerId: string,
    payload: { type: 'verify'; fingerprint: string; verified: boolean }
  ): void {
    console.log(`🔑 [KeyExchange] Key verification from ${peerId}: ${payload.verified ? 'VERIFIED' : 'FAILED'}`);
  }

  /**
   * Send verification confirmation to peer
   */
  async sendVerification(peerId: string, fingerprint: string, verified: boolean): Promise<void> {
    if (!this.sendMessage) {
      throw new Error('Send callback not configured');
    }

    const message: KeyExchangeMessage = {
      type: 'key_verify',
      payload: { type: 'verify', fingerprint, verified },
      timestamp: Date.now(),
    };

    await this.sendMessage(peerId, message);
  }

  /**
   * Generate fingerprint display string (for QR code or visual comparison)
   */
  static generateFingerprintDisplay(fingerprint: string): string {
    // Format fingerprint into groups of 4 characters
    const groups: string[] = [];
    for (let i = 0; i < fingerprint.length; i += 4) {
      groups.push(fingerprint.slice(i, i + 4).toUpperCase());
    }
    return groups.join(' ');
  }

  /**
   * Generate QR code data for fingerprint verification
   */
  static generateQRData(
    myFingerprint: string,
    peerFingerprint: string,
    myUsername: string,
    peerUsername: string
  ): string {
    const data = {
      v: 1, // version
      m: myFingerprint,
      p: peerFingerprint,
      mu: myUsername,
      pu: peerUsername,
      t: Date.now(),
    };
    return JSON.stringify(data);
  }

  /**
   * Parse QR code data for verification
   */
  static parseQRData(qrData: string): {
    myFingerprint: string;
    peerFingerprint: string;
    myUsername: string;
    peerUsername: string;
    timestamp: number;
  } | null {
    try {
      const data = JSON.parse(qrData);
      if (data.v !== 1) return null;
      return {
        myFingerprint: data.m,
        peerFingerprint: data.p,
        myUsername: data.mu,
        peerUsername: data.pu,
        timestamp: data.t,
      };
    } catch {
      return null;
    }
  }

  /**
   * Verify fingerprints match
   */
  static verifyFingerprints(expected: string, actual: string): boolean {
    return expected.toLowerCase() === actual.toLowerCase();
  }

  /**
   * Generate verification code from fingerprints (for phone call verification)
   */
  static generateVerificationCode(fingerprint1: string, fingerprint2: string): string {
    // Combine fingerprints and take first 6 digits
    const combined = fingerprint1 + fingerprint2;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString().slice(0, 6).padStart(6, '0');
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Key exchange cleared'));
    }
    this.pendingRequests.clear();
  }
}

// Singleton instance
let instance: P2PKeyExchange | null = null;

export function getKeyExchange(): P2PKeyExchange {
  if (!instance) {
    instance = new P2PKeyExchange();
  }
  return instance;
}

export function resetKeyExchange(): void {
  if (instance) {
    instance.clear();
    instance = null;
  }
}
