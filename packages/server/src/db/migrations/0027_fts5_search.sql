-- FTS5 full-text search for code_nodes
-- Porter stemming tokenizer for natural language matching
CREATE VIRTUAL TABLE IF NOT EXISTS code_nodes_fts USING fts5(
  symbol_name,
  description,
  file_path,
  body_preview,
  content='code_nodes',
  content_rowid='id',
  tokenize='porter unicode61'
);

--> statement-breakpoint

-- Auto-sync triggers to keep FTS in sync with code_nodes
CREATE TRIGGER IF NOT EXISTS code_nodes_fts_insert AFTER INSERT ON code_nodes BEGIN
  INSERT INTO code_nodes_fts(rowid, symbol_name, description, file_path, body_preview)
  VALUES (new.id, new.symbol_name, COALESCE(new.description, ''), new.file_path, COALESCE(new.body_preview, ''));
END;

--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS code_nodes_fts_delete AFTER DELETE ON code_nodes BEGIN
  INSERT INTO code_nodes_fts(code_nodes_fts, rowid, symbol_name, description, file_path, body_preview)
  VALUES ('delete', old.id, old.symbol_name, COALESCE(old.description, ''), old.file_path, COALESCE(old.body_preview, ''));
END;

--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS code_nodes_fts_update AFTER UPDATE ON code_nodes BEGIN
  INSERT INTO code_nodes_fts(code_nodes_fts, rowid, symbol_name, description, file_path, body_preview)
  VALUES ('delete', old.id, old.symbol_name, COALESCE(old.description, ''), old.file_path, COALESCE(old.body_preview, ''));
  INSERT INTO code_nodes_fts(rowid, symbol_name, description, file_path, body_preview)
  VALUES (new.id, new.symbol_name, COALESCE(new.description, ''), new.file_path, COALESCE(new.body_preview, ''));
END;
