/**
 * 批量随机注册玩家脚本
 * 用法：node batch_register.js [QQ人数] [微信人数]
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'tft_season.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const PREFIX = ['云顶','铲铲','星辰','雷霆','火焰','冰霜','暗影','光明','风暴','烈焰','寒冰','影流','无极','剑圣','魔导师','龙王','凤凰','骑士','刺客','法师','银河','虚空','极地','帝国','忍者','海盗','剑士','换形','贵族','野性'];
const SUFFIX = ['之刃','之心','传说','王者','战神','达人','高手','新秀','老将','新锐','之星','先锋','守护者','猎手','使者','之王','夫人','公子','小侠',''];
const MID    = ['','丶','_','·','选手','Pro','大师',''];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeName(used) {
    let name, t = 0;
    do {
        name = rand(PREFIX) + rand(MID) + rand(SUFFIX);
        if (name.length > 14) name = name.slice(0, 12);
        t++;
    } while (used.has(name) && t < 1000);
    used.add(name);
    return name;
}

function makeUid(existing) {
    let uid;
    do {
        const len = 8 + Math.floor(Math.random() * 3);
        uid = (1 + Math.floor(Math.random() * 9)).toString();
        for (let i = 1; i < len; i++) uid += Math.floor(Math.random() * 10);
    } while (existing.has(uid));
    return uid;
}

function runAsync(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params || [], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getAsync(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params || [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allAsync(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params || [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// 初始化数据库（执行 schema.sql）
function initDB(db) {
    return new Promise((resolve) => {
        if (!fs.existsSync(SCHEMA_PATH)) {
            console.log('  schema.sql 不存在，跳过');
            return resolve();
        }
        const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
        // 按分号分割，过滤空语句
        const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        let done = 0;
        stmts.forEach(stmt => {
            db.run(stmt, (err) => {
                if (err && !err.message.includes('already exists')) {
                    console.error('建表警告:', err.message);
                }
                done++;
                if (done >= stmts.length) resolve();
            });
        });
        // 超时保护
        setTimeout(resolve, 3000);
    });
}

async function main() {
    const args = process.argv.slice(2);
    const qqN = parseInt(args[0]) || 80;
    const wxN = parseInt(args[1]) || 80;

    console.log('==========');
    console.log('金铲铲水友赛 - 批量注册');
    console.log('==========');
    console.log(`目标：QQ ${qqN} 人，微信 ${wxN} 人`);
    console.log('');

    const db = new sqlite3.Database(DB_PATH);

    // 初始化表结构
    console.log('[1/5] 初始化数据库表结构...');
    await initDB(db);
    console.log('  完成');
    console.log('');

    // 迁移：添加 season_id 列（如果不存在）
    console.log('[2/5] 检查字段迁移...');
    await new Promise(resolve => {
        db.all("PRAGMA table_info(players)", (err, cols) => {
            if (!err && cols) {
                const has = cols.some(c => c.name === 'season_id');
                if (!has) {
                    db.run("ALTER TABLE players ADD COLUMN season_id INTEGER DEFAULT 1", () => resolve());
                } else {
                    resolve();
                }
            } else {
                resolve();
            }
        });
    });
    await new Promise(resolve => {
        db.all("PRAGMA table_info(rounds)", (err, cols) => {
            if (!err && cols) {
                const has = cols.some(c => c.name === 'season_id');
                if (!has) {
                    db.run("ALTER TABLE rounds ADD COLUMN season_id INTEGER DEFAULT 1", () => resolve());
                } else {
                    resolve();
                }
            } else {
                resolve();
            }
        });
    });
    console.log('  完成');
    console.log('');

    // 获取/创建赛季
    console.log('[3/5] 检查活跃赛季...');
    let season = await getAsync(db, "SELECT * FROM seasons WHERE status = ? ORDER BY id DESC LIMIT 1", ['active']);
    if (!season) {
        const info = await getAsync(db, "SELECT id FROM seasons WHERE name = ?", ['2026夏季赛']);
        if (info) {
            season = info;
        } else {
            const r = await runAsync(db, "INSERT INTO seasons (name, description, status) VALUES (?, ?, ?)", ['2026夏季赛', '自动创建', 'active']);
            season = { id: r.lastID };
        }
    }
    const seasonId = season.id;
    console.log(`  赛季 ID: ${seasonId}`);
    console.log('');

    // 已有 uid 去重
    console.log('[4/5] 读取已有账号...');
    const rows = await allAsync(db, "SELECT game_uid FROM players");
    const existingUids = new Set(rows.map(r => r.game_uid));
    console.log(`  已有 ${existingUids.size} 人`);
    console.log('');

    // 生成随机数据
    console.log('[5/5] 生成并写入随机数据...');
    const usedNames = new Set();
    const newUids = new Set();
    const players = [];

    // QQ 大区
    while (players.filter(p => p.region === 'QQ').length < qqN) {
        const uid = makeUid(existingUids);
        if (newUids.has(uid)) continue;
        newUids.add(uid);
        existingUids.add(uid);
        players.push({
            game_uid: uid,
            game_nickname: makeName(usedNames),
            region: 'QQ',
            contact: Math.random() > 0.3 ? (1e8 + Math.floor(Math.random() * 9e8)).toString() : '',
            award_qq: (1e8 + Math.floor(Math.random() * 9e8)).toString(),
            season_id: seasonId
        });
    }

    // 微信大区
    while (players.filter(p => p.region === 'WeChat').length < wxN) {
        const uid = makeUid(existingUids);
        if (newUids.has(uid)) continue;
        newUids.add(uid);
        existingUids.add(uid);
        players.push({
            game_uid: uid,
            game_nickname: makeName(usedNames),
            region: 'WeChat',
            contact: Math.random() > 0.3 ? 'wx_' + Math.random().toString(36).slice(2, 12) : '',
            award_qq: (1e8 + Math.floor(Math.random() * 9e8)).toString(),
            season_id: seasonId
        });
    }

    console.log(`  已生成 ${players.length} 条，开始写入...`);

    // 写入数据库
    await runAsync(db, "PRAGMA journal_mode = WAL");
    await runAsync(db, "PRAGMA synchronous = NORMAL");

    let inserted = 0;
    const t0 = Date.now();

    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        try {
            await runAsync(db,
                "INSERT OR IGNORE INTO players (game_uid, game_nickname, region, contact, award_qq, season_id) VALUES (?, ?, ?, ?, ?, ?)",
                [p.game_uid, p.game_nickname, p.region, p.contact, p.award_qq, p.season_id]
            );
            inserted++;
        } catch (e) {}
        if ((i + 1) % 20 === 0) {
            process.stdout.write(`\r  进度: ${i + 1}/${players.length}  已插入:${inserted}`);
        }
    }
    const ms = Date.now() - t0;
    console.log('');
    console.log(`  写入完成！新增 ${inserted} 人，耗时 ${ms}ms`);
    console.log('');

    // 验证
    console.log('==========');
    console.log('结果验证');
    console.log('==========');
    const qCnt = (await getAsync(db, "SELECT COUNT(*) c FROM players WHERE region = ? AND season_id = ?", ['QQ', seasonId])).c;
    const wCnt = (await getAsync(db, "SELECT COUNT(*) c FROM players WHERE region = ? AND season_id = ?", ['WeChat', seasonId])).c;
    const tCnt = (await getAsync(db, "SELECT COUNT(*) c FROM players WHERE season_id = ?", [seasonId])).c;
    console.log(`QQ大区:   ${qCnt} 人`);
    console.log(`微信大区: ${wCnt} 人`);
    console.log(`总计:     ${tCnt} 人（赛季 ${seasonId}）`);
    console.log('==========');
    console.log('');
    console.log('下一步：打开 http://localhost:3001/');
    console.log('       管理员登录 → 管理后台 → 随机分组');
    console.log('');

    db.close();
}

main().catch(err => {
    console.error('脚本执行失败:', err);
    process.exit(1);
});
