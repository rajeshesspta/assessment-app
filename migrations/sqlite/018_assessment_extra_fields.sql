-- Add description and time_limit_minutes to assessments table
ALTER TABLE assessments ADD COLUMN description TEXT;
ALTER TABLE assessments ADD COLUMN time_limit_minutes INTEGER;
