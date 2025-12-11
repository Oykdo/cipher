/**
 * Burn Messages Use Case - Application Layer
 * 
 * Service background qui brûle les messages après Burn After Reading
 */

import type { IMessageRepository } from '../../../domain/repositories/IMessageRepository';
import type { Message } from '../../../domain/entities/Message';

export interface BurnMessagesOutput {
  burnedCount: number;
  burnedMessageIds: string[];
}

export class BurnMessagesUseCase {
  constructor(private readonly messageRepository: IMessageRepository) {}

  async execute(): Promise<BurnMessagesOutput> {
    const now = Date.now();

    // 1. Récupérer tous les messages à brûler
    const messagesToBurn = await this.messageRepository.findMessagesToBurn(now);

    // 2. Filtrer ceux qui doivent vraiment être brûlés
    const eligibleMessages: Message[] = [];

    for (const message of messagesToBurn) {
      if (message.shouldBeBurned(now)) {
        eligibleMessages.push(message);
      }
    }

    // 3. Supprimer les messages
    const messageIds = eligibleMessages.map((m) => m.id);
    if (messageIds.length > 0) {
      await this.messageRepository.deleteBurnedMessages(messageIds);
    }

    return {
      burnedCount: messageIds.length,
      burnedMessageIds: messageIds,
    };
  }
}
