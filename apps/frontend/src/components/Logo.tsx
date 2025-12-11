/**
 * Logo Component - Project Chimera
 * 
 * Logo SVG Dead Drop avec gradient brand
 */

import { cn } from '../lib/utils';

export interface LogoProps {
  /** Taille du logo */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Classe CSS supplémentaire */
  className?: string;
  /** Afficher le texte "Dead Drop" */
  showText?: boolean;
}

export function Logo({ size = 'md', className, showText = false }: LogoProps) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <svg 
        className={cn(sizes[size], 'flex-shrink-0')} 
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Dead Drop Logo"
      >
        <defs>
          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#a5b4fc" />
          </linearGradient>
          
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Dead drop shape - stylized envelope/lockbox */}
        <g filter="url(#glow)">
          {/* Main container */}
          <rect 
            x="15" 
            y="30" 
            width="70" 
            height="50" 
            rx="8"
            fill="url(#logo-gradient)"
            opacity="0.9"
          />
          
          {/* Lock icon */}
          <circle 
            cx="50" 
            cy="50" 
            r="12" 
            fill="white" 
            opacity="0.95"
          />
          <circle 
            cx="50" 
            cy="50" 
            r="6" 
            fill="url(#logo-gradient)"
          />
          
          {/* Keyhole */}
          <rect 
            x="48" 
            y="52" 
            width="4" 
            height="6" 
            rx="1"
            fill="white"
            opacity="0.9"
          />
          
          {/* Top accent lines */}
          <line 
            x1="25" 
            y1="35" 
            x2="40" 
            y2="35" 
            stroke="white" 
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.4"
          />
          <line 
            x1="60" 
            y1="35" 
            x2="75" 
            y2="35" 
            stroke="white" 
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.4"
          />
        </g>
      </svg>
      
      {showText && (
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-200">
          Dead Drop
        </span>
      )}
    </div>
  );
}

/**
 * Logo monochrome (pour favicon)
 */
export function LogoMono({ className }: { className?: string }) {
  return (
    <svg 
      className={cn('w-full h-full', className)}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="15" y="30" width="70" height="50" rx="8" fill="currentColor"/>
      <circle cx="50" cy="50" r="12" fill="white"/>
      <circle cx="50" cy="50" r="6" fill="currentColor"/>
      <rect x="48" y="52" width="4" height="6" rx="1" fill="white"/>
    </svg>
  );
}
