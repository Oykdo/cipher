/**
 * Connection Status Component
 * Displays WebSocket connection status
 */

import { useWebSocket } from '../hooks/useWebSocket';

export function ConnectionStatus() {
  const { isConnected } = useWebSocket();

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}
        title={isConnected ? 'Connected' : 'Disconnected'}
      />
    </div>
  );
}
