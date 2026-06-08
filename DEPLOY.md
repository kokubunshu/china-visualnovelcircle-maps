# VNFest 地图 — 服务器部署教程

> 适用环境：宝塔 Linux 面板 / Apache + PHP 8.x + MySQL

---

## 一、你需要了解的项目结构

```
项目根目录/
├── index.html              ← 入口页面（必须上传）
├── config.php              ← 配置文件（自行创建，不在 git 中）
├── deploy.sh               ← 部署脚本（见第五节）
├── .htaccess               ← Apache 规则（必须上传）
│
├── api/                    ← PHP 后端接口（全部上传）
├── includes/               ← PHP 核心库（全部上传）
├── admin/                  ← 管理后台页面（全部上传）
│
├── css/                    ← 样式文件（全部上传）
├── js/                     ← JavaScript（全部上传）
├── images/                 ← 图片资源（全部上传）
│
├── Galgame_events/         ← GalOnly 活动页面（全部上传）
├── moe/                    ← 萌战相关页面（全部上传）
├── wiki/                   ← Wiki 系统（全部上传）
│
├── data/                   ← ★ 运行时数据（不同步 git）
│   ├── clubs.json          ←   同好会数据（中国）
│   ├── clubs_japan.json    ←   同好会数据（日本）
│   ├── submissions.json    ←   用户提交
│   ├── publications.json   ←   出版物
│   ├── events.json         ←   活动
│   └── ...                 ←   其他 JSON 数据
│
├── uploads/                ← ★ 用户上传文件（不同步 git）
└── scripts/                ← 工具脚本（视需要上传）
```

**关键区别：**

| 类别 | 在 git 中？ | 部署方式 |
|------|------------|---------|
| HTML/CSS/JS/PHP | ✅ 是 | `git pull` 即可 |
| `config.php` | ❌ 否 | 首次手动创建，之后不动 |
| `data/*.json` | ❌ 否 | 用 `sync-data.sh` 同步或用备份恢复 |
| `uploads/` 里的图片 | ❌ 否 | 用 `sync-data.sh` 同步或用备份恢复 |

---

## 二、首次部署（第一次把网站跑起来）

### 第 1 步：在宝塔创建网站

1. 登录宝塔面板
2. 左侧「网站」→「添加站点」
3. 填入你的域名（例如 `map.vnfest.top`）
4. 运行环境选择 **PHP 8.x**
5. 创建后记下网站根目录路径，例如 `/www/wwwroot/map.vnfest.top`

### 第 2 步：上传代码

**方法 A（推荐）— 直接用 Git 克隆：**

```bash
# SSH 登录服务器
ssh root@你的服务器IP

# 进入网站目录
cd /www/wwwroot/map.vnfest.top

# 克隆代码
git clone https://github.com/kokubunshu/china-visualnovelcircle-maps.git .

# 切换到 main 分支
git checkout main
```

**方法 B — 通过宝塔面板上传：**

1. 在宝塔「文件」中进入网站根目录
2. 上传从 GitHub 下载的压缩包
3. 解压到当前目录

### 第 3 步：创建配置文件

```bash
# 复制配置模板
cp config.example.php config.php
```

然后编辑 `config.php`，修改以下关键项：

```php
define('ADMIN_TOKEN', '设置一个管理员密码');     // 审核后台用
define('BOT_API_KEY', '设置一个机器人密钥');       // AstrBot 用
define('SITE_URL', 'https://你的域名.com');         // 网站地址

// 数据库配置（宝塔里先创建好 MySQL 数据库）
define('DB_DRIVER', 'mysql');
define('DB_NAME', '数据库名');
define('DB_USER', '数据库用户名');
define('DB_PASS', '数据库密码');
```

> 💡 宝塔操作路径：左侧「数据库」→「添加数据库」，记下生成的名称、用户、密码。

### 第 4 步：运行数据库迁移

```bash
php scripts/migrate.php
```

这条命令会自动创建所有需要的表（用户、同好会、萌战、投票等 20+ 张表），重复运行也安全。

### 第 5 步：准备数据文件

`data/` 目录下需要以下核心 JSON 文件（这些不在 git 中，需要用其他方式获取）：

- **全新安装**：确保 `data/` 目录存在且 PHP 可写，部分文件会由程序自动初始化
- **从旧服务器迁移**：将旧服务器 `data/*.json` 复制过来
- **本地开发同步**：参考第六节的同步方法

### 第 6 步：设置目录权限

