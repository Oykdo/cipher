/**
 * Shared auth primitives used across canonical auth surfaces (LoginNew, SignupFluid).
 *
 * Extracted from LoginNew.tsx during Phase 12 - Shared Auth Primitives.
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function CosmicInputIcon({ children }: { children: ReactNode }) {
  return <span className="cosmic-input-icon">{children}</span>;
}

export function CosmicField({
  label,
  hint,
  icon,
  children,
}: {
  label: string;
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="cosmic-kicker block">{label}</label>
      <div className="cosmic-input-wrap">
        {icon ? <CosmicInputIcon>{icon}</CosmicInputIcon> : null}
        {children}
      </div>
      {hint ? <p className="mt-2 text-xs text-soft-grey">{hint}</p> : null}
    </div>
  );
}

export function CosmicActionButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <motion.button
      type={type}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.985 }}
      onClick={onClick}
      disabled={disabled}
      className="cosmic-cta flex-1"
    >
      <span>{children}</span>
      <div className="cosmic-cta-glow" aria-hidden="true" />
    </motion.button>
  );
}

export function CosmicGhostButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.985 }}
      onClick={onClick}
      disabled={disabled}
      className="cosmic-btn-ghost flex-1"
    >
      {children}
    </motion.button>
  );
}
