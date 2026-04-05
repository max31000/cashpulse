-- Migration 003: Add Telegram authentication
-- Replace GoogleSubjectId with TelegramId, support multi-tenant users

ALTER TABLE Users
    ADD COLUMN TelegramId BIGINT NULL AFTER GoogleSubjectId,
    ADD UNIQUE KEY uq_users_telegram_id (TelegramId);

-- Make Email nullable (Telegram doesn't always provide email)
ALTER TABLE Users
    MODIFY COLUMN Email VARCHAR(255) NULL;

-- Seed system categories for new users: we'll handle this in application code
-- The dev user (Id=1) keeps its data as-is
