-- Add meta_keywords column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS meta_keywords TEXT;
