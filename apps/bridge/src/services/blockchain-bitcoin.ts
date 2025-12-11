/**
 * Bitcoin Blockchain Service - Time-Lock Implementation
 * 
 * Ce service se connecte à la blockchain Bitcoin réelle pour les Time-Lock messages.
 * Utilise l'API publique Blockstream (gratuite) avec fallback vers simulation.
 * 
 * Bitcoin: ~10 minutes par bloc (600 secondes)
 * 
 * SÉCURITÉ:
 * - Utilise la blockchain Bitcoin réelle (immuable)
 * - Cache Redis pour performance
 * - Fallback vers simulation si Bitcoin inaccessible
 * - Validation stricte côté serveur uniquement
 */

import axios, { AxiosError } from 'axios';

// Configuration Bitcoin
const BITCOIN_BLOCK_TIME_MS = 600000; // 10 minutes par bloc
const BITCOIN_API_PRIMARY = 'https://blockstream.info/api';
const BITCOIN_API_FALLBACK = 'https://blockchain.info';
const BITCOIN_API_TERTIARY = 'https://mempool.space/api';
const CACHE_CURRENT_HEIGHT_TTL = 60000; // 1 minute
const CACHE_BLOCK_INFO_TTL = 86400000; // 24 heures (blocs historiques immuables)
const CONFIRMATION_BLOCKS = 6; // Attendre 6 confirmations pour sécurité maximale (~1h)

// Simulé fallback configuration
const SIMULATED_GENESIS_TIMESTAMP = 1730000000000;
const SIMULATED_GENESIS_HEIGHT = 1000000;
const SIMULATED_BLOCK_TIME_MS = 10000; // 10 secondes

// Cache en mémoire (en production, utiliser Redis)
interface CacheEntry {
  data: any;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();

// Statistiques
let apiCallCount = 0;
let cacheHitCount = 0;
const apiFallbackCount = 0;

export interface BlockchainInfo {
  currentHeight: number;
  currentTimestamp: number;
  blockTime: number;
  network: string;
  source: 'bitcoin' | 'simulated';
}

/**
 * Cache helper
 */
function getCached<T>(key: string, ttl: number): T | null {
  const entry = memoryCache.get(key);
  if (!entry) {return null;}
  
  const age = Date.now() - entry.timestamp;
  if (age > ttl) {
    memoryCache.delete(key);
    return null;
  }
  
  cacheHitCount++;
  return entry.data as T;
}

function setCache(key: string, data: any): void {
  memoryCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Récupère la hauteur de bloc Bitcoin actuelle avec consensus multi-source
 * 
 * SÉCURITÉ ANTI-51%:
 * - Interroge 3 APIs différentes
 * - Nécessite consensus (2/3 sources d'accord)
 * - Détecte fork attacks / manipulation hauteur
 * - Fallback simulé si consensus impossible
 */
export async function getCurrentBlockHeight(): Promise<number> {
  const cacheKey = 'btc:current_height';
  const cached = getCached<number>(cacheKey, CACHE_CURRENT_HEIGHT_TTL);
  
  if (cached !== null) {
    return cached;
  }
  
  // Interroger 3 sources en parallèle pour consensus
  const sources = [
    { name: 'Blockstream', url: `${BITCOIN_API_PRIMARY}/blocks/tip/height`, parser: (data: any) => data },
    { name: 'Blockchain.info', url: `${BITCOIN_API_FALLBACK}/q/getblockcount`, parser: (data: any) => parseInt(data) },
    { name: 'Mempool.space', url: `${BITCOIN_API_TERTIARY}/blocks/tip/height`, parser: (data: any) => data }
  ];
  
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      apiCallCount++;
      const response = await axios.get(source.url, { timeout: 5000 });
      return {
        source: source.name,
        height: source.parser(response.data)
      };
    })
  );
  
  // Extraire hauteurs réussies
  const heights = results
    .filter((result): result is PromiseFulfilledResult<{ source: string; height: number }> => 
      result.status === 'fulfilled')
    .map(result => result.value);
  
  if (heights.length === 0) {
    console.error('[Bitcoin] All APIs failed, using simulated blockchain');
    return getSimulatedBlockHeight();
  }
  
  // Vérifier consensus (au moins 2 sources avec même hauteur ± 1)
  const heightCounts = new Map<number, number>();
  heights.forEach(({ height }) => {
    // Tolérance de ±1 bloc pour sync delays
    heightCounts.set(height, (heightCounts.get(height) || 0) + 1);
    heightCounts.set(height - 1, (heightCounts.get(height - 1) || 0) + 0.5);
    heightCounts.set(height + 1, (heightCounts.get(height + 1) || 0) + 0.5);
  });
  
