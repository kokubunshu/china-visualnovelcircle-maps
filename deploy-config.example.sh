#!/bin/bash
# ============================================================
# deploy-config.example.sh — 部署配置模板
# ============================================================
# 使用方法：
#   1. 复制本文件为 deploy-config.sh
#   2. 填入服务器实际路径和配置
#   3. chmod +x deploy-config.sh
#   4. 部署脚本会自动 source 本文件
# ============================================================

# ---- 仓库设置 ----
REMOTE_REPO="https://github.com/kokubunshu/china-visualnovelcircle-maps.git"
DEPLOY_BRANCH="main"

# ---- 服务器路径 ----
# 网站根目录（宝塔面板默认路径）
DEPLOY_PATH="/www/wwwroot/your-domain"
# PHP 可执行文件路径
PHP_BIN="/usr/bin/php"
# Git 可执行文件路径
GIT_BIN="/usr/bin/git"

# ---- 数据库备份 ----
# MySQL 备份（如果使用 MySQL）
MYSQL_BACKUP=true
MYSQL_BIN="/usr/bin/mysql"
MYSQLDUMP_BIN="/usr/bin/mysqldump"
DB_BACKUP_DIR="${DEPLOY_PATH}/../backups/db"

# ---- 数据备份 ----
# 部署前自动备份 data/ 目录
BACKUP_DATA=true
DATA_BACKUP_DIR="${DEPLOY_PATH}/../backups/data"

# ---- 上传文件备份 ----
BACKUP_UPLOADS=true
UPLOADS_BACKUP_DIR="${DEPLOY_PATH}/../backups/uploads"

# ---- 通知 ----
# 可选: 部署完成后发送通知
NOTIFY_ENABLED=false
NOTIFY_URL=""   # Webhook URL (如企业微信/钉钉/Slack)
