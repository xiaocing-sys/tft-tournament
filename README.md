# 金铲铲水友赛平台 - 使用说明

## 启动方式

```bash
# 终端启动
node C:\Users\echojjjli\WorkBuddy\2026-06-05-16-45-39\tft-tournament\backend\server.js

# 访问地址
http://localhost:3001/
```

## 端口

- 后端 API：`http://localhost:3001/api`
- 前端页面：`http://localhost:3001/`
- 截图上传目录：`C:\Users\echojjjli\WorkBuddy\2026-06-05-16-45-39\tft-tournament\backend\uploads\`

## 赛事操作流程

1. 管理后台 → 开启报名
2. 玩家通过"报名参赛"页报名（游戏ID、昵称、大区）
3. 报名截止后，管理后台 → 随机分组（8人一组）
4. 玩家通过"战绩上传"页上传截图 + 名次
5. 管理后台 → 生成晋级名单（每组前四自动晋级）
6. 重复4-5步，直到决出最终八强

## 文件结构

```
tft-tournament/
├── backend/
│   ├── server.js      # 后端服务（Express + SQLite）
│   ├── package.json
│   ├── schema.sql    # 数据库结构
│   └── uploads/      # 截图存储目录
└── frontend/
    ├── index.html    # 主页面（单页应用）
    └── app.js        # 前端逻辑
```

## 注意事项

- OCR 验证功能需要截图中的游戏ID清晰可见，识别率取决于截图质量
- 如遇端口占用，修改 server.js 中的 PORT 变量
- 数据库文件：`backend/tournament.db`，可备份此文件保存赛事数据
