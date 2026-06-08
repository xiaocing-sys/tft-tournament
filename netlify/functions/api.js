// 金铲铲水友赛平台 - Netlify 独立函数（带实时时间戳）
// 版本：20250608-v11（时间戳：CHECK-TIMESTAMP）

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// 数据库
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 包装 pg
const db = {
    get(sql, params, cb) {
        if (typeof params === 'function') { cb = params; params = []; }
        pool.query(sql.replace(/\?/g, (_, i) => `$${i+1}`), params || [], (err, res) => {
            if (cb) cb(err, res ? res.rows[0] || null : null);
        });
    },
    all(sql, params, cb) {
        if (typeof params === 'function') { cb = params; params = []; }
        pool.query(sql.replace(/\?/g, (_, i) => `$${i+1}`), params || [], (err, res) => {
            if (cb) cb(err, res ? res.rows : []);
        });
    },
    run(sql, params, cb) {
        if (typeof params === 'function') { cb = params; params = []; }
        pool.query(sql.replace(/\?/g, (_, i) => `$${i+1}`), params || [], (err, res) => {
            if (cb) cb(err, { lastID: res && res.rows && res.rows[0] ? res.rows[0].id : 0, changes: res ? res.rowCount : 0 });
        });
    }
};

// API 端点

// 获取统计数据（实时查询数据库）
app.get('/api/stats', (req, res) => {
    const stats = { qq_count: 0, wx_count: 0, total: 0, timestamp: new Date().toISOString() };
    db.get('SELECT COUNT(*) as count FROM players WHERE region = $1', ['QQ'], (err, row) => {
        if (!err && row) stats.qq_count = row.count;
        db.get('SELECT COUNT(*) as count FROM players WHERE region = $1', ['WeChat'], (err, row) => {
            if (!err && row) stats.wx_count = row.count;
            stats.total = stats.qq_count + stats.wx_count;
            res.json(stats);
        });
    });
});

// 报名接口
app.post('/api/register', (req, res) => {
    const { game_uid, game_nickname, region, contact } = req.body;
    if (!game_uid || !game_nickname || !region || !contact) {
        return res.status(400).json({ error: '缺少必填字段' });
    }
    db.get('SELECT id FROM players WHERE game_uid = $1 AND region = $2', [game_uid, region], (err, row) => {
        if (row) return res.status(400).json({ error: '该游戏UID已报名' });
        db.run(
            'INSERT INTO players (game_uid, game_nickname, region, contact, registration_time, season_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [game_uid, game_nickname, region, contact, new Date().toISOString(), 1],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, player_id: this.lastID });
            }
        );
    });
});

// 默认路由
app.get('*', (req, res) => {
    res.send('金铲铲水友赛平台 API - 版本 20250608-v11（时间戳：' + new Date().toISOString() + ')');
});

// 导出 handler
const serverless = require('serverless-http');
let cachedHandler = null;

exports.handler = async (event, context) => {
    if (!cachedHandler) {
        cachedHandler = serverless(app, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
    return await cachedHandler(event, context);
};