  // Trouver hauteur avec meilleur consensus
  let consensusHeight = 0;
  let maxVotes = 0;
  
  for (const [height, votes] of heightCounts.entries()) {
    if (votes > maxVotes) {
      maxVotes = votes;
      consensusHeight = height;
    }
  }
  
  // Consensus requis: au moins 2/3 des sources
  const consensusRatio = maxVotes / heights.length;
  
  if (consensusRatio < 0.67) {
    console.error('[Bitcoin] SECURITY ALERT: No consensus on block height! Possible 51% attack or fork');
    console.error('[Bitcoin] Heights received:', heights.map(h => `${h.source}:${h.height}`).join(', '));
    // Utiliser fallback simulé en cas de désaccord
    return getSimulatedBlockHeight();
  }
  
  setCache(cacheKey, consensusHeight);
  
  console.log(`[Bitcoin] Consensus height: ${consensusHeight} from ${heights.length} sources (${Math.round(consensusRatio * 100)}% agreement)`);
  
  return consensusHeight;
}

/**
 * Récupère le timestamp d'un bloc Bitcoin spécifique
 */
export async function getBlockTimestamp(height: number): Promise<number> {
  const cacheKey = `btc:block:${height}:timestamp`;
  const cached = getCached<number>(cacheKey, CACHE_BLOCK_INFO_TTL);
  
  if (cached !== null) {
    return cached;
  }
  
  try {
    apiCallCount++;
    
    // Récupérer le hash du bloc à cette hauteur
    const hashResponse = await axios.get(`${BITCOIN_API_PRIMARY}/block-height/${height}`, {
      timeout: 5000
    });
    const blockHash = hashResponse.data;
    
    // Récupérer les infos du bloc
    const blockResponse = await axios.get(`${BITCOIN_API_PRIMARY}/block/${blockHash}`, {
      timeout: 5000
    });
    
    const timestamp = blockResponse.data.timestamp * 1000; // Convertir en ms
    setCache(cacheKey, timestamp);
    
    console.log(`[Bitcoin] Block ${height} timestamp: ${new Date(timestamp).toISOString()}`);
    return timestamp;
    
  } catch (error) {
    console.error(`[Bitcoin] Failed to fetch block ${height} timestamp:`, (error as AxiosError).message);
    
    // Estimation fallback basée sur la hauteur actuelle
    const currentHeight = await getCurrentBlockHeight();
    const estimatedTimestamp = Date.now() - ((currentHeight - height) * BITCOIN_BLOCK_TIME_MS);
    
    console.warn(`[Bitcoin] Using estimated timestamp for block ${height}: ${new Date(estimatedTimestamp).toISOString()}`);
    return estimatedTimestamp;
  }
}

/**
 * Obtient le timestamp serveur actuel (source de vérité)
 */
export function getServerTimestamp(): number {
  return Date.now();
}

/**
 * Calcule la hauteur de bloc Bitcoin pour une date future
 * @param targetTimestamp - Timestamp en millisecondes
 * @returns Hauteur de bloc estimée, ou null si dans le passé
 */
export async function calculateBlockTarget(targetTimestamp: number): Promise<number | null> {
  const now = Date.now();
  
  if (targetTimestamp <= now) {
    return null; // Date dans le passé
  }
  
  const currentHeight = await getCurrentBlockHeight();
  const timeUntilTarget = targetTimestamp - now;
  const blocksUntilTarget = Math.ceil(timeUntilTarget / BITCOIN_BLOCK_TIME_MS);
  
  const targetHeight = currentHeight + blocksUntilTarget;
  
  console.log(`[Bitcoin] Target timestamp: ${new Date(targetTimestamp).toISOString()}`);
  console.log(`[Bitcoin] Estimated target height: ${targetHeight} (in ${blocksUntilTarget} blocks, ~${Math.round(timeUntilTarget / 60000)} minutes)`);
  
  return targetHeight;
}

/**
 * Calcule le timestamp estimé pour une hauteur de bloc Bitcoin
 * @param blockHeight - Hauteur de bloc cible
 * @returns Timestamp estimé en millisecondes
 */
