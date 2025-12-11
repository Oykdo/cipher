import { Avatar } from "./Avatar";
import { ConnectionStatus } from "./ConnectionStatus";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";

export interface MobileHeaderProps {
  username: string;
  peerName?: string;
  onMenuClick: () => void;
}

export function MobileHeader({ username, peerName, onMenuClick }: MobileHeaderProps) {
  const { t } = useTranslation();
  
  return (
    <header className="lg:hidden sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 py-3 flex items-center justify-between min-h-[56px]">
      <button 
        onClick={onMenuClick}
        className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={t('open_menu')}
      >
        <MenuIcon className="w-6 h-6 text-slate-100" />
      </button>
      
      <div className="flex-1 text-center min-w-0">
        {peerName ? (
          <div className="flex items-center justify-center gap-2">
            <Avatar name={peerName} size={32} />
            <h1 className="text-base font-semibold text-slate-100 truncate">{peerName}</h1>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Logo size="sm" />
            <h1 className="text-lg font-semibold text-slate-100">Dead Drop</h1>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <Avatar name={username} size={32} />
      </div>
    </header>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
      aria-hidden="true"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M4 6h16M4 12h16M4 18h16" 
      />
    </svg>
  );
}
