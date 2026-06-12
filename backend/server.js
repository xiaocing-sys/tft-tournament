const path = require('path');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const http = require('http');
const cookieParser = require('cookie-parser');

console.log('[Server] server.js 开始加载，时间:', new Date().toISOString());
const loadStart = Date.now();

// ==================== 本地 OCR 服务配置 ====================
// 通过环境变量配置本地 OCR 服务的公网地址（由 localtunnel 提供）
const LOCAL_OCR_URL = process.env.LOCAL_OCR_URL || '';

// 调用本地 OCR 服务识别截图中的名次
async function callLocalOCR(imageUrl) {
    if (!LOCAL_OCR_URL) {
        throw new Error('本地 OCR 服务未配置（请设置 LOCAL_OCR_URL 环境变量）');
    }
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ image_url: imageUrl });
        const url = new URL('/ocr', LOCAL_OCR_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        const protocol = url.protocol === 'https:' ? https : http;
        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.success) resolve(json.raw_text || '');
                    else reject(new Error(json.error || '本地 OCR 识别失败'));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== 管理员登录配置 ====================
// 支持3个管理员账号，密码通过环境变量或默认值配置
const ADMIN_PASSWORDS = [
    process.env.ADMIN_PASSWORD_1 || 'admin123',
    process.env.ADMIN_PASSWORD_2 || 'admin456',
    process.env.ADMIN_PASSWORD_3 || 'admin789'
];
app.use(cookieParser());

// 验证管理员登录状态的中间件
function requireAdmin(req, res, next) {
    const token = req.cookies && req.cookies.admin_token;
    if (token && token.startsWith('admin_auth_')) {
        return next(); // 已登录
    }
    // 未登录，返回 401
    const url = req.originalUrl || req.path || '';
    if (url.startsWith('/api/')) {
        return res.status(401).json({ success: false, error: '未登录' });
    }
    res.redirect('/login.html');
}

// ==================== 数据库适配（SQLite 本地 / PostgreSQL Netlify）====================
let db = null;
let dbMode = 'sqlite';
let pool = null;  // 提升到模块级作用域，供 PostgreSQL schema 初始化使用

