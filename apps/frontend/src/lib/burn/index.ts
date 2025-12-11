/**
 * Burn After Reading Module
 * 
 * Exports all burn-related functionality
 */

export {
  signBurnEvent,
  verifyBurnSignature,
  parseBurnSignature,
  scheduleBurnTimeout,
  cancelBurnTimeout,
  setTimeoutBurnCallback,
  hasPendingBurnTimeout,
  getBurnTimeoutRemaining,
  secureLocalDelete,
  clearAllBurnTimeouts,
  type BurnEvent,
  type BurnTimeoutEntry,
} from './burnService';
