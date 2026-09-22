-- =======================================================
-- POKER MES: Database Schema & Realtime Setup for Supabase
-- =======================================================

-- 1. Tabel Tournament / Game State
CREATE TABLE IF NOT EXISTS public.tournaments (
    id TEXT PRIMARY KEY DEFAULT 'current',
    title TEXT NOT NULL DEFAULT 'POKER MES',
    hand INT NOT NULL DEFAULT 24,
    event_start_time TIMESTAMPTZ NOT NULL DEFAULT NOW() - INTERVAL '83 minutes 42 seconds',
    blind_level INT NOT NULL DEFAULT 3,
    last_blind_change_time TIMESTAMPTZ NOT NULL DEFAULT NOW() - INTERVAL '13 minutes 42 seconds',
    blind_interval_secs INT NOT NULL DEFAULT 1200,
    total_medals INT NOT NULL DEFAULT 25,
    center_medals INT NOT NULL DEFAULT 11,
    center_value BIGINT NOT NULL DEFAULT 22000,
    total_prize BIGINT NOT NULL DEFAULT 50000,
    current_round TEXT DEFAULT 'PRE-FLOP',
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabel Players
CREATE TABLE IF NOT EXISTS public.players (
    id INT PRIMARY KEY,
    name TEXT NOT NULL,
    chips INT NOT NULL DEFAULT 0,
    medals INT NOT NULL DEFAULT 0,
    last_try_used BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active', -- 'ready', 'active', 'lasttry', 'eliminated'
    position_role TEXT DEFAULT NULL,       -- 'D', 'SB', 'BB', NULL
    current_action TEXT DEFAULT NULL,     -- 'RAISE +300', 'CALL 150', 'CHECK', 'FOLD', etc.
    sort_order INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabel Hand History / Events
CREATE TABLE IF NOT EXISTS public.hand_history (
    id BIGSERIAL PRIMARY KEY,
    hand INT NOT NULL,
    winner TEXT NOT NULL,
    total_pot INT DEFAULT 0,
    deltas JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS) & Allow public read/write for tournament app
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hand_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all public on tournaments" ON public.tournaments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public on players" ON public.players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public on hand_history" ON public.hand_history FOR ALL USING (true) WITH CHECK (true);

-- 5. Enable Realtime Publications
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hand_history;

-- 6. Seed Initial Tournament Data
INSERT INTO public.tournaments (
    id, title, hand, blind_level, total_medals, center_medals, center_value, total_prize, current_round
) VALUES (
    'current', 'POKER MES', 24, 3, 25, 11, 22000, 50000, 'PRE-FLOP'
) ON CONFLICT (id) DO NOTHING;

-- Seed Initial 8 Players
INSERT INTO public.players (id, name, chips, medals, last_try_used, status, position_role, current_action, sort_order) VALUES
(1, 'ANDI', 2450, 6, FALSE, 'ready', 'D', 'RAISE +300', 1),
(2, 'FADLI', 2100, 4, FALSE, 'active', 'SB', 'CALL 150', 2),
(3, 'DENI', 1800, 2, FALSE, 'active', 'BB', 'CHECK', 3),
(4, 'BUDI', 1100, 3, FALSE, 'active', NULL, 'FOLD', 4),
(5, 'HADI', 900, 2, FALSE, 'active', NULL, 'CALL 150', 5),
(6, 'CACA', 650, 7, FALSE, 'active', NULL, 'FOLD', 6),
(7, 'EKO', 400, 1, TRUE, 'lasttry', NULL, 'LAST TRY USED', 7),
(8, 'GITA', 0, 0, TRUE, 'eliminated', NULL, 'ELIMINATED', 8)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    chips = EXCLUDED.chips,
    medals = EXCLUDED.medals,
    last_try_used = EXCLUDED.last_try_used,
    status = EXCLUDED.status,
    position_role = EXCLUDED.position_role,
    current_action = EXCLUDED.current_action,
    sort_order = EXCLUDED.sort_order;

-- Seed Sample Recent Hands
INSERT INTO public.hand_history (hand, winner, deltas) VALUES
(23, 'ANDI', '[{"name":"ANDI","medals":3},{"name":"BUDI","medals":-2},{"name":"DENI","medals":-1},{"name":"CENTER","medals":-1}]'::jsonb),
(22, 'FADLI', '[{"name":"FADLI","medals":2},{"name":"CACA","medals":-1},{"name":"CENTER","medals":-1}]'::jsonb),
(21, 'BUDI', '[{"name":"BUDI","medals":2},{"name":"CENTER","medals":-1},{"name":"HADI","medals":-1}]'::jsonb),
(20, 'EKO', '[{"name":"EKO","medals":0},{"name":"GITA","medals":0,"note":"ELIMINATED"}]'::jsonb);