if (process.env.DATABASE_URL) {
    // Netlify / 生产环境：使用 PostgreSQL
    console.log('[DB] 检测到 DATABASE_URL，准备连接 PostgreSQL...');
    dbMode = 'pg';
    
    // 延迟加载 pg 模块，避免模块加载时耗时过长
    let pgPool = null;
    function getPgPool() {
        if (!pgPool) {
            const dbStart = Date.now();
            try {
                const { Pool } = require('pg');
                console.log('[DB] pg 模块延迟加载成功，耗时:', Date.now() - dbStart, 'ms');
                pgPool = new Pool({
                    connectionString: process.env.DATABASE_URL,
                    ssl: { rejectUnauthorized: false }
                });
                pool = pgPool;  // 同时设置模块级变量，供 schema 初始化使用
                console.log('[DB] Pool 延迟创建成功，耗时:', Date.now() - dbStart, 'ms');
            } catch (e) {
                console.error('[DB] ❌ PostgreSQL 延迟初始化失败:', e.message);
                dbMode = 'error';
                throw e;
            }
        }
        return pgPool;
    }

    // 包装 pg 为类 sqlite3 接口（延迟初始化 Pool）
    console.log('[DB] 开始包装 pg 接口...');
    db = {
        _pgExec(sql, params, cb) {
            const p = getPgPool();
            // 转换 ? 占位符为 $1, $2...
            let idx = 0;
            const fixedSql = sql.replace(/\?/g, () => `$${++idx}`);
            p.query(fixedSql, params || [], (err, res) => {
                if (cb) cb(err, res);
            });
        },
        all(sql, params, cb) {
            if (typeof params === 'function') { cb = params; params = []; }
            this._pgExec(sql, params, (err, res) => {
                if (cb) cb(err, res ? res.rows : []);
            });
        },
        get(sql, params, cb) {
            if (typeof params === 'function') { cb = params; params = []; }
            this._pgExec(sql, params, (err, res) => {
                if (cb) cb(err, res ? res.rows[0] || null : null);
            });
        },
        run(sql, params, cb) {
            if (typeof params === 'function') { cb = params; params = []; }
            this._pgExec(sql, params, (err, res) => {
                if (cb) cb(err, { lastID: res && res.rows && res.rows[0] ? res.rows[0].id : 0, changes: res ? res.rowCount : 0 });
            });
        },
        serialize(cb) { if (cb) cb(); },
        close(cb) { 
            const p = getPgPool(); 
            p.end().then(() => { if (cb) cb(); }); 
        }
    };
    console.log('[DB] pg 接口包装完成');
} else if (process.env.VERCEL) {
    // Vercel 环境但没有 DATABASE_URL：给出明确错误
    console.error('[DB] ❌ Vercel 环境但未设置 DATABASE_URL 环境变量！');
    console.error('[DB] 请在 Vercel 控制台设置 DATABASE_URL (Neon PostgreSQL)');
    dbMode = 'error';
    db = null;
} else {
    // 本地开发：使用 SQLite（使用 eval 避免 Vercel 构建时静态分析到 sqlite3）
    console.log('[DB] 本地开发模式，准备加载 SQLite...');
    try {
        const sqlite3 = eval("require('sqlite3')").verbose();
        console.log('[DB] sqlite3 模块加载成功');
        const DB_PATH = path.join(__dirname, 'tournament.db');
        const UPLOADS_DIR = path.join(__dirname, 'uploads');
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) console.error('[DB] SQLite 连接失败:', err);
            else console.log('[DB] 使用 SQLite 模式（本地开发）');
        });
        app.use('/uploads', express.static(UPLOADS_DIR));
    } catch (e) {
        console.error('[DB] SQLite 加载失败:', e.message);
        dbMode = 'error';
        db = null;
    }
}

app.use(cors());
app.use(express.json());

// ==================== 健康检查 API（不依赖数据库）====================
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API 正常工作',
        dbMode: dbMode,
        timestamp: new Date().toISOString()
    });
});

// ==================== Vercel 路径修复中间件 ====================
// Vercel 路由 /api/* 到 api/index.js 时，可能会去掉 /api 前缀
// 这个中间件在 Vercel 环境下自动修复路径
if (process.env.VERCEL) {
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api/')) {
            req.url = '/api' + req.url;
            req.path = '/api' + req.path;
            console.log('[Vercel] 路径已修复:', req.url);
        }
        next();
    });
    console.log('[Vercel] 路径修复中间件已启用');
}
// ==================== 管理员登录 API ====================
app.post('/api/admin/login', (req, res) => {
    console.log('[登录] 收到登录请求');
    const { password } = req.body;
    console.log('[登录] 密码长度:', password ? password.length : 0);
    
    const idx = ADMIN_PASSWORDS.indexOf(password);
    console.log('[登录] 密码匹配索引:', idx);
    
    if (idx !== -1) {
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        console.log('[登录] 登录成功，设置 cookie，secure:', isSecure);
        res.cookie('admin_token', 'admin_auth_' + idx + '_' + Date.now(), { 
            httpOnly: true, 
            maxAge: 7*24*60*60*1000,
            secure: isSecure,
            sameSite: isSecure ? 'none' : 'lax'
        });
        res.json({ success: true, adminIndex: idx + 1 });
    } else {
        console.log('[登录] 密码错误');
        res.status(401).json({ success: false, error: '密码错误' });
    }
});
app.post('/api/admin/logout', (req, res) => { 
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('admin_token', { secure: isSecure, sameSite: isSecure ? 'none' : 'lax' }); 
    res.json({ success: true }); 
});
app.get('/api/admin/check', (req, res) => {
    const token = req.cookies && req.cookies.admin_token;
    const loggedIn = token && token.startsWith('admin_auth_');
    let adminIndex = null;
    if (loggedIn) {
        const parts = token.split('_');
        adminIndex = parts[2] ? parseInt(parts[2]) + 1 : 1;
    }
    res.json({ success: true, loggedIn, adminIndex });
});

