ALTER TABLE users ADD COLUMN roles_json TEXT DEFAULT '[]';

UPDATE users
SET roles_json = CASE
  WHEN role IS NOT NULL THEN json_array(role)
  ELSE '[]'
END
WHERE roles_json IS NULL OR roles_json = '[]';
