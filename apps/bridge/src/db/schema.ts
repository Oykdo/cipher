import { Generated } from 'kysely';

export interface UsersTable {
    id: string;
    username: string;
    security_tier: 'standard' | 'dice-key';
    mnemonic: string;
    master_key_hex: string | null;
    discoverable: number; // 0 or 1
    created_at: Generated<number>;
}

export interface ConversationsTable {
    id: string;
    created_at: Generated<number>;
    last_message_at: number | null;
}

export interface ConversationMembersTable {
    conversation_id: string;
    user_id: string;
    joined_at: Generated<number>;
}

export interface MessagesTable {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: Generated<number>;
    is_burned: number; // 0 or 1
    burned_at: number | null;
    scheduled_burn_at: number | null;
    unlock_block_height: number | null;
}

export interface AttachmentsTable {
    id: string;
    conversation_id: string;
    uploader_id: string;
    filename: string;
    mime: string;
    size: number;
    path: string;
    created_at: Generated<number>;
}

export interface AuditLogsTable {
    id: string;
    user_id: string | null;
    action: string;
    table_name: string;
    record_id: string | null;
    old_values: string | null;
    new_values: string | null;
    ip_address: string | null;
    user_agent: string | null;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    timestamp: Generated<number>;
}

export interface RefreshTokensTable {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: number;
    created_at: Generated<number>;
    revoked: number; // 0 or 1
    revoked_at: number | null;
    last_used_at: number | null;
    user_agent: string | null;
    ip_address: string | null;
}

export interface IdentityKeysTable {
    id: Generated<number>;
    user_id: string;
    public_key: string;
    fingerprint: string;
    created_at: Generated<number>;
    is_active: number; // 0 or 1
    revoked_at: number | null;
}

export interface SignatureKeysTable {
    id: Generated<number>;
    user_id: string;
    public_key: string;
    fingerprint: string;
    created_at: Generated<number>;
    is_active: number; // 0 or 1
    revoked_at: number | null;
}

export interface SignedPreKeysTable {
    id: Generated<number>;
    user_id: string;
    key_id: number;
    public_key: string;
    signature: string;
    timestamp: number;
    created_at: Generated<number>;
    is_active: number; // 0 or 1
    revoked_at: number | null;
}

export interface OneTimePreKeysTable {
    id: Generated<number>;
    user_id: string;
    key_id: number;
    public_key: string;
    created_at: Generated<number>;
    used_at: number | null;
    used_by: string | null;
}

export interface MetadataTable {
    key: string;
    value: string;
    updated_at: number;
}

export interface DatabaseSchema {
    users: UsersTable;
    conversations: ConversationsTable;
    conversation_members: ConversationMembersTable;
    messages: MessagesTable;
    attachments: AttachmentsTable;
    audit_logs: AuditLogsTable;
    refresh_tokens: RefreshTokensTable;
    identity_keys: IdentityKeysTable;
    signature_keys: SignatureKeysTable;
    signed_pre_keys: SignedPreKeysTable;
    one_time_pre_keys: OneTimePreKeysTable;
    metadata: MetadataTable;
}
