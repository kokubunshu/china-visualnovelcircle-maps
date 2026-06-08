#!/bin/bash
# ============================================================
# deploy.sh — VNFest 地图生产部署脚本
# ============================================================
# 用法:
#   ./scripts/deploy.sh                     # 部署到默认环境
#   ./scripts/deploy.sh -n                  # 干跑模式（不实际改动）
#   ./scripts/deploy.sh -b <branch>         # 部署指定分支
#   ./scripts/deploy.sh -s                  # 跳过备份
#   ./scripts/deploy.sh -h                  # 显示帮助
# ============================================================
set -euo pipefail

# ---- 颜色 ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ---- 参数解析 ----
DRY_RUN=false
SKIP_BACKUP=false
while getopts "nb:sh" opt; do
  case $opt in
    n) DRY_RUN=true ;;
    b) DEPLOY_BRANCH="$OPTARG" ;;
    s) SKIP_BACKUP=true ;;
    h)
      echo "用法: $0 [-n] [-b branch] [-s]"
      echo "  -n           干跑模式（显示将要执行的操作但不实际执行）"
      echo "  -b branch    部署指定分支（默认: main）"
      echo "  -s           跳过数据备份"
      exit 0 ;;
    *) exit 1 ;;
  esac
done

# ---- 加载部署配置 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$PROJECT_ROOT/deploy-config.sh" ]; then
  source "$PROJECT_ROOT/deploy-config.sh"
  ok "加载部署配置: deploy-config.sh"
else
  # 未配置 deploy-config.sh 时使用默认值（当前目录为 DEPLOY_PATH）
  warn "未找到 deploy-config.sh，使用默认配置"
  DEPLOY_PATH="$PROJECT_ROOT"
  DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
  PHP_BIN="${PHP_BIN:-$(which php 2>/dev/null || echo 'php')}"
  GIT_BIN="${GIT_BIN:-$(which git 2>/dev/null || echo 'git')}"
  BACKUP_DATA=true
  DATA_BACKUP_DIR="${DEPLOY_PATH}/../backups/data"
  MYSQL_BACKUP=false
fi

# ──────────────────────────────────────
# 阶段 1: 前置检查
# ──────────────────────────────────────
phase_preflight() {
  log "阶段 1/6: 前置环境检查..."

  cd "$DEPLOY_PATH"

  # 检查 PHP
  if ! command -v "$PHP_BIN" &>/dev/null; then
    fail "PHP 不可用 ($PHP_BIN)"
  fi
  ok "PHP: $($PHP_BIN -v 2>&1 | head -1)"

  # 检查 Git
  if ! command -v "$GIT_BIN" &>/dev/null; then
    fail "Git 不可用 ($GIT_BIN)"
  fi
  ok "Git: $($GIT_BIN --version 2>&1 | head -1)"

  # 检查 Git 仓库状态
  if [ ! -d ".git" ]; then
    fail "当前目录不是 Git 仓库: $DEPLOY_PATH"
  fi

  # 检查 config.php
  if [ ! -f "config.php" ]; then
    fail "config.php 不存在！请先复制 config.example.php 为 config.php 并配置数据库等参数"
  fi
  ok "配置文件存在: config.php"

  # 检查 data/ 目录
  if [ ! -d "data" ]; then
    fail "data/ 目录不存在"
  fi
  if [ -z "$(ls data/*.json 2>/dev/null)" ] && [ "$DRY_RUN" = false ]; then
    warn "data/ 目录下没有 JSON 文件 — 网站可能缺少核心数据（同好会列表等）"
  fi
  ok "数据目录: data/"
}

