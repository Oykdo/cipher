/**
 * Blockchain Service - Infrastructure Layer
 * Provides blockchain height information for time-lock features
 */

import type { BlockchainService as IBlockchainService } from '../../application/use-cases/message/UnlockTimeLockedMessagesUseCase';

export class BlockchainService implements IBlockchainService {
  private currentHeight: number = 0;
  private lastUpdate: number = 0;
  private readonly UPDATE_INTERVAL = 60000; // 1 minute

  /**
   * Get current blockchain height
   * In production, this would query a real blockchain node
   */
  async getCurrentHeight(): Promise<number> {
    const now = Date.now();
    
    // Update height if cache is stale
    if (now - this.lastUpdate > this.UPDATE_INTERVAL) {
      await this.updateHeight();
    }
    
    return this.currentHeight;
  }

  /**
   * Update blockchain height from external source
   * TODO: Implement actual blockchain API call
   */
  private async updateHeight(): Promise<void> {
    // For now, simulate blockchain progression
    // In production, query actual blockchain node (Bitcoin, Ethereum, etc.)
    this.currentHeight = Math.floor(Date.now() / 600000); // ~10 min blocks
    this.lastUpdate = Date.now();
    
    console.log(`[BlockchainService] Updated height: ${this.currentHeight}`);
  }

  /**
   * Estimate when a specific block height will be reached
   * @param targetHeight Target block height
   * @returns Estimated timestamp in milliseconds
   */
  async estimateBlockTime(targetHeight: number): Promise<number> {
    const current = await this.getCurrentHeight();
    const blocksRemaining = targetHeight - current;
    
    if (blocksRemaining <= 0) {
      return Date.now();
    }
    
    // Assume 10 minute blocks (Bitcoin-like)
    const BLOCK_TIME_MS = 600000;
    return Date.now() + (blocksRemaining * BLOCK_TIME_MS);
  }
}
