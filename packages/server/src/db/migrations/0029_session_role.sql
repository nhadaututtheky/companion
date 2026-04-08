-- Add agent role for multi-brain workspace
-- Values: coordinator, specialist, researcher, reviewer
ALTER TABLE sessions ADD COLUMN role TEXT;
