CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rounds (
    id SERIAL PRIMARY KEY,
    season_id INTEGER,
    round_number INTEGER,
    group_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    stage_name TEXT DEFAULT ''   -- 赛段名称
);

CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    game_uid TEXT NOT NULL,
    game_nickname TEXT NOT NULL,
    region TEXT CHECK (region IN ('QQ', 'WeChat')) NOT NULL,
    contact TEXT,
    registration_time TEXT DEFAULT CURRENT_TIMESTAMP,
    season_id INTEGER,
    verified INTEGER DEFAULT 0,
    award_qq TEXT
);

CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    round_id INTEGER,
    group_number INTEGER,
    group_status TEXT DEFAULT 'pending',
    qq_group_number TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS group_players (
    id SERIAL PRIMARY KEY,
    group_id INTEGER,
    player_id INTEGER,
    placement INTEGER,
    screenshot_path TEXT,
    submitted_at TEXT,
    verified INTEGER DEFAULT 0,
    verification_result TEXT,
    review_status TEXT DEFAULT 'pending',
    review_note TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    player_status TEXT DEFAULT 'pending',
    submitted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stage_config (
    id SERIAL PRIMARY KEY,
    stage_index INTEGER NOT NULL,
    stage_name TEXT NOT NULL,
    advance_count INTEGER DEFAULT 4,
    players_per_group INTEGER DEFAULT 8,
    description TEXT,
    dead_line TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS advancements (
    id SERIAL PRIMARY KEY,
    player_id INTEGER,
    from_round_id INTEGER,
    from_group_id INTEGER,
    to_round_id INTEGER,
    placement INTEGER
);

-- 初始赛段配置
INSERT INTO stage_config (stage_index, stage_name, advance_count, players_per_group, description)
VALUES 
    (1, '海选赛', 4, 8, '第一轮海选，8晋4'),
    (2, '晋级赛', 4, 8, '第二轮晋级赛'),
    (3, '淘汰赛', 4, 8, '第三轮淘汰赛'),
    (4, '争锋赛', 4, 8, '第四轮争锋赛'),
    (5, '决胜赛', 4, 8, '第五轮决胜赛')
ON CONFLICT DO NOTHING;

-- 默认赛季
INSERT INTO seasons (name, is_active)
VALUES ('2025 春季赛', 1)
ON CONFLICT DO NOTHING;
