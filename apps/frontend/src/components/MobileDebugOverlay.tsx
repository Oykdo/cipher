/**
 * Mobile Debug Overlay
 * Displays crypto initialization errors on-screen for mobile debugging
 * 
 * TEMPORARY: Remove after fixing mobile E2EE issues
 */

import { useEffect, useState } from 'react';

interface DebugLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

// Global error store accessible from anywhere
const debugLogs: DebugLog[] = [];
let updateCallback: (() => void) | null = null;

export function addDebugLog(level: 'info' | 'warn' | 'error', message: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  debugLogs.push({ timestamp, level, message });
  // Keep only last 50 logs
  if (debugLogs.length > 50) debugLogs.shift();
  updateCallback?.();
}

// Expose globally for cross-module access (ES modules don't support require())
declare global {
  interface Window {
    __mobileDebugLog?: typeof addDebugLog;
  }
}
if (typeof window !== 'undefined') {
  window.__mobileDebugLog = addDebugLog;
}

// Intercept crypto-related errors
export function setupMobileDebugger() {
  // Check environment
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isSecure = window.isSecureContext;
  
  addDebugLog('info', `Platform: ${isMobile ? 'MOBILE' : 'DESKTOP'}`);
  addDebugLog('info', `Secure Context: ${isSecure ? 'YES' : 'NO'}`);
  addDebugLog('info', `Protocol: ${window.location.protocol}`);
  
  // Check crypto.subtle availability
  if (typeof crypto !== 'undefined') {
    addDebugLog('info', 'crypto: available');
    if (crypto.subtle) {
      addDebugLog('info', 'crypto.subtle: available');
    } else {
      addDebugLog('error', 'crypto.subtle: NOT AVAILABLE (needs HTTPS)');
    }
  } else {
    addDebugLog('error', 'crypto: NOT AVAILABLE');
  }
  
  // Check localStorage
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    addDebugLog('info', 'localStorage: available');
  } catch (e) {
    addDebugLog('error', `localStorage: BLOCKED (${e})`);
  }
  
  // Check WASM support
  try {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
      addDebugLog('info', 'WebAssembly: supported');
    } else {
      addDebugLog('error', 'WebAssembly: NOT SUPPORTED');
    }
  } catch (e) {
    addDebugLog('error', `WebAssembly: ERROR (${e})`);
  }
  
  // Intercept global errors
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map(a => 
      typeof a === 'object' ? JSON.stringify(a, null, 0).slice(0, 200) : String(a)
    ).join(' ');
    if (msg.toLowerCase().includes('crypto') || 
        msg.toLowerCase().includes('sodium') ||
        msg.toLowerCase().includes('argon') ||
        msg.toLowerCase().includes('wasm') ||
        msg.toLowerCase().includes('e2ee')) {
      addDebugLog('error', msg.slice(0, 300));
    }
    originalError.apply(console, args);
  };
  
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason);
    addDebugLog('error', `UNHANDLED: ${msg.slice(0, 300)}`);
  });
}

export function MobileDebugOverlay() {
  const [logs, setLogs] = useState<DebugLog[]>([...debugLogs]);
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  
  useEffect(() => {
    updateCallback = () => setLogs([...debugLogs]);
    return () => { updateCallback = null; };
  }, []);
  
  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed',
          bottom: 10,
          right: 10,
          zIndex: 99999,
          background: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: 40,
          height: 40,
          fontSize: 18,
          cursor: 'pointer',
        }}
      >
        🐛
      </button>
    );
  }
  
  const errorCount = logs.filter(l => l.level === 'error').length;
  
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.95)',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: 11,
        maxHeight: expanded ? '80vh' : 150,
        overflow: 'auto',
        borderTop: errorCount > 0 ? '3px solid #ef4444' : '3px solid #22c55e',
      }}
    >
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        padding: '4px 8px',
        background: errorCount > 0 ? '#7f1d1d' : '#14532d',
        position: 'sticky',
        top: 0,
      }}>
        <span>🔍 Mobile Debug {errorCount > 0 && `(${errorCount} errors)`}</span>
        <div>
          <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', color: 'white', marginRight: 8 }}>
            {expanded ? '▼' : '▲'}
          </button>
          <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: 'white' }}>
            ✕
          </button>
        </div>
      </div>
      <div style={{ padding: 8 }}>
        {logs.map((log, i) => (
          <div 
            key={i} 
            style={{ 
              color: log.level === 'error' ? '#f87171' : log.level === 'warn' ? '#fbbf24' : '#a1a1aa',
              marginBottom: 2,
              wordBreak: 'break-all',
            }}
          >
            <span style={{ color: '#6b7280' }}>[{log.timestamp}]</span>{' '}
            {log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️'}{' '}
            {log.message}
          </div>
        ))}
        {logs.length === 0 && <div style={{ color: '#6b7280' }}>No logs yet...</div>}
      </div>
    </div>
  );
}
