-- Admin dashboard notifications (replaces admin SMS/email alerts).
--
-- With the default DB_SYNCHRONIZE (not "false") TypeORM creates this table
-- automatically from src/notifications/entities/admin-notification.entity.ts.
-- Run this file by hand only if you have turned schema sync off:
--   psql "$DATABASE_URL" -f migrations/20261125_admin_notifications.sql

CREATE TABLE IF NOT EXISTS admin_notifications (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(50)  NOT NULL,           -- new_order | payment | cancellation | withdrawal | system
  title       VARCHAR(255) NOT NULL,
  message     TEXT         NOT NULL,
  data        JSONB,
  read        BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON admin_notifications (read);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications (created_at);
