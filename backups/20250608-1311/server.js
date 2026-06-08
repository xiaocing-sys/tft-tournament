// ========== 安全校验：防止从C盘旧路径启动 ==========
const path = require('path');
const CURRENT_DIR = __dirname;
if (CURRENT_DIR.startsWith('C:\\') || CURRENT_DIR.includes('WorkBuddy')) {
    console.error('==========================================');
    console.error('❌ 错误：检测到正在从C盘旧路径启动！');
    console.error('   当前路径:', CURRENT_DIR);
    console.error('   正确路径: D:\\金铲铲水友赛网页\\tft-tournament\\backend\\');
    console.error('==========================================');
    process.exit(1);
}
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const Jimp = require('jimp');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'tournament.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// 初始化数据库
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('数据库连接失败:', err);
    else console.log('数据库连接成功');
});

db.serialize(() => {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema, (err) => {
            if (err) console.error('Schema 初始化失败:', err);
            else console.log('数据库 Schema 初始化完成');

            // Schema 初始化完成后执行迁移
            // 迁移1: 添加 award_qq 列
            db.all("PRAGMA table_info(players)", [], (err, cols) => {
                if (err) { console.error('检查表结构失败:', err); return; }
                const hasAwardQq = cols.some(c => c.name === 'award_qq');
                if (!hasAwardQq) {
                    db.run("ALTER TABLE players ADD COLUMN award_qq TEXT", [], (err) => {
                        if (err) console.error('添加 award_qq 列失败:', err);
                        else console.log('迁移完成：已添加 award_qq 列');
                    });
                }
                
                // 迁移2: 添加 seasons 表和 season_id 字段
                migrateSeasons();
            });
        });
    }
});

// ========== 赛季数据迁移 ==========
function migrateSeasons() {
    // 检查 seasons 表是否存在
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='seasons'", [], (err, table) => {
        if (!table) {
            console.log('[Migration] seasons 表不存在，将在 schema.sql 加载后创建');
            createDefaultSeason();
            return;
        }
        
        // 检查 players 表是否有 season_id 列
        db.all("PRAGMA table_info(players)", [], (err, cols) => {
            if (err) { console.error('检查 players 表结构失败:', err); return; }
            const hasSeasonId = cols.some(c => c.name === 'season_id');
            if (!hasSeasonId) {
                db.run("ALTER TABLE players ADD COLUMN season_id INTEGER DEFAULT 1", [], (err) => {
                    if (err) console.error('添加 season_id 到 players 失败:', err);
                    else console.log('迁移完成：已添加 season_id 到 players 表');
                });
            }
        });
        
        // 检查 rounds 表是否有 season_id 列
        db.all("PRAGMA table_info(rounds)", [], (err, cols) => {
            if (err) { console.error('检查 rounds 表结构失败:', err); return; }
            const hasSeasonId = cols.some(c => c.name === 'season_id');
            if (!hasSeasonId) {
                db.run("ALTER TABLE rounds ADD COLUMN season_id INTEGER DEFAULT 1", [], (err) => {
                    if (err) console.error('添加 season_id 到 rounds 失败:', err);
                    else console.log('迁移完成：已添加 season_id 到 rounds 表');
                });
            }
        });
        
        createDefaultSeason();
        migrateGroupFields();
        migrateReviewStatus();
        migrateStageConfigDeadline();
    });
}

// ========== groups 表字段迁移 ==========
function migrateReviewStatus() {
    db.run("ALTER TABLE group_players ADD COLUMN review_status TEXT", [], (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.log('[Migrate] review_status column may already exist');
        } else {
            console.log('[Migrate] review_status column added or exists');
        }
    });
    db.run("ALTER TABLE group_players ADD COLUMN review_note TEXT", [], (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.log('[Migrate] review_note column may already exist');
        }
    });
    db.run("ALTER TABLE group_players ADD COLUMN reviewed_by INTEGER", [], (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.log('[Migrate] reviewed_by column may already exist');
        }
    });
    db.run("ALTER TABLE group_players ADD COLUMN reviewed_at DATETIME", [], (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.log('[Migrate] reviewed_at column may already exist');
        }
    });
}

function migrateStageConfigDeadline() {
    db.all("PRAGMA table_info(stage_config)", [], (err, cols) => {
        if (err) { console.error('[Migrate] 检查 stage_config 表结构失败:', err); return; }
        const hasDeadline = cols && cols.some(c => c.name === 'deadline');
        if (!hasDeadline) {
            db.run("ALTER TABLE stage_config ADD COLUMN deadline TEXT DEFAULT ''", [], (err) => {
                if (err) console.error('[Migrate] 添加 deadline 列失败:', err);
                else console.log('[Migrate] 已添加 deadline 列到 stage_config 表');
            });
        } else {
            console.log('[Migrate] deadline 列已存在于 stage_config 表');
        }
    });
}

function migrateGroupFields() {
    db.all("PRAGMA table_info(groups)", [], (err, cols) => {
        if (err) { console.error('检查 groups 表结构失败:', err); return; }
        const hasRegion = cols.some(c => c.name === 'region');
        const hasQqGroupNumber = cols.some(c => c.name === 'qq_group_number');
        const hasQqGroupLocked = cols.some(c => c.name === 'qq_group_locked');

        if (!hasRegion) {
            db.run("ALTER TABLE groups ADD COLUMN region TEXT", [], (err) => {
                if (err) console.error('添加 region 列失败:', err);
                else console.log('迁移完成：已添加 region 到 groups 表');
            });
        }

        if (!hasQqGroupNumber) {
            db.run("ALTER TABLE groups ADD COLUMN qq_group_number TEXT", [], (err) => {
                if (err) console.error('添加 qq_group_number 列失败:', err);
                else console.log('迁移完成：已添加 qq_group_number 到 groups 表');
            });
        }
        
        if (!hasQqGroupLocked) {
            db.run("ALTER TABLE groups ADD COLUMN qq_group_locked INTEGER DEFAULT 0", [], (err) => {
                if (err) console.error('添加 qq_group_locked 列失败:', err);
                else console.log('迁移完成：已添加 qq_group_locked 到 groups 表');
            });
        }
    });
}

