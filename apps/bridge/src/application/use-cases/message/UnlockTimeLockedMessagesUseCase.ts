/**
 * Unlock Time-Locked Messages Use Case - Application Layer
 * 
 * Service background qui déverrouille les messages time-locked
 */

import type { IMessageRepository } from '../../../domain/repositories/IMessageRepository';
import type { Message } from '../../../domain/entities/Message';

export interface UnlockTimeLockedMessagesOutput {
  unlockedCount: number;
  unlockedMessages: Message[];
}

export class UnlockTimeLockedMessagesUseCase {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly blockchainService: BlockchainService
  ) {}

  async execute(): Promise<UnlockTimeLockedMessagesOutput> {
    // 1. Récupérer la hauteur blockchain actuelle
    const currentHeight = await this.blockchainService.getCurrentHeight();

    // 2. Récupérer tous les messages verrouillés
    const lockedMessages = await this.messageRepository.findLockedMessages(currentHeight);

    // 3. Déverrouiller ceux qui sont éligibles
    const unlockedMessages: Message[] = [];

    for (const message of lockedMessages) {
      if (message.canBeRead(currentHeight)) {
        const unlockedMessage = message.unlock(currentHeight);
        await this.messageRepository.update(unlockedMessage);
        unlockedMessages.push(unlockedMessage);
      }
    }

    return {
      unlockedCount: unlockedMessages.length,
      unlockedMessages,
    };
  }
}

export interface BlockchainService {
  getCurrentHeight(): Promise<number>;
}
