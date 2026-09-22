-- =======================================================
-- POKER MES: Database Schema & Realtime Setup for Supabase
-- =======================================================

-- 1. Tabel Tournament / Game State
CREATE TABLE IF NOT EXISTS public.tournaments (
    id TEXT PRIMARY KEY DEFAULT 'current',
    title TEXT NOT NULL DEFAULT 'POKER MES',
    hand INT NOT NULL DEFAULT 1,
    event_start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blind_level INT NOT NULL DEFAULT 1,
    last_blind_change_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blind_interval_secs INT NOT NULL DEFAULT 900,
    total_medals INT NOT NULL DEFAULT 25,
    center_medals INT NOT NULL DEFAULT 11,
    center_value BIGINT NOT NULL DEFAULT 22000,
    total_prize BIGINT NOT NULL DEFAULT 50000,
    current_round TEXT DEFAULT 'PRE-FLOP',
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    ante_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ante_value INT NOT NULL DEFAULT 25,
    rebuy_chips INT NOT NULL DEFAULT 400,
    rupiah_per_medal INT NOT NULL DEFAULT 2000,
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

-- 3. Tabel Blind Schedules (Dinamis dari Database)
CREATE TABLE IF NOT EXISTS public.blind_schedules (
    level INT PRIMARY KEY,
    sb INT NOT NULL,
    bb INT NOT NULL,
    ante INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabel Hand History / Events
CREATE TABLE IF NOT EXISTS public.hand_history (
    id BIGSERIAL PRIMARY KEY,
    hand INT NOT NULL,
    winner TEXT NOT NULL,
    total_pot INT DEFAULT 0,
    deltas JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS) & Allow public read/write for tournament app
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blind_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hand_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Allow all public on tournaments" ON public.tournaments;
    DROP POLICY IF EXISTS "Allow all public on players" ON public.players;
    DROP POLICY IF EXISTS "Allow all public on blind_schedules" ON public.blind_schedules;
    DROP POLICY IF EXISTS "Allow all public on hand_history" ON public.hand_history;
END $$;

CREATE POLICY "Allow all public on tournaments" ON public.tournaments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public on players" ON public.players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public on blind_schedules" ON public.blind_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public on hand_history" ON public.hand_history FOR ALL USING (true) WITH CHECK (true);

-- 6. Enable Realtime Publications (Idempotent / Aman jika sudah terdaftar)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournaments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'players'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'blind_schedules'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.blind_schedules;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hand_history'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.hand_history;
    END IF;
END $$;

-- 7. Seed Official 1:2 Blind Structure (SB kelipatan 25, BB kelipatan 50)
INSERT INTO public.blind_schedules (level, sb, bb, ante) VALUES
(1, 25, 50, 0),
(2, 50, 100, 0),
(3, 75, 150, 0),
(4, 100, 200, 25),
(5, 125, 250, 25),
(6, 150, 300, 50),
(7, 175, 350, 50),
(8, 200, 400, 50),
(9, 250, 500, 75),
(10, 300, 600, 100),
(11, 350, 700, 100),
(12, 400, 800, 100)
ON CONFLICT (level) DO UPDATE SET
    sb = EXCLUDED.sb,
    bb = EXCLUDED.bb,
    ante = EXCLUDED.ante;

-- 8. Initialize Tournament Default State
INSERT INTO public.tournaments (
    id, title, hand, blind_level, blind_interval_secs, total_medals, center_medals, center_value, total_prize, current_round, is_paused
) VALUES (
    'current', 'POKER MES', 1, 1, 900, 25, 11, 22000, 50000, 'PRE-FLOP', FALSE
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    blind_interval_secs = EXCLUDED.blind_interval_secs;
