/**
 * EmptyState Component - Project Chimera
 * 
 * Composant pour états vides avec illustration et action
 */

import { Button } from '../Button';
import { cn } from '../../../lib/utils';

export interface EmptyStateProps {
  /** Icône emoji ou React node */
  icon?: React.ReactNode;
  /** Titre principal */
  title: string;
  /** Description */
  description?: string;
  /** Bouton d'action */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Illustration SVG prédéfinie */
  illustration?: 'conversations' | 'messages' | 'search' | 'none';
  /** Classe CSS supplémentaire */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  illustration,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 px-6 text-center',
      className
    )}>
      {/* Illustration ou icône */}
      {illustration && illustration !== 'none' && (
        <Illustration type={illustration} />
      )}
      
      {icon && !illustration && (
        <div className="mb-4 text-5xl opacity-30" aria-hidden="true">
          {icon}
        </div>
      )}
      
      {/* Titre */}
      <h3 className="text-xl font-semibold text-slate-200 mb-2">
        {title}
      </h3>
      
      {/* Description */}
      {description && (
        <p className="text-sm text-slate-300 max-w-sm mb-6">
          {description}
        </p>
      )}
      
      {/* Action */}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * Illustrations SVG pour les états vides
 */
interface IllustrationProps {
  type: 'conversations' | 'messages' | 'search';
}

function Illustration({ type }: IllustrationProps) {
  const illustrations = {
    conversations: (
      <svg 
        className="w-48 h-48 mb-4 opacity-20" 
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Bulle de conversation */}
        <rect 
          x="40" 
          y="50" 
          width="120" 
          height="80" 
          rx="12" 
          stroke="currentColor" 
          strokeWidth="3"
          fill="none"
        />
        <circle cx="70" cy="90" r="4" fill="currentColor" />
        <circle cx="100" cy="90" r="4" fill="currentColor" />
        <circle cx="130" cy="90" r="4" fill="currentColor" />
        {/* Triangle pointer */}
        <path 
          d="M 80 130 L 90 145 L 100 130" 
          stroke="currentColor" 
          strokeWidth="3"
          fill="none"
        />
      </svg>
    ),
    
    messages: (
      <svg 
        className="w-48 h-48 mb-4 opacity-20" 
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Enveloppe */}
        <rect 
          x="30" 
          y="60" 
          width="140" 
          height="100" 
          rx="8" 
          stroke="currentColor" 
          strokeWidth="3"
          fill="none"
        />
        <path 
          d="M 30 60 L 100 110 L 170 60" 
          stroke="currentColor" 
          strokeWidth="3"
          fill="none"
        />
      </svg>
    ),
    
    search: (
      <svg 
        className="w-48 h-48 mb-4 opacity-20" 
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Loupe */}
        <circle 
          cx="80" 
          cy="80" 
          r="40" 
          stroke="currentColor" 
          strokeWidth="3"
          fill="none"
        />
        <path 
          d="M 110 110 L 150 150" 
          stroke="currentColor" 
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* X à l'intérieur */}
        <path 
          d="M 65 65 L 95 95 M 95 65 L 65 95" 
          stroke="currentColor" 
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    ),
  };
  
  return illustrations[type];
}

/**
 * Variantes pré-configurées
 */
export function EmptyConversations({ onSearch }: { onSearch: () => void }) {
  return (
    <EmptyState
      illustration="conversations"
      title="Aucune conversation"
      description="Recherchez un utilisateur ci-dessus pour commencer une nouvelle discussion chiffrée."
      action={{
        label: "Commencer",
        onClick: onSearch,
      }}
    />
  );
}

export function EmptyMessages() {
  return (
    <EmptyState
      illustration="messages"
      title="Aucun message"
      description="Envoyez le premier message chiffré de cette conversation."
    />
  );
}

export function EmptySearch() {
  return (
    <EmptyState
      illustration="search"
      title="Aucun résultat"
      description="Essayez avec un autre nom d'utilisateur."
    />
  );
}

export function EmptySelection() {
  return (
    <EmptyState
      icon="💬"
      title="Sélectionnez une conversation"
      description="Choisissez une discussion dans la barre latérale pour commencer à échanger des messages chiffrés."
    />
  );
}
