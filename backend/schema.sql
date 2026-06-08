-- 金铲铲之战水友赛平台数据库 Schema
-- SQLite 数据库

-- 赛季表
CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,        -- 赛季名称（如：2026春季赛）
    description TEXT,                 -- 赛季描述
    status TEXT DEFAULT 'active',    -- active/completed/archived
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 玩家报名表
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_uid TEXT NOT NULL,           -- 游戏数字ID
    game_nickname TEXT NOT NULL,      -- 游戏昵称
    region TEXT NOT NULL,             -- 大区: QQ 或 WeChat
    contact TEXT,                     -- 联系方式（QQ号/微信号）
    award_qq TEXT,                    -- 领奖QQ号
    season_id INTEGER DEFAULT 1,      -- 所属赛季ID
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_uid, region),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

-- 赛事轮次表
CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_number INTEGER NOT NULL,    -- 第几轮 (1,2,3...)
    name TEXT NOT NULL,               -- 轮次名称 (海选赛/晋级赛/...)
    stage_name TEXT DEFAULT '',       -- 赛段名称（海选赛/晋级赛/淘汰赛/争锋赛/决胜赛）
    region TEXT DEFAULT '',           -- 大区: QQ / WeChat / ''表示全大区
    status TEXT DEFAULT 'pending',    -- pending/active/completed
    season_id INTEGER DEFAULT 1,     -- 所属赛季ID
    match_deadline TEXT DEFAULT '',  -- 比赛截止时间
    submit_deadline TEXT DEFAULT '', -- 比赛结算登记截止时间
    started_at DATETIME,
    ended_at DATETIME,
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

-- 分组表（每轮的每个组）
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    group_number INTEGER NOT NULL,    -- 第几组（每大区独立编号）
    status TEXT DEFAULT 'pending',    -- pending/active/completed
    group_status TEXT DEFAULT 'pending', -- pending/active/completed/finished（完赛）
    region TEXT,                      -- 大区: QQ 或 WeChat
    stage_name TEXT DEFAULT '',       -- 赛段名称
    qq_group_number TEXT,             -- 该组对应的QQ群号
    qq_group_locked INTEGER DEFAULT 0, -- 0=未锁定(可修改), 1=已锁定(仅管理员可修改)
    FOREIGN KEY (round_id) REFERENCES rounds(id)
);

-- 玩家分组关联表
CREATE TABLE IF NOT EXISTS group_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    placement INTEGER,                -- 名次 (1-8)
    screenshot_path TEXT,             -- 战绩截图路径
    verified INTEGER DEFAULT 0,       -- 0=未验证, 1=已验证通过
    verified_at DATETIME,
    submitted_at DATETIME,
    submitted INTEGER DEFAULT 0,      -- 0=未提交, 1=已提交（每轮次仅一次）
    review_status TEXT,               -- null=无, pending=待审核, approved=审核通过, rejected=已拒绝
    review_note TEXT,                 -- 审核备注
    reviewed_by INTEGER,              -- 审核管理员
    reviewed_at DATETIME,
    player_status TEXT DEFAULT 'pending', -- pending/advanced/eliminated
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- 晋级记录表
CREATE TABLE IF NOT EXISTS advancements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    from_round_id INTEGER NOT NULL,
    from_group_id INTEGER NOT NULL,
    to_round_id INTEGER,
    placement INTEGER NOT NULL,       -- 在原组中的名次
    advanced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (from_round_id) REFERENCES rounds(id),
    FOREIGN KEY (from_group_id) REFERENCES groups(id),
    FOREIGN KEY (to_round_id) REFERENCES rounds(id)
);

-- 赛事配置表
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始化配置
INSERT OR IGNORE INTO config (key, value) VALUES ('registration_open', 'true');
INSERT OR IGNORE INTO config (key, value) VALUES ('registration_deadline', '');
INSERT OR IGNORE INTO config (key, value) VALUES ('players_per_group', '8');
INSERT OR IGNORE INTO config (key, value) VALUES ('current_stage', '海选赛');
INSERT OR IGNORE INTO config (key, value) VALUES ('advance_count', '4');
INSERT OR IGNORE INTO config (key, value) VALUES ('tournament_started', 'false');

-- 赛段配置表
CREATE TABLE IF NOT EXISTS stage_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_index INTEGER NOT NULL,    -- 赛段序号（1=第一赛段）
    stage_name TEXT NOT NULL,        -- 赛段名称（海选赛/晋级赛/淘汰赛/争锋赛/决胜赛）
    advance_count INTEGER DEFAULT 4, -- 每组晋级人数
    players_per_group INTEGER DEFAULT 8, -- 每组人数
    description TEXT,                -- 赛段描述
    deadline TEXT DEFAULT ''        -- 赛段截止时间
);