// 对所有管理 API 应用认证（除了登录相关和公开读取接口）
app.use('/api', (req, res, next) => {
    if (req.path === '/admin/login' || req.path === '/admin/check' || req.path === '/admin/logout') {
        return next(); // 登录相关接口不需要认证
    }
    // 公开读取接口不需要认证
    const publicPaths = [
        '/players',
        '/players/stats',
        '/players/count',
        '/players/search',
        '/seasons',
        '/rounds',
        '/groups',
    ];
    const isPublic = req.method === 'GET' && publicPaths.some(p => req.path.startsWith(p));
    if (isPublic) {
        return next();
    }
    requireAdmin(req, res, next);
});

// 对所有页面应用认证（除了登录页面和公开接口）
app.use((req, res, next) => {
    if (req.path === '/login.html' || req.path === '/api/admin/login' || req.path === '/api/admin/check') {
        return next();
    }
    // 公开读取接口不需要认证
    const publicPaths = [
        '/players',
        '/players/stats',
        '/players/count',
        '/players/search',
        '/seasons',
        '/rounds',
        '/groups',
    ];
    const isPublic = req.method === 'GET' && publicPaths.some(p => req.path.startsWith(p));
    if (isPublic) {
        return next();
    }
    requireAdmin(req, res, next);
});

// ==================== CSV 导入工具 ====================
function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cells = [];
        let cell = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if (ch === '"') {
                if (inQuotes && line[j + 1] === '"') {
                    cell += '"';
                    j++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                cells.push(cell.trim());
                cell = '';
            } else {
                cell += ch;
            }
        }
        cells.push(cell.trim());
        rows.push(cells);
    }
    return rows;
}

// ==================== 管理员 CSV 批量导入 API ====================

// 导入玩家 CSV
// CSV 格式（支持表头行）：game_uid, game_nickname, region, contact
app.post('/api/admin/import/players', (req, res) => {
    const { csv, season_id = 1 } = req.body;
    if (!csv || typeof csv !== 'string') {
        return res.status(400).json({ success: false, error: '请提供 CSV 内容' });
    }

    const rows = parseCSV(csv);
    if (rows.length === 0) {
        return res.status(400).json({ success: false, error: 'CSV 内容为空' });
    }

    // 判断第一行是否为表头
    const first = rows[0];
    const hasHeader = first.some(c => /game_uid|昵称|大区|联系方式|uid|nick|region|contact/i.test(c));
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const imported = [];
    const errors = [];
    let pending = dataRows.length;
    if (pending === 0) return res.json({ success: true, imported: 0, errors: ['没有数据行'] });

    dataRows.forEach((row, idx) => {
        const [game_uid, game_nickname, region, contact] = row;
        if (!game_uid || !game_nickname) {
            errors.push(`第 ${idx + 1} 行缺少必要字段`);
            pending--;
            if (pending === 0) finish();
            return;
        }
        const cleanRegion = (region || 'QQ').trim();
        const validRegion = ['QQ', 'WeChat'].includes(cleanRegion) ? cleanRegion : 'QQ';
        db.run(
            `INSERT OR REPLACE INTO players (game_uid, game_nickname, region, contact, season_id) VALUES (?, ?, ?, ?, ?)`,
            [game_uid.trim(), game_nickname.trim(), validRegion, (contact || '').trim(), season_id],
            (err) => {
                if (err) errors.push(`第 ${idx + 1} 行导入失败: ${err.message}`);
                else imported.push({ game_uid, game_nickname, region: validRegion, contact });
                pending--;
                if (pending === 0) finish();
            }
        );
    });

    function finish() {
        res.json({ success: true, importedCount: imported.length, errorCount: errors.length, errors: errors.slice(0, 10) });
    }
});