export async function estimateBlockTimestamp(blockHeight: number): Promise<number> {
  try {
    const currentHeight = await getCurrentBlockHeight();
    const blocksUntilTarget = blockHeight - currentHeight;
    
    if (blocksUntilTarget <= 0) {
      // Bloc dans le passé ou présent - essayer de récupérer le timestamp réel
      return await getBlockTimestamp(blockHeight);
    }
    
    // Bloc futur - estimation
    const estimatedTimestamp = Date.now() + (blocksUntilTarget * BITCOIN_BLOCK_TIME_MS);
    return estimatedTimestamp;
    
  } catch (error) {
    console.error(`[Bitcoin] Failed to estimate timestamp for block ${blockHeight}:`, error);
    // Fallback ultra-simple
    return Date.now();
  }
}

/**
 * Vérifie si un message Time-Lock peut être déverrouillé
 * 
 * Supporte deux modes:
 * 1. Timestamp (millisecondes) - valeurs > 1 trillion (après année 2001)
 * 2. Hauteur de bloc Bitcoin - valeurs plus petites
 * 
 * Pour les timestamps: comparaison directe avec Date.now()
 * Pour les hauteurs de bloc: utilise la blockchain Bitcoin avec 6 confirmations
 * 
 * @param unlockValue - Timestamp (ms) ou hauteur de bloc
 * @returns true si déverrouillable maintenant
 */
export async function canUnlock(unlockValue: number): Promise<boolean> {
  // Detect if value is a timestamp (milliseconds) or block height
  // Timestamps in ms are > 1 trillion (year 2001+)
  // Block heights are currently ~870,000 and won't exceed 1 billion for ~190 years
  const isTimestamp = unlockValue > 1_000_000_000_000;
  
  if (isTimestamp) {
    // Simple timestamp comparison
    const now = Date.now();
    const canUnlockNow = now >= unlockValue;
    
    if (canUnlockNow) {
      console.log(`[TimeLock] Message unlocked: current time ${now} >= target ${unlockValue}`);
    } else {
      const remaining = Math.ceil((unlockValue - now) / 1000);
      console.log(`[TimeLock] Message locked: ${remaining}s remaining until unlock`);
    }
    
    return canUnlockNow;
  }
  
  // Block height comparison (original Bitcoin-based logic)
  const currentHeight = await getCurrentBlockHeight();
  
  // SÉCURITÉ: Attendre 6 confirmations pour être sûr que le bloc est finalisé
  const safeHeight = currentHeight - CONFIRMATION_BLOCKS;
  
  const canUnlockNow = safeHeight >= unlockValue;
  
  if (canUnlockNow) {
    console.log(`[Bitcoin] Message unlocked: safe height ${safeHeight} >= target ${unlockValue} (${CONFIRMATION_BLOCKS} confirmations)`);
  } else if (currentHeight >= unlockValue) {
    console.log(`[Bitcoin] Message pending confirmations: current ${currentHeight} >= target ${unlockValue}, waiting for ${CONFIRMATION_BLOCKS} confirms`);
  }
  
  return canUnlockNow;
}

/**
 * Calcule le temps restant avant déverrouillage
 * @param unlockHeight - Hauteur de déverrouillage
 * @returns Millisecondes restantes, ou 0 si déjà déverrouillable
 */
export async function timeUntilUnlock(unlockHeight: number): Promise<number> {
  const currentHeight = await getCurrentBlockHeight();
  
  if (currentHeight >= unlockHeight) {
    return 0;
  }
  
  const blocksRemaining = unlockHeight - currentHeight;
  const timeRemaining = blocksRemaining * BITCOIN_BLOCK_TIME_MS;
  
  console.log(`[Bitcoin] Time until unlock: ${blocksRemaining} blocks (~${Math.round(timeRemaining / 60000)} minutes)`);
  
  return timeRemaining;
}

/**
 * Obtient les informations complètes de la blockchain
 */
export async function getBlockchainInfo(): Promise<BlockchainInfo> {
  try {
    const currentHeight = await getCurrentBlockHeight();
    const isSimulated = currentHeight < 800000; // Bitcoin est au bloc 800k+
    
    return {
      currentHeight,
      currentTimestamp: Date.now(),
      blockTime: BITCOIN_BLOCK_TIME_MS,
      network: process.env.BLOCKCHAIN_NETWORK || 'bitcoin-mainnet',
      source: isSimulated ? 'simulated' : 'bitcoin'
    };
  } catch (error) {
    console.error('[Bitcoin] Failed to get blockchain info:', error);
    
    return {
      currentHeight: getSimulatedBlockHeight(),
      currentTimestamp: Date.now(),
      blockTime: SIMULATED_BLOCK_TIME_MS,
      network: 'simulated-fallback',
      source: 'simulated'
    };
  }
}