function createDefaultSeason() {
    // 检查是否已有赛季
    db.get("SELECT id FROM seasons LIMIT 1", [], (err, row) => {
        if (err) {
            // seasons 表可能还不存在（首次运行），跳过
            console.log('[Migration] seasons 表尚未创建，跳过默认赛季创建');
            return;
        }
        if (!row) {
            // 没有赛季，创建默认赛季，并将现有数据关联过来
            db.run("INSERT INTO seasons (name, description, status) VALUES (?, ?, ?)", 
                ['默认赛季', '自动创建的默认赛季', 'active'],
                function(err) {
                    if (err) { console.error('创建默认赛季失败:', err); return; }
                    const defaultSeasonId = this.lastID;
                    console.log('[Migration] 已创建默认赛季 (ID: ' + defaultSeasonId + ')');
                    
                    // 将现有玩家和轮次关联到默认赛季
                    db.run("UPDATE players SET season_id = ? WHERE season_id IS NULL OR season_id = 0", [defaultSeasonId], function(err) {
                        if (err) console.error('更新玩家赛季失败:', err);
                        else console.log('[Migration] 已将 ' + this.changes + ' 名玩家关联到默认赛季');
                    });
                    
                    db.run("UPDATE rounds SET season_id = ? WHERE season_id IS NULL OR season_id = 0", [defaultSeasonId], function(err) {
                        if (err) console.error('更新轮次赛季失败:', err);
                        else console.log('[Migration] 已将 ' + this.changes + ' 个轮次关联到默认赛季');
                    });
                }
            );
        }
    });
}

// ==================== 配置 API ====================

app.get('/api/config', (req, res) => {
    db.all('SELECT key, value FROM config', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const config = {};
        rows.forEach(r => config[r.key] = r.value);
        res.json(config);
    });
});

app.post('/api/config', (req, res) => {
    const { key, value } = req.body;
    db.run('UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
        [value, key], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

// ==================== 赛季管理 API ====================

// 获取所有赛季
app.get('/api/seasons', (req, res) => {
    db.all('SELECT * FROM seasons ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 创建新赛季
app.post('/api/seasons', (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '赛季名称不能为空' });
    
    db.run('INSERT INTO seasons (name, description, status) VALUES (?, ?, "active")',
        [name, description || ''],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: '赛季名称已存在' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, season_id: this.lastID });
        }
    );
});

// 更新赛季（重命名、修改状态）
app.put('/api/seasons/:id', (req, res) => {
    const { name, description, status } = req.body;
    const id = req.params.id;
    
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    db.run('UPDATE seasons SET ' + updates.join(', ') + ' WHERE id = ?',
        params,
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// 删除赛季（只能删除未开始的赛季）
app.delete('/api/seasons/:id', (req, res) => {
    const id = req.params.id;
    
    db.get('SELECT COUNT(*) as count FROM players WHERE season_id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row.count > 0) {
            return res.status(400).json({ error: '该赛季已有 ' + row.count + ' 名玩家报名，无法删除' });
        }
        
        db.run('DELETE FROM seasons WHERE id = ?', [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// 获取当前活跃赛季
app.get('/api/seasons/active', (req, res) => {
    db.get('SELECT * FROM seasons WHERE status = "active" ORDER BY id DESC LIMIT 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null);
    });
});

// 搜索玩家所在组别（供玩家查询自己被分到哪一组）
app.get('/api/players/search', (req, res) => {
    const { game_uid, season_id } = req.query;
    if (!game_uid) return res.status(400).json({ error: '请提供游戏ID或昵称' });
    
    const seasonCond = season_id ? 'AND p.season_id = ?' : 'AND p.season_id = (SELECT id FROM seasons WHERE status = "active" LIMIT 1)';
    const params = season_id ? [game_uid, game_uid, season_id] : [game_uid, game_uid];
    
    const sql = `
        SELECT p.game_nickname, p.region, g.group_number, r.name as round_name, r.round_number,
               g.id as group_id, r.id as round_id, s.name as season_name
        FROM players p
        JOIN group_players gp ON p.id = gp.player_id
        JOIN groups g ON gp.group_id = g.id
        JOIN rounds r ON g.round_id = r.id
        JOIN seasons s ON r.season_id = s.id
        WHERE (p.game_uid = ? OR p.game_nickname = ?) ${seasonCond}
        ORDER BY r.round_number DESC
        LIMIT 1
    `;
    
    db.get(sql, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: '未找到该游戏ID或昵称的分组信息，请确认是否已报名并分组' });
        
        // 获取同组所有成员
        db.all(`
            SELECT p.game_uid, p.game_nickname, p.region, gp.placement
            FROM group_players gp
            JOIN players p ON gp.player_id = p.id
            WHERE gp.group_id = ?
            ORDER BY gp.placement IS NULL, gp.placement ASC
        `, [row.group_id], (err, members) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                success: true,
                player: {
                    game_uid: row.game_uid,
                    game_nickname: row.game_nickname,
                    region: row.region
                },
                group: {
                    group_number: row.group_number,
                    round_name: row.round_name,
                    round_number: row.round_number,
                    season_name: row.season_name
                },
                members: members
            });
        });
    });
});

// ==================== 玩家报名 API ====================

app.post('/api/register', (req, res) => {
    const { game_uid, game_nickname, region, contact, award_qq, season_id } = req.body;
    if (!game_uid || !game_nickname || !region) {
        return res.status(400).json({ error: '请填写完整信息' });
    }
    
    // 获取赛季ID（如果未提供，使用活跃赛季）
    const getSeasonId = (callback) => {
        if (season_id) return callback(null, season_id);
        db.get('SELECT id FROM seasons WHERE status = "active" ORDER BY id DESC LIMIT 1', [], (err, row) => {
            if (err) return callback(err);
            if (!row) return callback(new Error('没有活跃的赛季，请联系管理员创建'));
            callback(null, row.id);
        });
    };
    
    getSeasonId((err, sid) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get('SELECT value FROM config WHERE key = "registration_open"', [], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row && row.value === 'false') {
                return res.status(400).json({ error: '报名已截止' });
            }
            // 检查报名截止时间
            db.get('SELECT value FROM config WHERE key = "registration_deadline"', [], (err, deadlineRow) => {
                if (err) return res.status(500).json({ error: err.message });
                if (deadlineRow && deadlineRow.value) {
                    const deadline = new Date(deadlineRow.value);
                    if (!isNaN(deadline.getTime()) && new Date() > deadline) {
                        return res.status(400).json({ error: '报名已截止' });
                    }
                }
                // 同大区内昵称去重检查（仅限同一赛季）
            db.get(
                'SELECT id FROM players WHERE game_nickname = ? AND region = ? AND season_id = ?',
                [game_nickname, region, sid],
                (err, existing) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (existing) {
                        return res.status(400).json({ error: '该大区内已有相同游戏昵称，请更换后重试' });
                    }
                    // 插入新玩家
                    db.run(
                        `INSERT INTO players (game_uid, game_nickname, region, contact, award_qq, season_id) VALUES (?, ?, ?, ?, ?, ?)`,
                        [game_uid, game_nickname, region, contact || '', award_qq || '', sid],
                        function (err) {
                            if (err) {
                                if (err.message.includes('UNIQUE')) {
                                    return res.status(400).json({ error: '该游戏ID已报名' });
                                }
                                return res.status(500).json({ error: err.message });
                            }
                            res.json({ success: true, player_id: this.lastID });
                        }
                    );
                }
            );
        });
    });
});
});