// 导入战绩 CSV
// CSV 格式（支持表头行）：contact(qq_number), round_number, ranking(placement)
app.post('/api/admin/import/results', (req, res) => {
    const { csv, round_id } = req.body;
    if (!csv || typeof csv !== 'string') {
        return res.status(400).json({ success: false, error: '请提供 CSV 内容' });
    }
    if (!round_id) {
        return res.status(400).json({ success: false, error: '请提供 round_id（轮次ID）' });
    }

    const rows = parseCSV(csv);
    if (rows.length === 0) {
        return res.status(400).json({ success: false, error: 'CSV 内容为空' });
    }

    const first = rows[0];
    const hasHeader = first.some(c => /qq|contact|轮次|round|名次|排名|ranking|placement/i.test(c));
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // 先获取该轮次的所有 group_players，建立 contact -> group_player_id 映射
    db.all(`
        SELECT gp.id as gp_id, p.contact, p.game_uid, gp.group_id
        FROM group_players gp
        JOIN players p ON gp.player_id = p.id
        JOIN groups g ON gp.group_id = g.id
        WHERE g.round_id = ?
    `, [round_id], (err, gpRows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const contactMap = {};
        gpRows.forEach(r => {
            const key = (r.contact || r.game_uid || '').trim();
            if (key) contactMap[key] = r.gp_id;
        });

        const imported = [];
        const errors = [];
        let pending = dataRows.length;
        if (pending === 0) return res.json({ success: true, imported: 0, errors: ['没有数据行'] });

        dataRows.forEach((row, idx) => {
            const [contactOrUid, roundNumStr, rankingStr] = row;
            const lookup = (contactOrUid || '').trim();
            const placement = parseInt(rankingStr, 10);
            if (!lookup || isNaN(placement) || placement < 1 || placement > 8) {
                errors.push(`第 ${idx + 1} 行数据无效: ${row.join(',')}`);
                pending--;
                if (pending === 0) finish();
                return;
            }
            const gpId = contactMap[lookup];
            if (!gpId) {
                errors.push(`第 ${idx + 1} 行找不到对应玩家: ${lookup}`);
                pending--;
                if (pending === 0) finish();
                return;
            }
            db.run(
                `UPDATE group_players SET placement = ?, submitted = 1, submitted_at = ? WHERE id = ?`,
                [placement, new Date().toISOString(), gpId],
                (err) => {
                    if (err) errors.push(`第 ${idx + 1} 行更新失败: ${err.message}`);
                    else imported.push({ contact: lookup, placement });
                    pending--;
                    if (pending === 0) finish();
                }
            );
        });

        function finish() {
            res.json({ success: true, importedCount: imported.length, errorCount: errors.length, errors: errors.slice(0, 10) });
        }
    });
});

// 初始化数据库（改为异步，不阻塞模块加载）
if (dbMode === 'sqlite') {
    db.serialize(() => {
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            db.exec(schema, (err) => {
                if (err) console.error('Schema 初始化失败:', err);
                else console.log('数据库 Schema 初始化完成');
                migrateSeasons();
            });
        }
    });
} else if (dbMode === 'pg' && pool) {
    // 异步执行 PostgreSQL schema 初始化，不阻塞请求处理
    setTimeout(() => {
        console.log('[DB] 异步开始 PostgreSQL 数据库表初始化...');
        const schemaStart = Date.now();
        const schemaPath = path.join(__dirname, 'schema-postgres.sql');
        if (fs.existsSync(schemaPath)) {
            console.log('[DB] 找到 schema-postgres.sql，开始读取...');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            console.log('[DB] schema 文件读取完成，大小:', schema.length, '字节');
            const statements = schema.split(';').filter(s => s.trim());
            console.log('[DB] 共', statements.length, '条 SQL 语句');
            let completed = 0;
            let errorCount = 0;
            statements.forEach((stmt, idx) => {
                pool.query(stmt, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        errorCount++;
                        console.error('执行 schema 语句失败:', err.message);
                    }
                    completed++;
                    if (completed === statements.length) {
                        console.log('[DB] PostgreSQL 数据库表初始化完成，耗时:', Date.now() - schemaStart, 'ms，错误数:', errorCount);
                    }
                });
            });
        } else {
            console.log('[DB] 未找到 schema-postgres.sql，跳过自动初始化');
        }
    }, 0);
    console.log('[DB] PostgreSQL schema 初始化已加入异步队列');
} else {
    console.log('[DB] 数据库模式为 ' + dbMode + '，跳过 schema 初始化');
}

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

