-- What a tile shows at its foot, as numbers and graphs; null for its kind's default
-- AlterTable
ALTER TABLE "Tile" ADD COLUMN "foot" JSONB;

-- A tile with graphs left off keeps that: its kind's default numbers, and
-- the default graphs less those
UPDATE "Tile"
SET "foot" = jsonb_build_object(
  'numbers',
  CASE WHEN "key" LIKE 'site:%' THEN '["response","status"]'::jsonb
       ELSE '["cpu","memory"]'::jsonb END,
  'graphs',
  COALESCE(
    (SELECT jsonb_agg(g)
       FROM unnest(CASE WHEN "key" LIKE 'site:%' THEN ARRAY['response']
                        ELSE ARRAY['cpu', 'memory'] END) AS g
      WHERE NOT g = ANY ("hiddenGraphs")),
    '[]'::jsonb
  )
)
WHERE cardinality("hiddenGraphs") > 0;

-- "hiddenGraphs" stays until the dashboard running on the server no longer
-- reads it; a later migration drops it