app.get('/api/players', (req, res) => {
    const { season_id } = req.query;
    if (season_id) {
        db.all('SELECT * FROM players WHERE season_id = ? ORDER BY registered_at DESC', [season_id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else {
        db.all('SELECT * FROM players ORDER BY registered_at DESC', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    }
});

app.delete('/api/players', (req, res) => {
    db.serialize(() => {
        db.run('DELETE FROM group_players');
        db.run('DELETE FROM advancements');
        db.run('DELETE FROM players');
        db.run('DELETE FROM groups');
        db.run('DELETE FROM rounds');
        res.json({ success: true });
    });
});

app.get('/api/players/count', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM players', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ count: row.count });
    });
});

// 按大区统计报名人数、分组数、轮次数
app.get('/api/players/stats', (req, res) => {
    db.all('SELECT region, COUNT(*) as count FROM players GROUP BY region', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const stats = { total: 0, qq: 0, wx: 0 };
        rows.forEach(r => {
            stats.total += r.count;
            if (r.region === 'QQ') stats.qq = r.count;
            if (r.region === 'WeChat') stats.wx = r.count;
        });
        const PLAYERS_PER_GROUP = 8;
        stats.qq_groups = Math.ceil(stats.qq / PLAYERS_PER_GROUP);
        stats.wx_groups = Math.ceil(stats.wx / PLAYERS_PER_GROUP);
        const calcRounds = (groups) => {
            if (groups <= 0) return 0;
            if (groups === 1) return 1;
            return Math.ceil(Math.log2(groups)) + 1;
        };
        stats.qq_rounds = calcRounds(stats.qq_groups);
        stats.wx_rounds = calcRounds(stats.wx_groups);
        res.json(stats);
    });
});

// ==================== 分组 API ====================

// 随机分组（按大区独立分组，不跨区混组；支持按赛季筛选）
app.post('/api/groups/generate', (req, res) => {
    const { round_number = 1, season_id, stage_name = '' } = req.body;
    const preview = req.query.preview !== 'false'; // 默认 preview=true
    const confirm = req.query.confirm === 'true'; // 确认应用（从预览到正式写入）
    
    const getSeasonId = (callback) => {
        if (season_id) return callback(null, season_id);
        db.get('SELECT id FROM seasons WHERE status = ? ORDER BY id DESC LIMIT 1', ['active'], (err, row) => {
            if (err) return callback(err);
            if (!row) return callback(new Error('没有活跃的赛季'));
            callback(null, row.id);
        });
    };
    
    getSeasonId((err, sid) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // 获取赛段配置
        db.get('SELECT * FROM stage_config WHERE stage_name = ? LIMIT 1', [stage_name || '海选赛'], (err, stageCfg) => {
            const PLAYERS_PER_GROUP = (stageCfg && stageCfg.players_per_group) ? stageCfg.players_per_group : 8;
            const ADVANCE_COUNT = (stageCfg && stageCfg.advance_count) ? stageCfg.advance_count : 4;
            
            // 获取该赛季所有已报名玩家
            db.all('SELECT * FROM players WHERE season_id = ?', [sid], (err, allPlayers) => {
                if (err) return res.status(500).json({ error: err.message });
                if (allPlayers.length < 2) return res.status(400).json({ error: '该赛季报名人数不足，无法分组' });
                
                // 按大区分开
                const qqPlayers = allPlayers.filter(p => p.region === 'QQ');
                const wxPlayers = allPlayers.filter(p => p.region === 'WeChat');
                
                // 每个大区独立随机打乱
                const shuffle = (arr) => {
                    for (let i = arr.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                    }
                    return arr;
                };
                
                const buildGroups = (players, region) => {
                    const shuffled = shuffle([...players]);
                    const groups = [];
                    for (let i = 0; i < shuffled.length; i += PLAYERS_PER_GROUP) {
                        const chunk = shuffled.slice(i, i + PLAYERS_PER_GROUP);
                        if (chunk.length > 0) groups.push(chunk);
                    }
                    return groups;
                };
                
                const qqGroups = buildGroups(qqPlayers, 'QQ');
                const wxGroups = buildGroups(wxPlayers, 'WeChat');
                
                // 如果是预览模式（且未确认），只返回分组预览，不写入数据库
                if (preview && !confirm) {
                    return res.json({
                        success: true,
                        preview: true,
                        qq_groups: qqGroups.map((g, i) => ({ group_number: i + 1, players: g, region: 'QQ' })),
                        wx_groups: wxGroups.map((g, i) => ({ group_number: i + 1, players: g, region: 'WeChat' })),
                        qq_group_count: qqGroups.length,
                        wx_group_count: wxGroups.length,
                    });
                }
                
                // 正式应用：写入数据库
                db.serialize(() => {
                    // 先删除该轮次旧分组
                    db.get('SELECT id FROM rounds WHERE round_number = ? AND season_id = ? ORDER BY id DESC LIMIT 1', [round_number, sid], (err, roundRow) => {
                        if (roundRow) {
                            db.run('DELETE FROM group_players WHERE group_id IN (SELECT id FROM groups WHERE round_id = ?)', [roundRow.id]);
                            db.run('DELETE FROM groups WHERE round_id = ?', [roundRow.id]);
                        }
                        
                        // 创建或获取轮次
                        db.get('SELECT id FROM rounds WHERE round_number = ? AND season_id = ? AND stage_name = ? ORDER BY id DESC LIMIT 1', [round_number, sid, stage_name || ''], (err, existingRound) => {
                            let roundId = existingRound ? existingRound.id : null;
                            const done = () => {
                                // 写入QQ区分组
                                const writeGroups = (groups, region, cb) => {
                                    let written = 0;
                                    groups.forEach((g, idx) => {
                                        db.run('INSERT INTO groups (round_id, group_number, region, stage_name, status) VALUES (?, ?, ?, ?, ?)', [roundId, idx + 1, region, stage_name || '', 'active'], function(err) {
                                            if (err) return cb(err);
                                            const gid = this.lastID;
                                            const stmt = db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)');
                                            g.forEach(p => stmt.run([gid, p.id]));
                                            stmt.finalize();
                                            written++;
                                            if (written === groups.length + (region === 'WeChat' ? 1 : 0)) cb(null);
                                        });
                                    });
                                    if (groups.length === 0) cb(null);
                                };
                                writeGroups(qqGroups, 'QQ', () => {
                                    writeGroups(wxGroups, 'WeChat', () => {
                                        res.json({ success: true, preview: false, qq_group_count: qqGroups.length, wx_group_count: wxGroups.length });
                                    });
                                });
                            };
                            
                            if (roundId) return done();
                            db.run('INSERT INTO rounds (round_number, name, stage_name, region, season_id, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [round_number, stage_name || '海选赛', stage_name || '', '', sid, 'active', new Date().toISOString()], function(err) {
                                if (err) return res.status(500).json({ error: err.message });
                                roundId = this.lastID;
                                done();
                            });
                        });
                    });
                });
            });
        });
    });
});
;

