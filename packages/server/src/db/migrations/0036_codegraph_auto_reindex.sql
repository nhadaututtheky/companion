-- Auto-reindex toggle for codegraph (Phase 4: auto-reindex on file changes)
ALTER TABLE codegraph_config ADD COLUMN auto_reindex_enabled INTEGER NOT NULL DEFAULT 1;
