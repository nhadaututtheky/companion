-- Drop WebIntel feature: remove web_intel_docs cache table.
-- web_docs_enabled column on codegraph_config is left in place (orphaned,
-- harmless) to avoid a table-rebuild dance; drizzle schema no longer
-- references it, so it is ignored at runtime.

DROP INDEX IF EXISTS idx_webintel_docs_library;
DROP TABLE IF EXISTS web_intel_docs;
