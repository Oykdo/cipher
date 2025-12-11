import { API_BASE_URL } from '../config';
import { fetchWithRefresh } from './api-interceptor';

export type TrustStarContext = 'SETTINGS' | 'ONBOARDING' | 'RECOVERY';
export type PrimaryColorState = 'GREEN' | 'AMBER' | 'RED';
export type FacetState = 'UNVERIFIED' | 'VERIFIED' | 'AT_RISK' | 'WEAK' | 'LOST';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface TrustStarFacet {
  id: number;
  key:
    | 'KEY_ORIGIN_STRENGTH'
    | 'DEVICE_VERIFICATION'
    | 'BACKUP_READINESS'
    | 'SOCIAL_RECOVERY'
    | 'VERIFICATION_RECENCY';
  name: string;
  state: FacetState;
  severity: Severity;
  weight: number;
  description: string;
  actionLabel: string | null;
  actionUrl: string | null;
  recoverable: boolean;
  lastUpdatedAt: string;
}

export interface TrustStarResponse {
  userId: string;
  version: string;
  generatedAt: string;
  context: TrustStarContext;
  overallScore: number;
  maxScore: number;
  primaryColorState: PrimaryColorState;
  hasBlockingIssues: boolean;
  facets: TrustStarFacet[];
  metadata: Record<string, unknown>;
}

interface TrustStarErrorPayload {
  error?: {
    code?: string;
    message?: string;
    httpStatus?: number;
    details?: Record<string, unknown>;
    correlationId?: string;
  };
}

export async function fetchTrustStar(
  context: TrustStarContext = 'SETTINGS',
): Promise<TrustStarResponse> {
  const params = new URLSearchParams({ context });

  const response = await fetchWithRefresh(
    `${API_BASE_URL}/api/v1/user/trust-star?${params.toString()}`,
  );

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({}))) as TrustStarErrorPayload;

    const message =
      payload.error?.message ||
      payload.error?.code ||
      `Trust-Star request failed: ${response.status}`;

    throw new Error(message);
  }

  return (await response.json()) as TrustStarResponse;
}
