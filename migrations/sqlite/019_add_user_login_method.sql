-- Add login_method column to users so each user can be restricted to a single login mechanism
ALTER TABLE users ADD COLUMN login_method TEXT;

-- No index required; values are read during authentication checks
