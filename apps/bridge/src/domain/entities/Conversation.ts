/**
 * Conversation Entity - Domain Layer
 * 
 * Représente une conversation entre deux participants
 */

export interface ConversationProps {
  id: string;
  participants: [string, string]; // Toujours 2 participants (sorted)
  createdAt: number;
  lastMessageAt?: number;
}

export class Conversation {
  private constructor(private readonly props: ConversationProps) {
    this.validate();
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get participants(): [string, string] {
    return this.props.participants;
  }

  get createdAt(): number {
    return this.props.createdAt;
  }

  get lastMessageAt(): number | undefined {
    return this.props.lastMessageAt;
  }

  // Factory methods
  static create(participant1: string, participant2: string): Conversation {
    const sorted = [participant1, participant2].sort() as [string, string];
    const id = sorted.join(':');

    return new Conversation({
      id,
      participants: sorted,
      createdAt: Date.now(),
    });
  }

  static fromRow(row: any): Conversation {
    const participants = row.participants.split(',') as [string, string];
    return new Conversation({
      id: row.id,
      participants,
      createdAt: row.created_at,
      lastMessageAt: row.last_message_at,
    });
  }

  // Business methods
  hasParticipant(userId: string): boolean {
    return this.participants.includes(userId);
  }

  getOtherParticipant(userId: string): string {
    if (!this.hasParticipant(userId)) {
      throw new Error('User is not a participant in this conversation');
    }
    return this.participants.find((p) => p !== userId)!;
  }

  updateLastMessageAt(timestamp: number): Conversation {
    return new Conversation({
      ...this.props,
      lastMessageAt: timestamp,
    });
  }

  // Validation
  private validate(): void {
    if (!this.props.id) {
      throw new Error('Conversation ID is required');
    }
    if (!this.props.participants || this.props.participants.length !== 2) {
      throw new Error('Conversation must have exactly 2 participants');
    }
    if (this.props.participants[0] === this.props.participants[1]) {
      throw new Error('Conversation participants must be different');
    }
    // Vérifier que les participants sont triés
    if (this.props.participants[0] > this.props.participants[1]) {
      throw new Error('Conversation participants must be sorted');
    }
  }

  // Serialization
  toJSON() {
    return {
      id: this.id,
      participants: this.participants,
      createdAt: this.createdAt,
      lastMessageAt: this.lastMessageAt,
    };
  }

  toRow() {
    return {
      id: this.id,
      participants: this.participants.join(','),
      created_at: this.createdAt,
      last_message_at: this.lastMessageAt,
    };
  }
}
