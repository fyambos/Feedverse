export type UserSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  refresh_token_hash?: string | null;
  refresh_expires_at?: Date | null;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
};

export type UserSessionApi = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};
