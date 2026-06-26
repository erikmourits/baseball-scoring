ALTER TABLE at_bats ADD COLUMN IF NOT EXISTS scored_player_ids uuid[] DEFAULT NULL;