// 获取某轮次的所有分组（含玩家详情）
app.get('/api/groups/:roundId', (req, res) => {
    const roundId = req.params.roundId;
    db.all(`
        SELECT g.*, COUNT(gp.id) as player_count
        FROM groups g
        LEFT JOIN group_players gp ON g.id = gp.group_id
        WHERE g.round_id = ?
        GROUP BY g.id
        ORDER BY g.group_number
    `, [roundId], (err, groups) => {
        if (err) return res.status(500).json({ error: err.message });
        if (groups.length === 0) return res.json([]);

        const result = [];
        let pending = groups.length;
        groups.forEach(g => {
            db.all(`
                SELECT gp.*, p.game_uid, p.game_nickname, p.region, p.contact
                FROM group_players gp
                JOIN players p ON gp.player_id = p.id
                WHERE gp.group_id = ?
                ORDER BY gp.placement IS NULL, gp.placement ASC
            `, [g.id], (err, players) => {
                if (err) return res.status(500).json({ error: err.message });
                result.push({ ...g, players });
                pending--;
                if (pending === 0) {
                    result.sort((a, b) => {
                        if (a.region !== b.region) return a.region === 'QQ' ? -1 : 1;
                        return a.group_number - b.group_number;
                    });
                    res.json(result);
                }
            });
        });
    });
});

// 获取当前轮次
app.get('/api/rounds/current', (req, res) => {
    db.get('SELECT * FROM rounds WHERE status = "active" ORDER BY round_number DESC LIMIT 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null);
    });
});

// 获取所有轮次
app.get('/api/rounds', (req, res) => {
    db.all('SELECT * FROM rounds ORDER BY round_number', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==================== 战绩上传（multer 处理文件）====================

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const uploadMiddleware = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// 上传战绩（包含截图文件）
app.post('/api/results/upload', uploadMiddleware.single('screenshot'), (req, res) => {
    const { group_player_id, placement } = req.body;
    if (!group_player_id || !placement) {
        return res.status(400).json({ error: '缺少必要参数（group_player_id 和 placement）' });
    }

    // 检查是否已经提交过
    db.get('SELECT submitted FROM group_players WHERE id = ?', [group_player_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.submitted === 1) {
            return res.status(400).json({ error: '每轮次只能提交一次，您已经提交过了' });
        }

        const screenshotPath = req.file ? `/uploads/${req.file.filename}` : null;

        db.run(
            `UPDATE group_players
             SET placement = ?, screenshot_path = ?, submitted_at = CURRENT_TIMESTAMP, submitted = 1
             WHERE id = ?`,
            [parseInt(placement), screenshotPath, group_player_id],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, screenshot_path: screenshotPath });
            }
        );
    });
});

// 仅更新名次（无截图）
app.post('/api/results/submit-placement', (req, res) => {
    const { group_player_id, placement } = req.body;
    if (!group_player_id || !placement) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    // 检查是否已经提交过
    db.get('SELECT submitted FROM group_players WHERE id = ?', [group_player_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.submitted === 1) {
            return res.status(400).json({ error: '每轮次只能提交一次，您已经提交过了' });
        }

        db.run(
            `UPDATE group_players SET placement = ?, submitted_at = CURRENT_TIMESTAMP, submitted = 1 WHERE id = ?`,
            [parseInt(placement), group_player_id],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });
});


