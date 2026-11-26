-- Migration: Add compliance fields
-- Date: 2026-11-26
-- Description: Adds containsAlcohol field to menu_items for age verification compliance

-- Add containsAlcohol field to menu_items table
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS "containsAlcohol" boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN menu_items."containsAlcohol" IS 'Rwanda law: Age 18+ verification required for alcohol sales';

-- Index for quick filtering (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_menu_items_contains_alcohol
ON menu_items("containsAlcohol")
WHERE "containsAlcohol" = true;