// ==================== 玩家管理 API ====================
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

// 获取单个分组详情（含玩家）
app.get('/api/groups/detail/:groupId', (req, res) => {
    const groupId = req.params.groupId;
    db.get(`
        SELECT g.*, COUNT(gp.id) as player_count
        FROM groups g
        LEFT JOIN group_players gp ON g.id = gp.group_id
        WHERE g.id = ?
        GROUP BY g.id
    `, [groupId], (err, group) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!group) return res.status(404).json({ error: '分组不存在' });
        db.all(`
            SELECT gp.*, p.game_uid, p.game_nickname, p.region, p.contact
            FROM group_players gp
            JOIN players p ON gp.player_id = p.id
            WHERE gp.group_id = ?
            ORDER BY gp.placement IS NULL, gp.placement ASC
        `, [groupId], (err, players) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ...group, players });
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

// ==================== 战绩上传（接受截图 URL）====================

// 上传战绩（包含截图 URL）
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

// ==================== 管理员手动设置状态 ====================

// 管理员手动切换验证状态
app.post('/api/admin/group-players/:id/verify', (req, res) => {
    const groupPlayerId = req.params.id;
    if (!groupPlayerId) {
        return res.status(400).json({ error: '缺少 group_player_id' });
    }
    db.get('SELECT verified FROM group_players WHERE id = ?', [groupPlayerId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: '记录不存在' });
        const newVerified = row.verified ? 0 : 1;
        db.run('UPDATE group_players SET verified = ? WHERE id = ?', [newVerified, groupPlayerId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, verified: newVerified, message: newVerified ? '已标记为已验证' : '已标记为未验证' });
        });
    });
});

// 管理员修改名次和晋级状态
app.post('/api/admin/group-players/:id/status', (req, res) => {
    const groupPlayerId = req.params.id;
    const { placement, player_status } = req.body;
    if (!groupPlayerId) {
        return res.status(400).json({ error: '缺少 group_player_id' });
    }

    // 构建更新字段
    const fields = [];
    const values = [];

    if (placement !== undefined && placement !== null && placement !== '') {
        fields.push('placement = ?');
        values.push(parseInt(placement));
    }
    if (player_status) {
        fields.push('player_status = ?');
        values.push(player_status);
    }

    if (fields.length === 0) {
        return res.status(400).json({ error: '至少提供一个要修改的字段（placement 或 player_status）' });
    }

    values.push(groupPlayerId);

    db.run(`UPDATE group_players SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: '状态已更新' });
    });
});

// ==================== 启动服务器（兼容本地和 Vercel）====================

// 托管前端静态文件（仅本地开发时启用，Vercel 会自动处理静态文件）
if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, '../public')));
    // 所有其他 GET 请求返回 index.html（SPA 支持）
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });
}

// Vercel Serverless Functions 导出（必须在 listen 之前）
console.log('[Server] server.js 加载完成，总耗时:', Date.now() - loadStart, 'ms');
if (typeof module !== 'undefined' && module.exports) {
    module.exports = app;  // 导出 app，供 api/index.js 使用
}

// 本地开发时启动服务器
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🎮 金铲铲水友赛平台后端已启动！`);
        console.log(`   API 地址: http://localhost:${PORT}/api`);
        console.log(`   前端地址: http://localhost:3001 (静态文件)`);
        console.log(`   管理上传: http://localhost:${PORT}/uploads/\n`);
    });
}
