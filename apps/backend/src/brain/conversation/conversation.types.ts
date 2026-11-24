export type ConversationType = 'companion';
export type ConversationStatus = 'pending' | 'available' | 'unavailable';

export interface ConversationSnapshot {
  conversationId: string;
  conversationType: ConversationType;
  status: ConversationStatus;
  title?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface CreateConversationInput {
  conversationId?: string;
  conversationType?: ConversationType;
  title?: string;
  now?: number;
}

export interface ConversationRecord extends ConversationSnapshot {
  piSessionPath?: string;
}
