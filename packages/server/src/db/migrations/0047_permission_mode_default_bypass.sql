-- Upgrade default permission mode: any row still on the legacy `"default"`
-- value is migrated to `"bypassPermissions"` so the Telegram Safe/Full
-- buttons (which only toggle `allowBash`) work as users expect — tools
-- auto-allow instantly instead of waiting on a prompt that nobody sees.
--
-- Self-hosted users who intentionally want prompts can still flip a
-- project back to `default` via the web UI.

UPDATE `projects`
SET `permission_mode` = 'bypassPermissions'
WHERE `permission_mode` = 'default';
--> statement-breakpoint

UPDATE `sessions`
SET `permission_mode` = 'bypassPermissions'
WHERE `permission_mode` = 'default' AND `status` IN ('idle', 'starting', 'running', 'waiting');
--> statement-breakpoint

UPDATE `schedules`
SET `permission_mode` = 'bypassPermissions'
WHERE `permission_mode` = 'default';
