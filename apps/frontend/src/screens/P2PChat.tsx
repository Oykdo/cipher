/**
 * P2P Chat Demo Component
 * 
 * DEMO: Test P2P communication between two browsers
 * 
 * USAGE:
 * 1. Open in two browser windows
 * 2. Login with different users
 * 3. Messages sent directly P2P (no server)
 * 
 * ARCHITECTURE FIX: P2P now uses unified E2EE (Double Ratchet) via peerUsername,
 * ensuring compatibility with server relay transport.
 */

import { useState, useEffect } from 'react';
import { useP2P } from '../hooks/useP2P';
import { useAuthStore } from '../store/auth';
import { P2PMessage } from '../lib/p2p/webrtc';

export default function P2PChat() {
  const session = useAuthStore((state) => state.session);
  const [messages, setMessages] = useState<Array<{ from: string; text: string; timestamp: number }>>([]);
  const [messageText, setMessageText] = useState('');
  const [targetPeerId, setTargetPeerId] = useState('');
  const [targetPeerUsername, setTargetPeerUsername] = useState('');
  const [conversationId] = useState('demo-conversation');

  // Initialize P2P
  const { sendMessage, onlinePeers, isInitialized, connectToPeer } = useP2P({
    onMessage: (_convId, message: P2PMessage) => {
      if (message.type === 'text') {
        setMessages((prev) => [
          ...prev,
          {
            from: 'peer',
            text: message.payload.text,
            timestamp: message.timestamp,
          },
        ]);
      }
    },
  });

  // Auto-connect to first online peer
  // NOTE: In production, peerUsername would come from conversation metadata
  useEffect(() => {
    if (onlinePeers.length > 0 && !targetPeerId) {
      const firstPeer = onlinePeers[0];
      setTargetPeerId(firstPeer);
      // DEMO: Using peerId as username - in production, resolve from user data
      setTargetPeerUsername(firstPeer);
      
      // Connect as initiator if we're the "higher" user ID
      const shouldInitiate = !!(session?.user?.id && session.user.id > firstPeer);
      // ARCHITECTURE FIX: Pass peerUsername for unified E2EE
      connectToPeer(firstPeer, firstPeer, conversationId, shouldInitiate);
    }
  }, [onlinePeers, targetPeerId, session?.user?.id]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !targetPeerId || !targetPeerUsername) return;

    try {
      // Add to local messages
      setMessages((prev) => [
        ...prev,
        {
          from: 'me',
          text: messageText,
          timestamp: Date.now(),
        },
      ]);

      // Send via P2P with unified E2EE
      await sendMessage(targetPeerId, targetPeerUsername, conversationId, messageText);
      setMessageText('');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message: ' + (error as Error).message);
    }
  };

  // Garde supplémentaire : pas de P2P sans session + token
  if (!session?.accessToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-bold mb-4">Please login first</h1>
          <a href="/login" className="text-brand-400 hover:underline">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            🌐 P2P Chat Demo
          </h1>
          <p className="text-slate-400">
            Direct peer-to-peer messaging via WebRTC
          </p>
        </div>

        {/* Status */}
        <div className="glass-panel rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-slate-400 text-sm">Status</div>
              <div className={`text-lg font-semibold ${isInitialized ? 'text-green-400' : 'text-yellow-400'}`}>
                {isInitialized ? '● Connected' : '○ Connecting...'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-sm">Your ID</div>
              <div className="text-white text-sm font-mono">
                {session.user.id.substring(0, 12)}...
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-sm">Online Peers</div>
              <div className="text-white text-lg font-semibold">
                {onlinePeers.length}
              </div>
            </div>
          </div>
        </div>

        {/* Online Peers */}
        {onlinePeers.length > 0 && (
          <div className="glass-panel rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">Online Peers</h3>
            <div className="space-y-2">
              {onlinePeers.map((peerId) => (
                <div
                  key={peerId}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    peerId === targetPeerId
                      ? 'bg-brand-600/20 border border-brand-400'
                      : 'bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-white font-mono text-sm">
                      {peerId.substring(0, 12)}...
                    </span>
                  </div>
                  {peerId === targetPeerId && (
                    <span className="text-brand-400 text-xs font-semibold">
                      CONNECTED
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="glass-panel rounded-lg p-4 mb-6 h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500">
              No messages yet. Send the first message!
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md p-3 rounded-lg ${
                      msg.from === 'me'
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-700 text-white'
                    }`}
                  >
                    <div className="text-sm mb-1 opacity-70">
                      {msg.from === 'me' ? 'You' : 'Peer'}
                    </div>
                    <div>{msg.text}</div>
                    <div className="text-xs opacity-50 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={
                targetPeerId
                  ? 'Type a message...'
                  : 'Waiting for peer to connect...'
              }
              disabled={!targetPeerId || !isInitialized}
              className="flex-1 bg-slate-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || !targetPeerId || !isInitialized}
              className="btn-primary px-6"
            >
              Send
            </button>
          </div>
          {!targetPeerId && (
            <div className="mt-2 text-yellow-400 text-sm">
              ⚠️ No peer connected. Open this page in another browser window.
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h3 className="text-blue-400 font-semibold mb-2">🔐 How it works</h3>
          <ul className="text-slate-300 text-sm space-y-1">
            <li>✅ Messages sent directly peer-to-peer (WebRTC)</li>
            <li>✅ No server sees your messages</li>
            <li>✅ End-to-end encrypted by default</li>
            <li>✅ Signaling server only for initial handshake</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
