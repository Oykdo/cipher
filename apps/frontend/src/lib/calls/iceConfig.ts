// Single source of truth for the ICE server list used by every WebRTC peer
// connection in Cipher (1:1 calls via CallManager, P2P data channel via
// lib/p2p/webrtc.ts). Real-world calls fail behind symmetric NAT / corporate
// firewalls when only STUN is configured; a TURN relay is mandatory.
//
// The default fallback uses Metered's public Open Relay project — fine for
// alpha testing. Production deployments should override via env:
//
//   VITE_TURN_URL=turns:turn.example.org:443?transport=tcp
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...
//
// VITE_TURN_URL may be a comma-separated list to advertise multiple endpoints
// (e.g. UDP/TCP/TLS variants of the same server).

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const FALLBACK_TURN: RTCIceServer = {
  urls: [
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turn:openrelay.metered.ca:443?transport=tcp',
  ],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

function readEnv(name: string): string | undefined {
  const raw = (import.meta.env as Record<string, string | undefined>)[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getIceServers(): RTCIceServer[] {
  const turnUrl = readEnv('VITE_TURN_URL');
  const turnUsername = readEnv('VITE_TURN_USERNAME');
  const turnCredential = readEnv('VITE_TURN_CREDENTIAL');

  if (turnUrl && turnUsername && turnCredential) {
    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    return [
      ...DEFAULT_STUN,
      { urls, username: turnUsername, credential: turnCredential },
    ];
  }

  return [...DEFAULT_STUN, FALLBACK_TURN];
}