# ──────────────────────────────────────
# 阶段 2: 数据备份
# ──────────────────────────────────────
phase_backup() {
  log "阶段 2/6: 数据备份..."

  if [ "$SKIP_BACKUP" = true ]; then
    warn "跳过数据备份（-s 参数）"
    return
  fi

  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)

  # 备份 data/ 目录（JSON 运行时数据）
  if [ "$BACKUP_DATA" = true ]; then
    local data_backup_path="${DATA_BACKUP_DIR}/${timestamp}"
    if [ "$DRY_RUN" = true ]; then
      log "[干跑] 将备份 data/ → ${data_backup_path}/"
    else
      mkdir -p "$data_backup_path"
      cp -r "$DEPLOY_PATH/data/"*.json "$data_backup_path/" 2>/dev/null || warn "没有 JSON 文件需要备份"
      # 保留最近 7 天备份，清理更早的
      find "$DATA_BACKUP_DIR" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
      ok "data/ 备份完成: ${data_backup_path}"
    fi
  fi

  # MySQL 数据库备份
  if [ "$MYSQL_BACKUP" = true ]; then
    if [ "$DRY_RUN" = true ]; then
      log "[干跑] 将备份 MySQL 数据库"
    else
      mkdir -p "$DB_BACKUP_DIR"
      # 从 config.php 读取数据库凭据
      local db_name db_user db_pass
      db_name=$(php -r "require 'config.php'; echo defined('DB_NAME') ? DB_NAME : 'unknown';" 2>/dev/null || echo "unknown")
      db_user=$(php -r "require 'config.php'; echo defined('DB_USER') ? DB_USER : 'unknown';" 2>/dev/null || echo "unknown")
      db_pass=$(php -r "require 'config.php'; echo defined('DB_PASS') ? DB_PASS : '';" 2>/dev/null || echo "")
      if [ "$db_name" != "unknown" ] && [ "$db_user" != "unknown" ]; then
        "$MYSQLDUMP_BIN" -u"$db_user" -p"$db_pass" "$db_name" > "${DB_BACKUP_DIR}/${timestamp}.sql" 2>/dev/null
        ok "数据库备份完成: ${DB_BACKUP_DIR}/${timestamp}.sql"
        # 保留最近 30 天
        find "$DB_BACKUP_DIR" -maxdepth 1 -type f -name '*.sql' -mtime +30 -delete 2>/dev/null || true
      else
        warn "无法读取数据库配置，跳过 MySQL 备份"
      fi
    fi
  fi
}

# ──────────────────────────────────────
# 阶段 3: 拉取代码
# ──────────────────────────────────────
phase_pull() {
  log "阶段 3/6: 拉取最新代码..."

  cd "$DEPLOY_PATH"

  # 保存当前版本标识
  local old_hash
  old_hash=$("$GIT_BIN" rev-parse HEAD 2>/dev/null || echo "none")

  # 检查未提交的修改
  if [ -n "$("$GIT_BIN" status --porcelain 2>/dev/null)" ]; then
    warn "工作区有未提交的修改，尝试暂存..."
    if [ "$DRY_RUN" = true ]; then
      log "[干跑] 将执行: git stash push -m 'deploy-auto-stash'"
    else
      "$GIT_BIN" stash push -m "deploy-auto-stash-$(date +%Y%m%d_%H%M%S)" || true
      ok "本地修改已暂存 (git stash)"
    fi
  fi

  # 拉取
  if [ "$DRY_RUN" = true ]; then
    log "[干跑] 将执行: git pull origin ${DEPLOY_BRANCH}"
  else
    "$GIT_BIN" pull origin "$DEPLOY_BRANCH" 2>&1 || fail "Git pull 失败"
    ok "代码已更新到最新"
  fi

  # 显示版本变化
  local new_hash
  new_hash=$("$GIT_BIN" rev-parse HEAD 2>/dev/null || echo "none")
  if [ "$old_hash" != "$new_hash" ] && [ "$DRY_RUN" = false ]; then
    local log_range="${old_hash}..${new_hash}"
    if [ "$old_hash" != "none" ]; then
      log "更新内容:"
      "$GIT_BIN" log --oneline "$log_range" 2>/dev/null | head -20
    fi
  fi
}

# ──────────────────────────────────────
# 阶段 4: 数据库迁移
# ──────────────────────────────────────
phase_migrate() {
  log "阶段 4/6: 数据库迁移..."

  if [ "$DRY_RUN" = true ]; then
    log "[干跑] 将执行: php scripts/migrate.php"
    return
  fi

  "$PHP_BIN" "$DEPLOY_PATH/scripts/migrate.php" 2>&1 && ok "数据库迁移完成" || warn "数据库迁移可能有警告（幂等执行，可忽略）"
}