```bash
# 宝塔网站目录通常属主为 www
chown -R www:www /www/wwwroot/map.vnfest.top/data
chown -R www:www /www/wwwroot/map.vnfest.top/uploads
chmod -R 755 /www/wwwroot/map.vnfest.top/data
chmod -R 755 /www/wwwroot/map.vnfest.top/uploads

# 配置文件保密
chmod 640 /www/wwwroot/map.vnfest.top/config.php
```

或者在宝塔面板「文件」中右键目录 → 权限 → 设为 `755`，所有者设为 `www`。

### 第 7 步：验证

访问 `https://你的域名/api/health.php`，应该返回：

```json
{ "status": "ok", "checks": { "database": "connected", ... } }
```

访问 `https://你的域名/` 看到地图首页即部署成功。

---

## 三、日常更新（版本升级）

当本地开发完成、推送到 GitHub 后，登录服务器执行：

```bash
# 进入网站目录
cd /www/wwwroot/map.vnfest.top

# 拉取最新代码
git pull origin main

# 运行数据库迁移（如果本次更新有新增表）
php scripts/migrate.php

# 重启 PHP 让 OPcache 清空
# 宝塔面板：左侧「服务」→ 重启 PHP
```

### 用 deploy.sh 一键部署

如果配置了 `deploy-config.sh`：

```bash
# 1. 复制模板并编辑
cp deploy-config.example.sh deploy-config.sh
# 编辑 deploy-config.sh 填入你的服务器路径

# 2. 一键部署
./scripts/deploy.sh

# 带备份的部署（推荐）
./scripts/deploy.sh          # 完整部署（含备份）
./scripts/deploy.sh -s       # 跳过备份
./scripts/deploy.sh -n       # 干跑预览
```

`deploy.sh` 会自动完成：
1. ✅ 检查 PHP/Git 环境
2. ✅ 备份 `data/*.json` 和 MySQL 数据库
3. ✅ 拉取最新代码
4. ✅ 运行数据库迁移
5. ✅ 修复目录权限
6. ✅ 验证部署结果

---

## 四、数据同步（data/ 目录和上传文件）

`data/*.json` 和 `uploads/` 不在 git 中，服务器之间同步需要用 `sync-data.sh`：

```bash
# 查看当前有哪些数据文件
./scripts/sync-data.sh list

# 从远程服务器拉取数据到本地
./scripts/sync-data.sh pull root@1.2.3.4:/www/wwwroot/map.vnfest.top

# 推送本地数据到远程服务器
./scripts/sync-data.sh push root@1.2.3.4:/www/wwwroot/map.vnfest.top

# 备份数据到本地目录
./scripts/sync-data.sh backup
```

### 手动备份关键数据

```bash
# 备份 JSON 数据
cp -r data /www/backups/data-$(date +%Y%m%d)

# 备份 MySQL 数据库
mysqldump -u用户名 -p密码 数据库名 > /www/backups/db-$(date +%Y%m%d).sql

# 备份上传文件
cp -r uploads /www/backups/uploads-$(date +%Y%m%d)
```

---

## 五、健康检查

访问 `https://你的域名/api/health.php` 可以查看服务器状态：

```json
{
  "status": "ok",
  "checks": {
    "php_version": "8.2.0",
    "config_exists": true,
    "database": "connected",
    "file_integrity": "complete",
    "writable_dirs": "ok",
    "data_files_count": 16,
    "git_commit": "a1b2c3d",
    "git_branch": "main",
    "disk_free_gb": 50.2
  }
}
```

可以用监控工具（如宝塔的监控、Uptime Kuma）定期请求这个地址，`status` 不是 `ok` 时报警。

---

## 六、常见问题

**Q: 访问页面显示 500 错误？**
查看 PHP 错误日志：宝塔「网站」→ 设置 → 配置文件 → 开启错误日志。或检查 `config.php` 是否配置正确。

**Q: 图片不显示 / 上传失败？**
检查 `uploads/` 目录权限，确保 `www` 用户有写入权限。

**Q: 数据库连接失败？**
确认宝塔 MySQL 已启动，`config.php` 中的数据库名、用户、密码与宝塔创建的一致。

**Q: 登录后提示「权限不足」？**
先运行 `php scripts/migrate.php` 确保数据库表完整，然后检查 `users` 表中对应用户的 `role` 字段。

**Q: 更新代码后页面没变化？**
宝塔面板「服务」→ 重启 PHP（清空 OPcache），或者 `data/cache/` 目录下创建一个空文件触发缓存刷新。
