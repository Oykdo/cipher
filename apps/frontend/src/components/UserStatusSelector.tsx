import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiv2 } from '../services/api-v2';

export type UserStatus = 'online' | 'busy' | 'away' | 'invisible';

interface UserStatusSelectorProps {
  currentStatus: UserStatus;
  onStatusChange?: (status: UserStatus) => void;
  compact?: boolean;
}

const STATUS_CONFIG: Record<UserStatus, { color: string; icon: string }> = {
  online: { color: 'bg-green-500', icon: '●' },
  busy: { color: 'bg-red-500', icon: '●' },
  away: { color: 'bg-yellow-500', icon: '●' },
  invisible: { color: 'bg-gray-500', icon: '○' },
};

export function UserStatusSelector({ currentStatus, onStatusChange, compact = false }: UserStatusSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<UserStatus>(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStatusChange = async (newStatus: UserStatus) => {
    if (newStatus === status || isUpdating) return;
    
    setIsUpdating(true);
    try {
      await apiv2.updateMyStatus(newStatus);
      setStatus(newStatus);
      onStatusChange?.(newStatus);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const config = STATUS_CONFIG[status];
  const statusOptions: UserStatus[] = ['online', 'busy', 'away', 'invisible'];

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 p-1 rounded hover:bg-white/10 transition-colors"
          disabled={isUpdating}
          title={t(`status.${status}`)}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
        </button>
        
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 bg-card-dark border border-white/10 rounded-lg shadow-xl z-50 min-w-[140px]">
            {statusOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => handleStatusChange(opt)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                  opt === status ? 'bg-white/5' : ''
                }`}
                disabled={isUpdating}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[opt].color}`} />
                <span className="text-pure-white">{t(`status.${opt}`)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
        disabled={isUpdating}
      >
        <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
        <span className="text-sm text-pure-white">{t(`status.${status}`)}</span>
        <svg className={`w-4 h-4 text-muted-grey transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-card-dark border border-white/10 rounded-lg shadow-xl z-50 min-w-full">
          {statusOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => handleStatusChange(opt)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                opt === status ? 'bg-white/5' : ''
              }`}
              disabled={isUpdating}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[opt].color}`} />
              <span className="text-pure-white">{t(`status.${opt}`)}</span>
              {opt === status && (
                <svg className="w-4 h-4 text-accent-cyan ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusIndicator({ status, size = 'sm' }: { status: UserStatus | 'offline'; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  const colorClass = status === 'offline' ? 'bg-gray-600' : STATUS_CONFIG[status as UserStatus]?.color || 'bg-gray-600';

  return (
    <span className={`${sizeClasses[size]} rounded-full ${colorClass} inline-block`} />
  );
}

export default UserStatusSelector;