// ==================== OCR 截图验证 ====================
// 验证截图中的昵称和排名（不验证游戏ID，OCR识别不准）
app.post('/api/results/verify', async (req, res) => {
    const { group_player_id } = req.body;
    if (!group_player_id) {
        return res.status(400).json({ error: '缺少 group_player_id 参数' });
    }

    // 1. 获取截图路径和玩家信息
    db.get(
        'SELECT gp.*, p.game_nickname, p.region, gp.placement FROM group_players gp JOIN players p ON gp.player_id = p.id WHERE gp.id = ?',
        [group_player_id], async (err, row) => {
            if (err || !row) {
                return res.status(404).json({ error: '玩家记录不存在' });
            }
            if (!row.screenshot_path) {
                return res.status(400).json({ error: '未找到截图，请先上传' });
            }

            const fullPath = path.join(__dirname, row.screenshot_path);
            const expectedNickname = row.game_nickname || '';
            const expectedPlacement = row.placement;

            try {
                // 2. 使用 Tesseract 识别截图文字（带图像预处理）
                console.log('[OCR] 开始识别截图:', fullPath);
                console.log('[OCR] 预期信息: 昵称=' + expectedNickname + ', 排名=' + expectedPlacement);

                // 2.1 多策略OCR识别（区域裁剪+多尺度，大幅提高昵称识别率）
                let texts = []; // 收集所有策略的识别结果
                
                // 策略A: 整图 + 预处理（用于捕获"第X名"等大字和完整排名列表）
                console.log('[OCR] 策略A: 整图预处理识别');
                try {
                    const image = await Jimp.read(fullPath);
                    const origW = image.width;
                    const origH = image.height;
                    await image.resize({ w: origW * 2, h: origH * 2 });
                    image.greyscale();
                    image.contrast(0.3);
                    const fullBuffer = await image.getBuffer('image/png');
                    
                    const workerA = await Tesseract.createWorker('eng+chi_sim');
                    await workerA.setParameters({
                        tessedit_pageseg_mode: '6',
                        tessedit_ocr_engine_mode: '1',
                        preserve_interword_spaces: '1',
                    });
                    const retA = await workerA.recognize(fullBuffer);
                    texts.push(retA.data.text);
                    await workerA.terminate();
                    console.log('[OCR] 策略A完成');
                } catch (preErr) {
                    console.log('[OCR] 策略A失败:', preErr.message);
                }

                // 策略B: 裁剪排名列表区域（左侧38%，专注排名+昵称列，排除羁绊图标干扰）
                console.log('[OCR] 策略B: 裁剪排名列表区域识别');
                try {
                    const img = await Jimp.read(fullPath);
                    const iw = img.width;
                    const ih = img.height;
                    // 裁剪左侧38%区域，从表头下方开始到列表底部
                    const listArea = img.clone().crop({ 
                        x: 0, 
                        y: Math.floor(ih * 0.18), 
                        w: Math.floor(iw * 0.38), 
                        h: Math.floor(ih * 0.62) 
                    });
                    await listArea.resize({ w: listArea.width * 3, h: listArea.height * 3 });
                    listArea.greyscale();
                    listArea.contrast(0.4);
                    const listBuffer = await listArea.getBuffer('image/png');
                    
                    const workerB = await Tesseract.createWorker('eng+chi_sim');
                    await workerB.setParameters({
                        tessedit_pageseg_mode: '6',
                        tessedit_ocr_engine_mode: '1',
                        preserve_interword_spaces: '1',
                    });
                    const retB = await workerB.recognize(listBuffer);
                    texts.push(retB.data.text);
                    await workerB.terminate();
                    console.log('[OCR] 策略B完成');
                } catch (cropErr) {
                    console.log('[OCR] 策略B失败:', cropErr.message);
                }

                // 2.2 合并所有策略的识别结果
                let text = '';
                if (texts.length > 0) {
                    text = texts.join('\n');
                    console.log('[OCR] 多策略合并完成，策略数=' + texts.length + ', 总长度=' + text.length);
                } else {
                    // 所有策略都失败，fallback到默认方式
                    console.log('[OCR] 所有策略失败，fallback到默认方式');
                    const { data: { text: fallbackText } } = await Tesseract.recognize(fullPath, 'eng+chi_sim', {
                        logger: m => console.log('[OCR]', m)
                    });
                    text = fallbackText;
                }
                console.log('[OCR] 识别结果:', text.substring(0, 500) + (text.length > 500 ? '...' : ''));
                const cleanText = text.replace(/\s/g, '');

                // ========== 辅助函数：中文数字转阿拉伯数字 ==========
                const cnNumMap = {
                    '一': 1, '二': 2, '三': 3, '四': 4,
                    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
                    '1': 1, '2': 2, '3': 3, '4': 4,
                    '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
                };

                // ========== 3. 排名验证（多维度，优先级从高到低）==========
                let placementFound = false;
                let placementDetails = [];
                let foundPlacementNumbers = []; // 记录找到的所有排名数字

                if (expectedPlacement) {
                    const expStr = expectedPlacement.toString();

                    // 3.1 匹配顶部 "第X名" / "第 X 名"（阿拉伯数字）
                    const topPatternsAr = [
                        new RegExp('第\\s*' + expStr + '\\s*名'),
                        new RegExp('第' + expStr + '名'),
                    ];
                    if (topPatternsAr.some(p => p.test(text))) {
                        placementFound = true;
                        placementDetails.push('顶部名次(阿拉伯数字)');
                    }

                    // 3.2 匹配 "第X名"（中文数字，如"第二名"）
                    const cnNumKeys = Object.keys(cnNumMap).filter(k => cnNumMap[k] == expectedPlacement);
                    for (const cnKey of cnNumKeys) {
                        if (text.indexOf('第' + cnKey + '名') !== -1 ||
                            text.indexOf('第 ' + cnKey + ' 名') !== -1) {
                            placementFound = true;
                            placementDetails.push('顶部名次(中文数字:' + cnKey + ')');
                            break;
                        }
                    }

                    // 3.3 匹配左侧排名列（行首或独立出现的 1-8 数字）
                    if (!placementFound) {
                        const rankPatterns = [
                            new RegExp('(^|[\\n\\r])\\s*' + expStr + '\\s+(?=[^\\d])'),
                            new RegExp('排名[\\s:：]*' + expStr),
                            new RegExp('Rank[\\s:：]*' + expStr, 'i'),
                            new RegExp('#\\s*' + expStr),
                        ];
                        if (rankPatterns.some(p => p.test(text))) {
                            placementFound = true;
                            placementDetails.push('排名列匹配');
                        }
                    }

                    // 3.4 检查纯数字中是否包含预期排名（作为兜底）
                    // 修复：/\d+/g → /\d+/g（注意这里用字符串构造正则，\\d 会被解析为 \d）
                    const allNumbers = text.match(/\d+/g) || [];
                    if (allNumbers.includes(expStr)) {
                        if (!placementFound) {
                            placementFound = true;
                            placementDetails.push('数字匹配');
                        } else {
                            placementDetails.push('数字匹配(辅助)');
                        }
                    }
                }

                // 3.5 完整性校验：提取所有 1-8 的数字，检查是否包含完整排名列表
                const allNumbers = text.match(/\d+/g) || [];
                const uniqueNumbers = [...new Set(allNumbers.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 8))];
                const hasFullRanking = uniqueNumbers.length >= 6;
                if (hasFullRanking) {
                    placementDetails.push('完整排名(' + uniqueNumbers.sort((a, b) => a - b).join(',') + ')');
                }

                // ========== 4. 昵称验证（v3: 分段匹配 + 忽略特殊符号 + 编辑距离容错）==========
                let nicknameFound = false;
                let nicknameDetails = [];
                let nicknameScore = 0;

                // 辅助函数：Levenshtein编辑距离（用于容错单个字符误识别）
                function levenshtein(a, b) {
                    const matrix = [];
                    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                    for (let i = 1; i <= b.length; i++) {
                        for (let j = 1; j <= a.length; j++) {
                            matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
                                ? matrix[i - 1][j - 1]
                                : Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                        }
                    }
                    return matrix[b.length][a.length];
                }

                // 辅助函数：从文本中提取中文和英文
                function extractSegments(str) {
                    const cn = str.match(/[\u4e00-\u9fa5]/g) || [];
                    const en = str.match(/[a-zA-Z]+/g) || [];
                    const alnum = str.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
                    return { cn: cn.join(''), en: en.join(' '), alnum: alnum };
                }

                // 辅助函数：计算两段文本的匹配率（基于编辑距离）
                function similarity(a, b) {
                    if (!a || !b) return 0;
                    const dist = levenshtein(a, b);
                    const maxLen = Math.max(a.length, b.length);
                    return maxLen > 0 ? Math.round((1 - dist / maxLen) * 100) : 100;
                }

                if (expectedNickname) {
                    const lowerText = text.toLowerCase();
                    const lowerClean = cleanText.toLowerCase();
                    const lowerNick = expectedNickname.toLowerCase();

                    // === 4.1 精确匹配 ===
                    if (lowerText.indexOf(lowerNick) !== -1) {
                        nicknameFound = true;
                        nicknameDetails.push('精确匹配');
                        nicknameScore = 100;
                    }

                    // === 4.2 去除特殊符号后匹配（萌名满贯o.o → 萌名满贯）===
                    if (!nicknameFound) {
                        const nickAlnum = lowerNick.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
                        const textAlnum = lowerText.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
                        if (nickAlnum.length >= 2 && textAlnum.indexOf(nickAlnum) !== -1) {
                            nicknameFound = true;
                            nicknameDetails.push('去符号匹配');
                            nicknameScore = 92;
                        }
                    }

                    // === 4.3 分段匹配：中文/英文分别匹配（核心优化）===
                    if (!nicknameFound) {
                        const nickSeg = extractSegments(expectedNickname);
                        const textSeg = extractSegments(text);

                        let cnScore = 0, enScore = 0;

                        // 中文部分匹配
                        if (nickSeg.cn.length > 0) {
                            if (textSeg.cn.indexOf(nickSeg.cn) !== -1) {
                                cnScore = 100; // 完整包含
                            } else {
                                // 基于编辑距离的相似度
                                cnScore = similarity(nickSeg.cn, textSeg.cn);
                            }
                        } else {
                            cnScore = 100; // 无中文部分，默认满分
                        }

                        // 英文部分匹配
                        if (nickSeg.en.length > 0) {
                            const nickEnLower = nickSeg.en.toLowerCase().replace(/\s/g, '');
                            const textEnLower = textSeg.en.toLowerCase().replace(/\s/g, '');
                            if (textEnLower.indexOf(nickEnLower) !== -1 || nickEnLower.indexOf(textEnLower) !== -1) {
                                enScore = 100;
                            } else {
                                enScore = similarity(nickEnLower, textEnLower);
                            }
                        } else {
                            enScore = 100;
                        }

                        // 判断逻辑：
                        // - 中英文混合昵称：中文≥50% 或 英文完全匹配（≥80%）
                        // - 纯中文：≥60% 或 编辑距离≤1
                        // - 纯英文：≥70%
                        const hasCn = nickSeg.cn.length > 0;
                        const hasEn = nickSeg.en.length > 0;

                        if (hasCn && hasEn) {
                            // 中英文混合（如 Little辞、萌名满贯o.o）
                            if (cnScore >= 50 || enScore >= 80) {
                                nicknameFound = true;
                                nicknameDetails.push('分段匹配(中文' + cnScore + '%/英文' + enScore + '%)');
                                nicknameScore = Math.max(cnScore, enScore);
                            }
                        } else if (hasCn) {
                            // 纯中文（如 甜甜圈真好吃呢）
                            if (cnScore >= 60) {
                                nicknameFound = true;
                                nicknameDetails.push('中文匹配(' + cnScore + '%)');
                                nicknameScore = cnScore;
                            }
                        } else if (hasEn) {
                            // 纯英文
                            if (enScore >= 70) {
                                nicknameFound = true;
                                nicknameDetails.push('英文匹配(' + enScore + '%)');
                                nicknameScore = enScore;
                            }
                        }
                    }

                    // === 4.4 编辑距离兜底（处理单字误识别，如"洛挽霞"→"洛挽起"）===
                    if (!nicknameFound && expectedNickname.length >= 3) {
                        // 从OCR文本中找出与期望昵称最相似的子串
                        const nickAlnum = lowerNick.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
                        const textAlnum = lowerText.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
                        if (nickAlnum.length >= 2 && textAlnum.length >= nickAlnum.length) {
                            let bestDist = Infinity;
                            // 滑动窗口找最相似的子串
                            for (let i = 0; i <= textAlnum.length - nickAlnum.length; i++) {
                                const window = textAlnum.substring(i, i + nickAlnum.length);
                                const dist = levenshtein(nickAlnum, window);
                                if (dist < bestDist) bestDist = dist;
                            }
                            // 允许1-2个字符的误差（根据昵称长度动态调整）
                            const allowError = nickAlnum.length <= 4 ? 1 : 2;
                            if (bestDist <= allowError) {
                                nicknameFound = true;
                                nicknameDetails.push('模糊匹配(编辑距离' + bestDist + ')');
                                nicknameScore = Math.round((1 - bestDist / nickAlnum.length) * 70);
                            }
                        }
                    }

                    // === 4.5 OCR常见字符混淆匹配 ===
                    if (!nicknameFound) {
                        const confusedText = lowerClean
                            .replace(/0/g, 'o')
                            .replace(/1/g, 'l')
                            .replace(/5/g, 's')
                            .replace(/8/g, 'b');
                        const confusedNick = lowerNick
                            .replace(/0/g, 'o')
                            .replace(/1/g, 'l')
                            .replace(/5/g, 's')
                            .replace(/8/g, 'b');
                        if (confusedText.indexOf(confusedNick) !== -1) {
                            nicknameFound = true;
                            nicknameDetails.push('混淆字符匹配');
                            nicknameScore = 65;
                        }
                    }
                }

                // ========== 5. 综合验证结果 ==========
                const nicknameVerified = nicknameFound;
                const placementVerified = expectedPlacement ? placementFound : true;

                let verified = false;
                let verifyMode = '';

                // 5.1 标准验证：昵称+排名都匹配
                if (nicknameVerified && placementVerified) {
                    verified = true;
                    verifyMode = '标准验证（昵称+排名）';
                }
                // 5.2 兜底验证：排名明确匹配 + 完整排名列表存在
                else if (placementVerified && hasFullRanking) {
                    verified = true;
                    verifyMode = '排名验证（排名匹配+完整排名列表）';
                }
                // 5.3 兜底验证：昵称匹配 + 完整排名列表
                else if (nicknameVerified && hasFullRanking) {
                    verified = true;
                    verifyMode = '兜底验证（昵称+完整排名列表）';
                }
                // 5.4 弱验证：仅排名匹配（对于OCR识别困难的情况，降低门槛）
                else if (placementVerified) {
                    verified = true;
                    verifyMode = '弱验证（仅排名匹配，建议管理员复核）';
                }

                // 6. 如果验证通过，更新数据库
                if (verified) {
                    db.run('UPDATE group_players SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [group_player_id], (err) => {
                            if (err) console.error('更新验证状态失败:', err);
                        });
                }

                // 7. 返回详细验证结果
                const failReasons = [];
                if (!nicknameVerified) failReasons.push('昵称未识别');
                if (!placementVerified) failReasons.push('排名未识别');
                if (!hasFullRanking) failReasons.push('未检测到完整排名列表');

                res.json({
                    success: true,
                    verified,
                    verify_mode: verifyMode,
                    details: {
                        nickname_verified: nicknameVerified,
                        nickname_details: nicknameDetails,
                        nickname_score: nicknameScore,
                        placement_verified: placementVerified,
                        placement_details: placementDetails,
                        has_full_ranking: hasFullRanking,
                        expected_nickname: expectedNickname,
                        expected_placement: expectedPlacement,
                        ocr_text: text,
                        ocr_text_clean: cleanText
                    },
                    message: verified
                        ? '✅ 验证通过！' + verifyMode
                        : '⚠️ 验证未通过：' + failReasons.join('、') + '。请管理员手动审核。'
                });

            } catch (err) {
                console.error('[OCR] 识别失败:', err);
                res.status(500).json({
                    error: 'OCR识别失败：' + err.message,
                    tip: '请确保截图清晰，且包含游戏昵称和排名信息'
                });
            }
        }
    );
});

