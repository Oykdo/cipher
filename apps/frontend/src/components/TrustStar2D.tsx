import type { TrustStarFacet, TrustStarResponse, PrimaryColorState } from '../services/trustStar';
import { useMemo } from 'react';

interface TrustStar2DProps {
  data: TrustStarResponse;
  onFacetSelect?: (facet: TrustStarFacet) => void;
}

function getPrimaryColor(color: PrimaryColorState): string {
  switch (color) {
    case 'GREEN':
      return '#22c55e'; // rgb(34, 197, 94)
    case 'AMBER':
      return '#fbbf24'; // rgb(251, 191, 36)
    case 'RED':
    default:
      return '#ef4444'; // rgb(239, 68, 68)
  }
}

function getFacetFill(base: string, state: TrustStarFacet['state']): string {
  if (state === 'LOST') return '#4b5563'; // Gray
  if (state === 'UNVERIFIED') return '#020617'; // Very dark slate
  if (state === 'WEAK') return base + 'CC'; // Slightly transparent
  if (state === 'AT_RISK') return base;
  return base; // VERIFIED
}

function getFacetStroke(state: TrustStarFacet['state']): string {
  if (state === 'AT_RISK' || state === 'WEAK') return '#facc15'; // Amber
  if (state === 'LOST') return '#020617';
  return '#0f172a'; // Slate
}

export function TrustStar2D({ data, onFacetSelect }: TrustStar2DProps) {
  const baseColor = getPrimaryColor(data.primaryColorState);

  const facetsWithAngles = useMemo(
    () => {
      const count = data.facets.length || 1;
      const angleStep = (Math.PI * 2) / count;
      return data.facets.map((facet, index) => ({
        facet,
        angle: index * angleStep - Math.PI / 2, // Start at top
      }));
    },
    [data.facets],
  );

  const handleFacetClick = (facet: TrustStarFacet) => {
    if (onFacetSelect) onFacetSelect(facet);
  };

  const handleFacetKeyDown = (
    e: React.KeyboardEvent<SVGPathElement>,
    facet: TrustStarFacet,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleFacetClick(facet);
    }
  };

  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label="Carte Trust-Star 2D"
      className="w-full h-full max-h-64"
    >
      {/* Background circle */}
      <defs>
        <radialGradient id="trustStarBg" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#020617" />
          <stop offset="100%" stopColor="#020617" stopOpacity={0} />
        </radialGradient>
      </defs>

      <circle
        cx={60}
        cy={60}
        r={52}
        fill="url(#trustStarBg)"
        stroke="#1e293b"
        strokeWidth={2}
      />

      {/* Facet wedges */}
      {facetsWithAngles.map(({ facet, angle }, idx) => {
        const outerRadius = 46;
        const innerRadius = 18;
        const spread = Math.PI / 5; // width of each wedge

        const angleLeft = angle - spread / 2;
        const angleRight = angle + spread / 2;

        const cx = 60;
        const cy = 60;

        const xInnerLeft = cx + innerRadius * Math.cos(angleLeft);
        const yInnerLeft = cy + innerRadius * Math.sin(angleLeft);
        const xOuter = cx + outerRadius * Math.cos(angle);
        const yOuter = cy + outerRadius * Math.sin(angle);
        const xInnerRight = cx + innerRadius * Math.cos(angleRight);
        const yInnerRight = cy + innerRadius * Math.sin(angleRight);

        const fill = getFacetFill(baseColor, facet.state);
        const stroke = getFacetStroke(facet.state);
        const hasCrack = facet.state === 'AT_RISK' || facet.state === 'WEAK';

        const pathD = [
          `M ${xInnerLeft} ${yInnerLeft}`,
          `L ${xOuter} ${yOuter}`,
          `L ${xInnerRight} ${yInnerRight}`,
          'Z',
        ].join(' ');

        return (
          <g key={facet.id ?? idx}>
            <path
              d={pathD}
              fill={fill}
              stroke={stroke}
              strokeWidth={hasCrack ? 2.2 : 1.4}
              strokeDasharray={hasCrack ? '4 3' : '0'}
              className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              tabIndex={0}
              role="button"
              aria-label={`${facet.name}: ${facet.description}`}
              onClick={() => handleFacetClick(facet)}
              onKeyDown={(e) => handleFacetKeyDown(e, facet)}
            />
          </g>
        );
      })}

      {/* Central core */}
      <circle cx={60} cy={60} r={12} fill={baseColor} opacity={0.85} />
      <circle cx={60} cy={60} r={16} stroke={baseColor} strokeWidth={1.5} fill="none" />

      {/* Overall score text */}
      <text
        x={60}
        y={60}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-white text-xl font-bold"
        style={{ fontSize: '18px', fontWeight: 700 }}
      >
        {data.overallScore}/{data.maxScore}
      </text>
    </svg>
  );
}

export default TrustStar2D;
