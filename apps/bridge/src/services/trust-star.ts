import { getDatabase } from '../db/database.js';
import { join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

const db = getDatabase();

export type TrustStarContext = 'SETTINGS' | 'ONBOARDING' | 'RECOVERY';

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
  primaryColorState: 'GREEN' | 'AMBER' | 'RED';
  hasBlockingIssues: boolean;
  facets: TrustStarFacet[];
  metadata: Record<string, unknown>;
}

interface ComputeParams {
  userId: string;
  context: TrustStarContext;
  locale?: string;
  clientInfo?: {
    ip?: string;
    userAgent?: string | string[];
  };
}

export async function computeTrustStar(params: ComputeParams): Promise<TrustStarResponse> {
  const { userId, context } = params;
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const version = '1.0.0';

  const user = await db.getUserById(userId);
  if (!user) {
    const error: any = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const facets: TrustStarFacet[] = [];

  // 1. Key origin & strength
  facets.push(await buildKeyOriginFacet(user, now, context));

  // 2. Device verification
  facets.push(await buildDeviceFacet(user, params.clientInfo, now));

  // 3. Backup / recovery readiness
  facets.push(await buildBackupFacet(now));

  // 4. Social / delegated recovery (placeholder for now)
  facets.push(await buildSocialFacet(now));

  // 5. Recency of verification
  facets.push(await buildVerificationRecencyFacet(user, now));

  const { overallScore, primaryColorState, hasBlockingIssues } =
    computeScoreAndColor(facets, context);

  const metadata: Record<string, unknown> = {};
  try {
    metadata.schemaVersion = await db.getMetadata('schema_version');
  } catch {
    // Non-blocking
  }

  return {
    userId,
    version,
    generatedAt,
    context,
    overallScore,
    maxScore: 5,
    primaryColorState,
    hasBlockingIssues,
    facets,
    metadata,
  };
}

function facetScore(state: FacetState): number {
  switch (state) {
    case 'VERIFIED':
      return 1.0;
    case 'AT_RISK':
      return 0.6;
    case 'WEAK':
      return 0.4;
    case 'UNVERIFIED':
      return 0.2;
    case 'LOST':
    default:
      return 0.0;
  }
}

function computeScoreAndColor(
  facets: TrustStarFacet[],
  context: TrustStarContext,
): {
  overallScore: number;
  primaryColorState: 'GREEN' | 'AMBER' | 'RED';
  hasBlockingIssues: boolean;
} {
  const maxScore = 5;

  if (!facets.length) {
    return {
      overallScore: 0,
      primaryColorState: 'RED',
      hasBlockingIssues: true,
    };
  }

  let aggregate = 0;
  let totalWeight = 0;
  let hasCritical = false;
  let hasWarning = false;

  for (const facet of facets) {
    aggregate += facetScore(facet.state) * facet.weight;
    totalWeight += facet.weight;

    if (facet.severity === 'CRITICAL') hasCritical = true;
    if (facet.severity === 'WARNING') hasWarning = true;
  }

  const normalized = totalWeight > 0 ? aggregate / totalWeight : 0;
  let overallScore = Math.round(normalized * maxScore);
  if (overallScore < 0) overallScore = 0;
  if (overallScore > maxScore) overallScore = maxScore;

  let primaryColorState: 'GREEN' | 'AMBER' | 'RED' = 'GREEN';
  if (hasCritical || overallScore <= 2) {
    primaryColorState = 'RED';
  } else if (hasWarning || overallScore <= 4) {
    primaryColorState = 'AMBER';
  }

  let hasBlockingIssues = false;
  if (context === 'ONBOARDING') {
    hasBlockingIssues = overallScore < 3;
  } else if (context === 'RECOVERY') {
    hasBlockingIssues = overallScore <= 1;
  }

  return { overallScore, primaryColorState, hasBlockingIssues };
}

async function buildKeyOriginFacet(
  user: any,
  now: number,
  context: TrustStarContext,
): Promise<TrustStarFacet> {
  // Check if this user has explicitly marked their primary key as lost
  let keyMarkedLost = false;
  try {
    const raw = await db.getMetadata(`trust_star:key_lost:${user.id}`);
    if (raw) {
      keyMarkedLost = true;
    }
  } catch {
    // Non-blocking – if metadata is unavailable we fall back to normal logic
  }

  if (keyMarkedLost) {
    return {
      id: 1,
      key: 'KEY_ORIGIN_STRENGTH',
      name: 'Origine & force de la clé',
      state: 'LOST',
      severity: 'CRITICAL',
      weight: 0.3,
      description:
        "Votre clé de chiffrement primaire est marquée comme perdue. Les anciens messages chiffrés ne pourront pas être récupérés.",
      actionLabel: null,
      actionUrl: null,
      recoverable: false,
      lastUpdatedAt: new Date(now).toISOString(),
    };
  }

  let keyBits = 256;

  if (user.security_tier === 'standard' && user.master_key_hex) {
    // Heuristic similar to usersRoutes: infer key size from stored hash length
    const hexLength = String(user.master_key_hex).length;
    keyBits = hexLength <= 30 ? 128 : 256;
  } else if (user.security_tier === 'dice-key') {
    keyBits = 775; // DiceKey entropy
  }

  let state: FacetState = 'UNVERIFIED';
  let severity: Severity = 'INFO';
  let description: string;

  if (user.security_tier === 'dice-key') {
    state = 'VERIFIED';
    severity = 'INFO';
    description = "Compte sécurisé par DiceKey (≈775 bits d'entropie).";
  } else if (keyBits >= 256) {
    state = 'VERIFIED';
    severity = 'INFO';
    description = `Clé dérivée avec une force estimée à ${keyBits} bits.`;
  } else if (keyBits >= 128) {
    state = 'WEAK';
    severity = 'WARNING';
    description =
      'Clé dérivée avec une force estimée à 128 bits. Recommandé : passer à une phrase 24 mots ou à DiceKey.';
  } else {
    state = 'UNVERIFIED';
    severity = 'WARNING';
    description =
      "Impossible de déterminer la force de votre clé. Reconnexion via une méthode avancée recommandée.";
  }

  return {
    id: 1,
    key: 'KEY_ORIGIN_STRENGTH',
    name: 'Origine & force de la clé',
    state,
    severity,
    weight: 0.3,
    description,
    actionLabel:
      state === 'WEAK' || state === 'UNVERIFIED' ? 'Améliorer la sécurité de ma clé' : null,
    actionUrl: state === 'WEAK' || state === 'UNVERIFIED' ? '/signup' : null,
    // Primary key can always be améliorée/rotated tant que le compte existe
    recoverable: true,
    lastUpdatedAt: new Date(now).toISOString(),
  };
}

async function buildDeviceFacet(
  user: any,
  clientInfo: ComputeParams['clientInfo'],
  now: number,
): Promise<TrustStarFacet> {
  let state: FacetState = 'UNVERIFIED';
  let severity: Severity = 'INFO';
  let description: string;

  const userAgentHeader = clientInfo?.userAgent;
  const userAgent = Array.isArray(userAgentHeader)
    ? userAgentHeader[0]
    : userAgentHeader || undefined;

  try {
    const logs = await db.getAuditLogs({
      userId: user.id,
      tableName: 'auth',
      limit: 50,
    });

    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const hasRecentLog = Array.isArray(logs)
      ? logs.some((log: any) => {
          if (!log.timestamp) return false;
          const recentEnough = now - Number(log.timestamp) < THIRTY_DAYS;
          if (!recentEnough) return false;
          if (!userAgent) return true;
          return log.user_agent === userAgent;
        })
      : false;

    if (hasRecentLog) {
      state = 'VERIFIED';
      severity = 'INFO';
      description =
        "Cet appareil a été vérifié récemment via une session authentifiée reconnue.";
    } else {
      state = 'AT_RISK';
      severity = 'WARNING';
      description =
        "Nous ne trouvons pas de preuve récente pour cet appareil. Vérifiez que vous reconnaissez cette connexion.";
    }
  } catch {
    state = 'UNVERIFIED';
    severity = 'WARNING';
    description =
      "Impossible de vérifier l'état de cet appareil (données de journal indisponibles).";
  }

  return {
    id: 2,
    key: 'DEVICE_VERIFICATION',
    name: "Vérification de l'appareil",
    state,
    severity,
    weight: 0.2,
    description,
    actionLabel: state !== 'VERIFIED' ? 'Vérifier cet appareil' : null,
    actionUrl: state !== 'VERIFIED' ? '/settings' : null,
    recoverable: true,
    lastUpdatedAt: new Date(now).toISOString(),
  };
}

async function buildBackupFacet(now: number): Promise<TrustStarFacet> {
  const dataDir = process.env.BRIDGE_DATA_DIR || './data';
  const backupDir = join(dataDir, 'backups');

  let state: FacetState = 'UNVERIFIED';
  let severity: Severity = 'WARNING';
  let description =
    "Aucun backup chiffré détecté pour l'instant. Sans backup, la récupération sera limitée.";

  let newestBackupAgeDays: number | null = null;

  try {
    if (existsSync(backupDir)) {
      const files = readdirSync(backupDir).filter(
        (f) => f.endsWith('.db') || f.endsWith('.db.gz'),
      );

      if (files.length > 0) {
        let newest = 0;
        for (const f of files) {
          const stats = statSync(join(backupDir, f));
          const created = stats.birthtime.getTime();
          if (created > newest) {
            newest = created;
          }
        }

        if (newest > 0) {
          const ageMs = now - newest;
          newestBackupAgeDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        }
      }
    }
  } catch {
    // If we cannot read backup directory, keep state as UNVERIFIED/AT_RISK
  }

  if (newestBackupAgeDays !== null) {
    if (newestBackupAgeDays <= 30) {
      state = 'VERIFIED';
      severity = 'INFO';
      description =
        `Vous avez un backup chiffré récent (il y a ${newestBackupAgeDays} jour(s)).`;
    } else if (newestBackupAgeDays <= 90) {
      state = 'AT_RISK';
      severity = 'WARNING';
      description =
        `Votre dernier backup chiffré date de ${newestBackupAgeDays} jours. Pensez à le rafraîchir.`;
    } else {
      state = 'AT_RISK';
      severity = 'WARNING';
      description =
        `Votre dernier backup chiffré est très ancien (${newestBackupAgeDays} jours). La récupération pourrait être incomplète.`;
    }
  }

  return {
    id: 3,
    key: 'BACKUP_READINESS',
    name: 'Backup / préparation à la récupération',
    state,
    severity,
    weight: 0.25,
    description,
    actionLabel: 'Gérer mes backups',
    actionUrl: '/settings?tab=backup',
    recoverable: true,
    lastUpdatedAt: new Date(now).toISOString(),
  };
}

async function buildSocialFacet(now: number): Promise<TrustStarFacet> {
  // Placeholder implementation until social recovery is implemented in the backend
  const state: FacetState = 'UNVERIFIED';
  const severity: Severity = 'INFO';
  const description =
    "Aucun contact de récupération configuré. Vous ne pourrez pas utiliser de gardiens pour récupérer votre compte.";

  return {
    id: 4,
    key: 'SOCIAL_RECOVERY',
    name: 'Récupération sociale / déléguée',
    state,
    severity,
    weight: 0.15,
    description,
    actionLabel: 'Configurer des contacts de récupération',
    actionUrl: '/settings/recovery-contacts',
    recoverable: true,
    lastUpdatedAt: new Date(now).toISOString(),
  };
}

async function buildVerificationRecencyFacet(user: any, now: number): Promise<TrustStarFacet> {
  let lastVerification: number | null = null;

  try {
    const raw = await db.getMetadata(`trust_star:last_verification_at:${user.id}`);
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) {
        lastVerification = parsed;
      }
    }
  } catch {
    // ignore
  }

  // Fallback: use account creation time as initial verification
  if (!lastVerification && user.created_at) {
    const created = Number(user.created_at);
    if (!Number.isNaN(created)) {
      lastVerification = created;
    }
  }

  let state: FacetState = 'UNVERIFIED';
  let severity: Severity = 'WARNING';
  let description: string;

  if (!lastVerification) {
    description = "Vos clés n'ont pas encore été confirmées sur cet appareil.";
  } else {
    const ageDays = (now - lastVerification) / (24 * 60 * 60 * 1000);

    if (ageDays <= 7) {
      state = 'VERIFIED';
      severity = 'INFO';
      description = `Vos clés ont été confirmées il y a ${Math.floor(
        ageDays,
      )} jour(s).`;
    } else if (ageDays <= 30) {
      state = 'AT_RISK';
      severity = 'WARNING';
      description = `Vos clés n'ont pas été revérifiées depuis ${Math.floor(
        ageDays,
      )} jours.`;
    } else {
      state = 'AT_RISK';
      severity = 'WARNING';
      description =
        "Vos clés n'ont pas été revérifiées depuis plus de 30 jours. Recommandé : revérifier votre configuration.";
    }
  }

  return {
    id: 5,
    key: 'VERIFICATION_RECENCY',
    name: 'Récence de vérification',
    state,
    severity,
    weight: 0.1,
    description,
    actionLabel: 'Revérifier mes clés',
    actionUrl: '/settings/security-check',
    recoverable: true,
    lastUpdatedAt: new Date(now).toISOString(),
  };
}