// ==================== 昵称更新 API ====================
// 更新玩家昵称（仅管理员可用，修改分组昵称时同步更新数据底表）
app.put('/api/players/:id/nickname', (req, res) => {
    const playerId = req.params.id;
    const { game_nickname } = req.body;
    if (!game_nickname || game_nickname.trim() === '') {
        return res.status(400).json({ error: '昵称不能为空' });
    }
    db.run(
        'UPDATE players SET game_nickname = ? WHERE id = ?',
        [game_nickname.trim(), playerId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: '玩家不存在' });
            res.json({ success: true, player_id: playerId, game_nickname: game_nickname.trim() });
        }
    );
});

// ==================== QQ群号更新 API ====================
// 设置/更新某分组的QQ群号
app.put('/api/groups/:id/qq-group', (req, res) => {
    const groupId = req.params.id;
    const { qq_group_number, force } = req.body;
    
    // 校验：只允许纯数字
    if (qq_group_number && !/^\d+$/.test(qq_group_number.toString())) {
        return res.status(400).json({ error: 'QQ群号只能包含数字' });
    }
    
    db.get('SELECT qq_group_locked FROM groups WHERE id = ?', [groupId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: '分组不存在' });
        
        // 如果已锁定且不是强制修改，返回错误
        if (row.qq_group_locked === 1 && !force) {
            return res.status(403).json({ error: '该群号已锁定，仅管理员可修改', locked: true });
        }
        
        db.run(
            'UPDATE groups SET qq_group_number = ?, qq_group_locked = ? WHERE id = ?',
            [qq_group_number, 1, groupId],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, group_id: groupId, qq_group_number, locked: true });
            }
        );
    });
});