# ──────────────────────────────────────
# 阶段 5: 权限修复
# ──────────────────────────────────────
phase_permissions() {
  log "阶段 5/6: 文件权限修复..."

  if [ "$DRY_RUN" = true ]; then
    log "[干跑] 将设置目录权限"
    return
  fi

  # 宝塔面板典型用户: www
  local www_user="www"
  local www_group="www"

  # 检测实际 Web 服务器用户
  if command -v ps &>/dev/null; then
    local detected_user
    detected_user=$(ps aux | grep -E 'apache|httpd|nginx' | grep -v grep | head -1 | awk '{print $1}' 2>/dev/null || echo "")
    if [ -n "$detected_user" ]; then
      www_user="$detected_user"
    fi
  fi

  # 确保可写目录权限正确
  local writable_dirs=("data" "uploads" "wiki/uploads")
  for dir in "${writable_dirs[@]}"; do
    if [ -d "$DEPLOY_PATH/$dir" ]; then
      chown -R "${www_user}:${www_group}" "$DEPLOY_PATH/$dir" 2>/dev/null || warn "无法修改 $dir 所有者"
      find "$DEPLOY_PATH/$dir" -type d -exec chmod 755 {} + 2>/dev/null || true
      find "$DEPLOY_PATH/$dir" -type f -exec chmod 644 {} + 2>/dev/null || true
    fi
  done

  # 配置文件保密
  if [ -f "$DEPLOY_PATH/config.php" ]; then
    chmod 640 "$DEPLOY_PATH/config.php" 2>/dev/null || true
  fi

  ok "文件权限设置完成"
}

# ──────────────────────────────────────
# 阶段 6: 收尾与验证
# ──────────────────────────────────────
phase_finish() {
  log "阶段 6/6: 部署验证..."

  if [ "$DRY_RUN" = true ]; then
    log "[干跑] 跳过验证"
    return
  fi

  # 验证关键文件存在
  local critical_files=("index.html" "config.php" "api/galonly.php" "includes/auth.php")
  for f in "${critical_files[@]}"; do
    if [ ! -f "$DEPLOY_PATH/$f" ]; then
      fail "关键文件缺失: $f"
    fi
  done
  ok "关键文件完整"

  # PHP 语法检查
  local php_errors=0
  while IFS= read -r -d '' file; do
    if ! "$PHP_BIN" -l "$file" >/dev/null 2>&1; then
      warn "PHP 语法错误: $file"
      php_errors=$((php_errors + 1))
    fi
  done < <(find "$DEPLOY_PATH/api" "$DEPLOY_PATH/includes" -name '*.php' -print0 2>/dev/null)
  if [ "$php_errors" -eq 0 ]; then
    ok "PHP 语法检查通过"
  else
    fail "发现 $php_errors 个 PHP 语法错误"
  fi

  # 尝试触发 OPcache 重置（如果可写）
  local opcache_file="$DEPLOY_PATH/data/cache/.opcache-reset"
  echo "$(date +%s)" > "$opcache_file" 2>/dev/null || true

  # 输出部署摘要
  local deploy_time
  deploy_time=$(date '+%Y-%m-%d %H:%M:%S')
  local deploy_hash
  deploy_hash=$("$GIT_BIN" rev-parse --short HEAD 2>/dev/null || echo "unknown")

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║      部署完成                            ║"
  echo "║──────────────────────────────────────────║"
  echo "║  时间:  ${deploy_time}                ║"
  echo "║  版本:  ${deploy_hash}                         ║"
  echo "║  分支:  ${DEPLOY_BRANCH}                         ║"
  echo "╚══════════════════════════════════════════╝"

  # Webhook 通知（可选）
  if [ "${NOTIFY_ENABLED:-false}" = true ] && [ -n "${NOTIFY_URL:-}" ]; then
    curl -s -X POST "$NOTIFY_URL" \
      -H "Content-Type: application/json" \
      -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"VNFest 地图已部署\n版本: ${deploy_hash}\n分支: ${DEPLOY_BRANCH}\n时间: ${deploy_time}\"}}" \
      >/dev/null 2>&1 || true
  fi
}

# ──────────────────────────────────────
# 执行
# ──────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║    VNFest 地图 · 生产部署脚本            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

phase_preflight
phase_backup
phase_pull
phase_migrate
phase_permissions
phase_finish

echo ""
ok "全部部署流程完成！"
