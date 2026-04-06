-- Add CLI platform tracking to sessions
-- Supports multi-CLI: claude, codex, gemini, opencode
ALTER TABLE sessions ADD COLUMN cli_platform TEXT DEFAULT 'claude';
