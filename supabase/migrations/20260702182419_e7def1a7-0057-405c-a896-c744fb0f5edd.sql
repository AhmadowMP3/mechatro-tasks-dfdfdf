
-- Add 'in_review' status
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'in_review' BEFORE 'done';