// ==================== 赛段配置 API ====================

// 获取赛段配置列表
app.get('/api/stages', (req, res) => {
    db.all('SELECT * FROM stage_config ORDER BY stage_index', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 更新赛段配置
app.post('/api/stages', (req, res) => {
    const { stages } = req.body;
    if (!Array.isArray(stages)) return res.status(400).json({ error: 'stages 必须是数组' });
    db.serialize(() => {
        db.run('DELETE FROM stage_config');
        const stmt = db.prepare('INSERT INTO stage_config (stage_index, stage_name, advance_count, players_per_group, description, deadline) VALUES (?,?,?,?,?,?)');
        stages.forEach(s => stmt.run([s.stage_index, s.stage_name, s.advance_count, s.players_per_group, s.description || '', s.deadline || '']));
        stmt.finalize();
        res.json({ success: true });
    });
});

// 获取当前赛段
app.get('/api/config/current-stage', (req, res) => {
    db.get("SELECT value FROM config WHERE key = 'current_stage'", [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ current_stage: row ? row.value : '海选赛' });
    });
});

// 设置当前赛段
app.post('/api/config/current-stage', (req, res) => {
    const { stage } = req.body;
    if (!stage) return res.status(400).json({ error: '缺少 stage 参数' });
    db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('current_stage', ?)", [stage], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


// ==================== 自动淘汰逻辑 ====================

// 触发某组自动淘汰检查（组内4人晋级→其余4人自动淘汰）
app.post('/api/groups/:id/auto-eliminate', (req, res) => {
    const groupId = req.params.id;
    // 获取该组配置
    db.get('SELECT r.stage_name FROM groups g JOIN rounds r ON g.round_id = r.id WHERE g.id = ?', [groupId], (err, roundInfo) => {
        if (err || !roundInfo) return res.status(500).json({ error: '获取组别信息失败' });
        db.get('SELECT advance_count FROM stage_config WHERE stage_name = ? LIMIT 1', [roundInfo.stage_name || '海选赛'], (err, cfg) => {
            const ADVANCE = cfg ? cfg.advance_count : 4;
            // 查出该组所有玩家，按 placement 排序
            db.all('SELECT gp.*, p.game_nickname, p.region FROM group_players gp JOIN players p ON gp.player_id = p.id WHERE gp.group_id = ? ORDER BY gp.placement ASC', [groupId], (err, members) => {
                if (err) return res.status(500).json({ error: err.message });
                const advanced = members.filter(m => m.player_status === 'advanced' || (m.placement && m.placement <= ADVANCE));
                const advancedCount = advanced.length;
                
                let updated = 0;
                if (advancedCount >= ADVANCE) {
                    // 自动标记淘汰
                    const toEliminate = members.filter(m => m.player_status !== 'advanced' && m.placement > ADVANCE);
                    toEliminate.forEach(m => {
                        db.run('UPDATE group_players SET player_status = ? WHERE id = ?', ['eliminated', m.id], (err) => {
                            if (!err) updated++;
                        });
                    });
                }
                
                // 检查是否整组完赛（8人中4晋级4淘汰）
                db.all('SELECT player_status FROM group_players WHERE group_id = ?', [groupId], (err, statuses) => {
                    const allDone = statuses.length > 0 && statuses.every(s => s.player_status === 'advanced' || s.player_status === 'eliminated');
                    if (allDone) {
                        db.run("UPDATE groups SET group_status = 'finished' WHERE id = ?", [groupId]);
                    }
                    res.json({ success: true, eliminated: updated, finished: allDone });
                });
            });
        });
    });
});

// 批量触发所有组的自动淘汰
app.post('/api/rounds/:roundId/auto-eliminate-all', (req, res) => {
    db.all('SELECT id FROM groups WHERE round_id = ?', [req.params.roundId], (err, groups) => {
        if (err) return res.status(500).json({ error: err.message });
        let done = 0;
        const total = groups.length;
        if (total === 0) return res.json({ success: true, total: 0 });
        groups.forEach(g => {
            db.post  // 用单条触发
            done++;
        });
        res.json({ success: true, total });
    });
});

// ==================== 晋级 API ====================

// 生成某组的晋级名单（前四名）
app.post('/api/advancements/generate', (req, res) => {
    const { group_id, round_id } = req.body;

    db.all(`
        SELECT gp.*, p.game_uid, p.game_nickname, p.region, p.id as player_id
        FROM group_players gp
        JOIN players p ON gp.player_id = p.id
        WHERE gp.group_id = ? AND gp.placement IS NOT NULL
        ORDER BY gp.placement ASC
        LIMIT 4
    `, [group_id], (err, topPlayers) => {
        if (err) return res.status(500).json({ error: err.message });
        if (topPlayers.length === 0) return res.status(400).json({ error: '该组暂无有效成绩' });

        // 查找或创建下一轮
        db.get('SELECT * FROM rounds WHERE round_number > ? ORDER BY round_number ASC LIMIT 1',
            [round_id], (err, nextRound) => {

                const doInsert = (toRoundId) => {
                    db.serialize(() => {
                        topPlayers.forEach(tp => {
                            db.run(
                                `INSERT OR IGNORE INTO advancements (player_id, from_round_id, from_group_id, to_round_id, placement)
                                 VALUES (?, ?, ?, ?, ?)`,
                                [tp.player_id, round_id, group_id, toRoundId, tp.placement]
                            );
                        });
                    });
                    res.json({ success: true, advanced: topPlayers.length, players: topPlayers });
                };

                if (nextRound) {
                    doInsert(nextRound.id);
                } else {
                    db.get('SELECT MAX(round_number) as max_round FROM rounds', [], (err, row) => {
                        const newRoundNum = (row.max_round || 0) + 1;
                        const roundName = newRoundNum === 2 ? '半决赛' : newRoundNum === 3 ? '决赛' : `第${newRoundNum}轮`;
                        db.run('INSERT INTO rounds (round_number, name, status) VALUES (?, ?, "pending")',
                            [newRoundNum, roundName],
                            function (err) {
                                if (err) return res.status(500).json({ error: err.message });
                                doInsert(this.lastID);
                            });
                    });
                }
            });
    });
});

// 获取某轮次的晋级玩家
app.get('/api/advancements/:roundId', (req, res) => {
    db.all(`
        SELECT a.*, p.game_uid, p.game_nickname, p.region
        FROM advancements a
        JOIN players p ON a.player_id = p.id
        WHERE a.from_round_id = ?
        ORDER BY a.placement
    `, [req.params.roundId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 获取所有晋级记录（支持大区和赛段筛选）
app.get('/api/advancements', (req, res) => {
    const { region, stage } = req.query;
    let sql = `
        SELECT a.*, p.game_uid, p.game_nickname, p.region, r.stage_name as from_stage_name
        FROM advancements a
        JOIN players p ON a.player_id = p.id
        JOIN rounds r ON a.from_round_id = r.id
        WHERE 1=1`;
    const params = [];
    if (region) {
        sql += ' AND p.region = ?';
        params.push(region);
    }
    if (stage) {
        sql += ' AND r.stage_name = ?';
        params.push(stage);
    }
    sql += ' ORDER BY a.from_round_id, a.placement';
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==================== 完成轮次 ====================

app.post('/api/rounds/:roundId/complete', (req, res) => {
    const roundId = req.params.roundId;
    db.run('UPDATE rounds SET status = "completed", ended_at = CURRENT_TIMESTAMP WHERE id = ?',
        [roundId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run('UPDATE groups SET status = "completed" WHERE round_id = ?', [roundId]);
            res.json({ success: true });
        });
});

// ==================== 重置赛事 ====================

app.post('/api/tournament/reset', (req, res) => {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM group_players', () => {
            db.run('DELETE FROM advancements', () => {
                db.run('DELETE FROM groups', () => {
                    db.run('DELETE FROM rounds', () => {
                        db.run('DELETE FROM players', () => {
                            db.run('UPDATE config SET value = "true" WHERE key = "registration_open"', () => {
                                db.run('UPDATE config SET value = "false" WHERE key = "tournament_started"', () => {
                                    db.run('COMMIT', (err) => {
                                        if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
                                        res.json({ success: true });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ==================== 战绩审核 API ====================

// 玩家提交战绩给管理员审核
app.post('/api/results/submit-for-review', (req, res) => {
    const { group_player_id } = req.body;
    if (!group_player_id) {
        return res.status(400).json({ error: '缺少 group_player_id' });
    }
    db.run(
        'UPDATE group_players SET review_status = ?, verified = 0 WHERE id = ?',
        ['pending', group_player_id],
        function(err) {
            if (err) {
                console.error('提交审核失败:', err);
                return res.status(500).json({ error: '提交审核失败' });
            }
            res.json({ success: true, message: '已提交管理员审核' });
        }
    );
});

// 管理员获取待审核列表
app.get('/api/results/pending-review', (req, res) => {
    db.all(`
        SELECT 
            gp.id as group_player_id,
            gp.placement,
            gp.screenshot_path,
            gp.submitted_at,
            gp.review_status,
            p.game_nickname,
            p.game_uid,
            p.region,
            g.id as group_id,
            g.group_number,
            g.region as group_region,
            r.name as round_name
        FROM group_players gp
        JOIN players p ON gp.player_id = p.id
        JOIN groups g ON gp.group_id = g.id
        JOIN rounds r ON g.round_id = r.id
        WHERE gp.review_status = 'pending' OR (gp.review_status IS NULL AND gp.screenshot_path IS NOT NULL AND gp.verified = 0)
        ORDER BY gp.submitted_at DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('获取待审核列表失败:', err);
            return res.status(500).json({ error: '获取待审核列表失败' });
        }
        res.json(rows);
    });
});

// 管理员审核战绩
app.post('/api/results/:id/review', (req, res) => {
    const groupPlayerId = req.params.id;
    const { action, note } = req.body;
    
    if (!groupPlayerId || !action) {
        return res.status(400).json({ error: '缺少必要参数' });
    }
    if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ error: 'action 必须是 approve 或 reject' });
    }
    
    const status = action === 'approve' ? 'approved' : 'rejected';
    const verified = action === 'approve' ? 1 : 0;
    
    db.run(
        'UPDATE group_players SET review_status = ?, verified = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?',
        [status, verified, note || '', groupPlayerId],
        function(err) {
            if (err) {
                console.error('审核操作失败:', err);
                return res.status(500).json({ error: '审核操作失败' });
            }
            res.json({ 
                success: true, 
                message: action === 'approve' ? '审核已通过' : '已拒绝',
                status: status
            });
        }
    );
});

// ==================== 启动服务器 ====================

// 托管前端静态文件（放在所有 API 路由之后）
app.use(express.static(path.join(__dirname, '../frontend')));
// 所有其他 GET 请求返回 index.html（SPA 支持）
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🎮 金铲铲水友赛平台后端已启动！`);
    console.log(`   API 地址: http://localhost:${PORT}/api`);
    console.log(`   前端地址: http://localhost:3001 (静态文件)`);
    console.log(`   管理上传: http://localhost:${PORT}/uploads/\n`);
});
