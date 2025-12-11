/**
 * Message Entity - Domain Layer
 * 
 * Représente un message dans une conversation
 * Support Time-Lock et Burn After Reading
 */

export interface MessageProps {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: number;
  unlockBlockHeight?: number;
  isLocked?: boolean;
  burnAfterReading?: boolean;
  burnDuration?: number;
  willBurnAt?: number;
  ackAt?: number;
  // New architecture fields
  isBurned?: boolean;
  burnedAt?: number;
  scheduledBurnAt?: number;
}

export class Message {
  private constructor(private readonly props: MessageProps) {
    this.validate();
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get senderId(): string {
    return this.props.senderId;
  }

  get body(): string {
    return this.props.body;
  }

  get createdAt(): number {
    return this.props.createdAt;
  }

  get unlockBlockHeight(): number | undefined {
    return this.props.unlockBlockHeight;
  }

  get isLocked(): boolean {
    return this.props.isLocked ?? false;
  }

  get burnAfterReading(): boolean {
    return this.props.burnAfterReading ?? false;
  }

  get burnDuration(): number | undefined {
    return this.props.burnDuration;
  }

  get willBurnAt(): number | undefined {
    return this.props.willBurnAt;
  }

  get ackAt(): number | undefined {
    return this.props.ackAt;
  }

  get isBurned(): boolean {
    return this.props.isBurned ?? false;
  }

  get burnedAt(): number | undefined {
    return this.props.burnedAt;
  }

  get scheduledBurnAt(): number | undefined {
    return this.props.scheduledBurnAt;
  }

  // Factory methods
  static create(props: {
    conversationId: string;
    senderId: string;
    body: string;
    unlockBlockHeight?: number;
    burnAfterReading?: boolean;
    scheduledBurnAt?: number;
  }): Message {
    const isLocked = !!props.unlockBlockHeight;

    return new Message({
      id: crypto.randomUUID(),
      conversationId: props.conversationId,
      senderId: props.senderId,
      body: props.body,
      createdAt: Date.now(),
      unlockBlockHeight: props.unlockBlockHeight,
      isLocked,
      burnAfterReading: props.burnAfterReading,
      scheduledBurnAt: props.scheduledBurnAt,
      isBurned: false,
    });
  }

  static fromRow(row: any): Message {
    return new Message({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at,
      unlockBlockHeight: row.unlock_block_height,
      isLocked: !!row.is_locked,
      burnAfterReading: !!row.burn_after_reading,
      burnDuration: row.burn_duration,
      willBurnAt: row.will_burn_at,
      ackAt: row.ack_at,
      isBurned: !!row.is_burned,
      burnedAt: row.burned_at,
      scheduledBurnAt: row.scheduled_burn_at,
    });
  }

  // Business methods
  canBeRead(currentBlockHeight: number): boolean {
    if (!this.isLocked) {return true;}
    if (!this.unlockBlockHeight) {return true;}
    return currentBlockHeight >= this.unlockBlockHeight;
  }

  unlock(currentBlockHeight: number): Message {
    if (!this.canBeRead(currentBlockHeight)) {
      throw new Error(`Message locked until block ${this.unlockBlockHeight}`);
    }

    return new Message({
      ...this.props,
      isLocked: false,
    });
  }

  acknowledge(burnDuration?: number): Message {
    if (this.ackAt) {
      throw new Error('Message already acknowledged');
    }

    const now = Date.now();
    const shouldBurn = this.burnAfterReading && burnDuration;

    return new Message({
      ...this.props,
      ackAt: now,
      burnDuration: shouldBurn ? burnDuration : undefined,
      willBurnAt: shouldBurn ? now + burnDuration! : undefined,
    });
  }

  shouldBeBurned(now: number = Date.now()): boolean {
    if (!this.willBurnAt) {return false;}
    return now >= this.willBurnAt;
  }

  // Validation
  private validate(): void {
    if (!this.props.id) {
      throw new Error('Message ID is required');
    }
    if (!this.props.conversationId) {
      throw new Error('Conversation ID is required');
    }
    if (!this.props.senderId) {
      throw new Error('Sender ID is required');
    }
    if (!this.props.body) {
      throw new Error('Message body is required');
    }
    if (this.props.isLocked && !this.props.unlockBlockHeight) {
      throw new Error('Locked messages must have unlock block height');
    }
    if (this.props.willBurnAt && !this.props.ackAt) {
      throw new Error('Burn time requires acknowledgement');
    }
  }

  // Serialization
  toJSON() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      body: this.body,
      createdAt: this.createdAt,
      unlockBlockHeight: this.unlockBlockHeight,
      isLocked: this.isLocked,
      burnAfterReading: this.burnAfterReading,
      burnDuration: this.burnDuration,
      willBurnAt: this.willBurnAt,
      ackAt: this.ackAt,
    };
  }

  toRow() {
    return {
      id: this.id,
      conversation_id: this.conversationId,
      sender_id: this.senderId,
      body: this.body,
      created_at: this.createdAt,
      unlock_block_height: this.unlockBlockHeight,
      is_locked: this.isLocked ? 1 : 0,
      burn_after_reading: this.burnAfterReading ? 1 : 0,
      burn_duration: this.burnDuration,
      will_burn_at: this.willBurnAt,
      ack_at: this.ackAt,
      is_burned: this.isBurned ? 1 : 0,
      burned_at: this.burnedAt,
      scheduled_burn_at: this.scheduledBurnAt,
    };
  }
}