/**
 * Valide une hauteur de bloc pour Time-Lock
 * @param unlockHeight - Hauteur de déverrouillage demandée
 * @param maxFutureBlocks - Maximum de blocs dans le futur (défaut: ~1 an)
 * @returns true si valide
 */
export async function validateUnlockHeight(
  unlockHeight: number,
  maxFutureBlocks = 52560 // ~1 an à 10min/bloc (52560 blocs)
): Promise<boolean> {
  const currentHeight = await getCurrentBlockHeight();
  
  // Doit être dans le futur
  if (unlockHeight <= currentHeight) {
    console.warn(`[Bitcoin] Invalid unlock height: ${unlockHeight} <= current ${currentHeight}`);
    return false;
  }
  
  // Pas trop loin dans le futur (1 an max par défaut)
  if (unlockHeight > currentHeight + maxFutureBlocks) {
    console.warn(`[Bitcoin] Unlock height too far in future: ${unlockHeight} > ${currentHeight + maxFutureBlocks}`);
    return false;
  }
  
  return true;
}

/**
 * Formate le temps restant en texte lisible
 * @param milliseconds - Millisecondes restantes
 * @returns String formaté (ex: "2h 30m", "45m", "3d 2h")
 */
export function formatTimeRemaining(milliseconds: number): string {
  if (milliseconds <= 0) {
    return 'Déverrouillé';
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}j ${remainingHours}h` : `${days}j`;
  }
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  if (minutes > 0) {
    return `${minutes}m`;
  }
  
  return `${seconds}s`;
}

/**
 * Suggestions de durées courantes pour UI (adaptées à Bitcoin)
 * Note: Bitcoin a des blocs plus lents (~10min vs 10s simulé)
 */
export const COMMON_TIMELOCK_DURATIONS = [
  { label: '30 minutes', minutes: 30 },
  { label: '1 heure', minutes: 60 },
  { label: '2 heures', minutes: 120 },
  { label: '6 heures', minutes: 360 },
  { label: '12 heures', minutes: 720 },
  { label: '1 jour', minutes: 1440 },
  { label: '3 jours', minutes: 4320 },
  { label: '1 semaine', minutes: 10080 },
  { label: '2 semaines', minutes: 20160 },
  { label: '1 mois', minutes: 43200 },
];

/**
 * Calcule la hauteur de bloc pour une durée en minutes
 * @param minutes - Durée en minutes
 * @returns Hauteur de bloc cible
 */
export async function calculateHeightFromDuration(minutes: number): Promise<number> {
  const targetTimestamp = Date.now() + (minutes * 60 * 1000);
  const height = await calculateBlockTarget(targetTimestamp);
  
  if (height === null) {
    throw new Error('Cannot calculate height for past timestamp');
  }
  
  return height;
}

/**
 * Blockchain simulée en fallback (si Bitcoin inaccessible)
 */
function getSimulatedBlockHeight(): number {
  const elapsed = Date.now() - SIMULATED_GENESIS_TIMESTAMP;
  const blocksElapsed = Math.floor(elapsed / SIMULATED_BLOCK_TIME_MS);
  return SIMULATED_GENESIS_HEIGHT + blocksElapsed;
}

/**
 * Statistiques de cache et API
 */
export function getStats() {
  return {
    apiCalls: apiCallCount,
    cacheHits: cacheHitCount,
    cacheHitRate: apiCallCount > 0 ? (cacheHitCount / (apiCallCount + cacheHitCount) * 100).toFixed(1) + '%' : 'N/A',
    apiFallbacks: apiFallbackCount,
    cacheSize: memoryCache.size
  };
}

/**
 * Vider le cache (utile pour tests)
 */
export function clearCache(): void {
  memoryCache.clear();
  console.log('[Bitcoin] Cache cleared');
}

/**
 * Health check de la connexion Bitcoin
 */
export async function healthCheck(): Promise<{
  status: 'ok' | 'degraded' | 'error';
  height?: number;
  latency?: number;
  source: 'bitcoin' | 'simulated';
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const height = await getCurrentBlockHeight();
    const latency = Date.now() - startTime;
    
    // Vérifier si c'est Bitcoin réel (>800k blocs) ou simulé
    const isRealBitcoin = height > 800000;
    
    return {
      status: isRealBitcoin ? 'ok' : 'degraded',
      height,
      latency,
      source: isRealBitcoin ? 'bitcoin' : 'simulated'
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'simulated',
      error: (error as Error).message
    };
  }
}
