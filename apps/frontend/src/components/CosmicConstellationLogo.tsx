/**
 * Shared constellation logo used across canonical auth and public surfaces.
 *
 * Extracted from LoginNew.tsx during Phase 12 - Shared Auth Primitives.
 * Each screen previously owned a local copy; this is the single canonical version.
 *
 * The gradient id is namespaced to avoid SVG id collisions when multiple
 * instances render on the same page.
 */

import { useId } from 'react';

export default function CosmicConstellationLogo() {
  const uid = useId();
  const gradientId = `cosmicCoreGradient-${uid}`;

  return (
    <svg viewBox="0 0 96 96" className="cosmic-constellation" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#7b2fff" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="19" fill="none" stroke="rgba(0,240,255,0.28)" strokeWidth="1.5">
        <animate attributeName="r" values="16;21;16" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.95;0.4" dur="4s" repeatCount="indefinite" />
      </circle>
      <path
        d="M20 30L48 48L73 20M48 48L25 73L74 74M48 48L76 46"
        fill="none"
        stroke="rgba(200,220,255,0.4)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="48" cy="48" r="7" fill={`url(#${gradientId})`} />
      <circle cx="20" cy="30" r="3.5" fill="#d9e3ff" />
      <circle cx="73" cy="20" r="3" fill="#8ce8ff" />
      <circle cx="25" cy="73" r="3" fill="#b78fff" />
      <circle cx="74" cy="74" r="2.8" fill="#d9e3ff" />
      <circle cx="76" cy="46" r="2.5" fill="#8ce8ff" />
    </svg>
  );
}
