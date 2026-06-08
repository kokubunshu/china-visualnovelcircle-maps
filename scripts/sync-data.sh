#!/bin/bash
# ============================================================
# sync-data.sh — 数据同步工具
# ============================================================
# 用于在服务器之间同步 gitignore 中的运行时数据文件。
#
# 用法:
#   ./scripts/sync-data.sh pull    # 从远程服务器拉取数据到本地
#   ./scripts/sync-data.sh push    # 推送本地数据到远程服务器
#   ./scripts/sync-data.sh backup  # 备份到本地存档目录
#   ./scripts/sync-data.sh list    # 列出可同步的数据文件
#   ./scripts/sync-data.sh -h      # 显示帮助
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- 颜色 ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[sync-data]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ---- 默认配置（可通过 deploy-config.sh 覆盖）----
if [ -f "$PROJECT_ROOT/deploy-config.sh" ]; then
  source "$PROJECT_ROOT/deploy-config.sh"
fi

# 需要同步的数据目录（相对于项目根目录）
DATA_DIRS=(
  "data/*.json"
  "uploads"
  "wiki/uploads"
)

# ---- 函数 ----
show_help() {
  echo "用法: $0 {pull|push|backup|list} [options]"
  echo ""
  echo "命令:"
  echo "  pull [user@host:path]   从远程服务器拉取数据"
  echo "  push [user@host:path]   推送数据到远程服务器"
  echo "  backup [dir]            备份数据到本地目录（默认: ../backups/data）"
  echo "  list                    列出本地可同步的数据文件"
  echo ""
  echo "示例:"
  echo "  $0 pull root@1.2.3.4:/www/wwwroot/example.com"
  echo "  $0 push root@1.2.3.4:/www/wwwroot/example.com -n  # 干跑"
  echo "  $0 backup ../backups/data-20240101"
}

list_data_files() {
  log "可同步的数据文件:"
  local total=0
  for pattern in "${DATA_DIRS[@]}"; do
    if ls "$PROJECT_ROOT/$pattern" 2>/dev/null | head -5 >/dev/null; then
      for f in "$PROJECT_ROOT"/$pattern; do
        if [ -f "$f" ]; then
          local size
          size=$(du -h "$f" | cut -f1)
          echo "  ${CYAN}${f#$PROJECT_ROOT/}${NC} (${size})"
          total=$((total + 1))
        fi
      done
    fi
  done
  # 检查目录
  for d in uploads wiki/uploads; do
    if [ -d "$PROJECT_ROOT/$d" ]; then
      local dsize
      dsize=$(du -sh "$PROJECT_ROOT/$d" 2>/dev/null | cut -f1)
      echo "  ${CYAN}${d}/${NC} (${dsize})"
    fi
  done
  echo ""
  ok "共 $total 个数据文件（含上传目录）"
}

cmd_backup() {
  local backup_dir="${1:-$PROJECT_ROOT/../backups/data/$(date +%Y%m%d_%H%M%S)}"
  mkdir -p "$backup_dir"

  log "备份数据到: $backup_dir"

  # JSON 数据文件
  local count=0
  for pattern in "${DATA_DIRS[@]}"; do
    # 只匹配文件模式的才 cp
    case "$pattern" in
      *.json)
        for f in "$PROJECT_ROOT"/$pattern; do
          if [ -f "$f" ]; then
            cp "$f" "$backup_dir/" 2>/dev/null
            count=$((count + 1))
          fi
        done
        ;;
    esac
  done
  ok "备份了 $count 个数据文件到 $backup_dir"

  # 上传目录（排除大量小文件时不显示详情）
  for d in uploads wiki/uploads; do
    if [ -d "$PROJECT_ROOT/$d" ] && [ -n "$(ls -A "$PROJECT_ROOT/$d" 2>/dev/null)" ]; then
      local target="$backup_dir/$d"
      mkdir -p "$(dirname "$target")"
      cp -r "$PROJECT_ROOT/$d" "$target" 2>/dev/null && ok "备份上传目录: $d" || warn "备份 $d 失败"
    fi
  done
}

cmd_pull() {
  local remote="$1"
  if [ -z "$remote" ]; then
    fail "请指定远程服务器地址: $0 pull user@host:/path"
  fi

  log "从远程同步数据: ${remote}"

  # JSON 文件
  for pattern in "${DATA_DIRS[@]}"; do
    case "$pattern" in
      *.json)
        local file="${pattern#data/}"
        log "  拉取 ${file}..."
        rsync -avz --progress "${remote}/data/${file}" "$PROJECT_ROOT/data/" 2>/dev/null || warn "拉取 ${file} 失败（可能远程文件不存在）"
        ;;
    esac
  done

  # 上传目录
  for d in uploads wiki/uploads; do
    if rsync -avz "${remote}/${d}/" "$PROJECT_ROOT/$d/" 2>/dev/null; then
      ok "同步上传目录: $d"
    else
      warn "同步上传目录失败: $d"
    fi
  done

  ok "数据拉取完成"
}

cmd_push() {
  local remote="$1"
  if [ -z "$remote" ]; then
    fail "请指定远程服务器地址: $0 push user@host:/path"
  fi

  log "推送数据到远程: ${remote}"

  for pattern in "${DATA_DIRS[@]}"; do
    case "$pattern" in
      *.json)
        local file="${pattern#data/}"
        if [ -f "$PROJECT_ROOT/data/${file}" ]; then
          rsync -avz --progress "$PROJECT_ROOT/data/${file}" "${remote}/data/" 2>/dev/null || warn "推送 ${file} 失败"
        fi
        ;;
    esac
  done

  for d in uploads wiki/uploads; do
    if [ -d "$PROJECT_ROOT/$d" ]; then
      rsync -avz "$PROJECT_ROOT/$d/" "${remote}/${d}/" 2>/dev/null && ok "同步上传目录: $d" || warn "同步上传目录失败: $d"
    fi
  done

  ok "数据推送完成"
}

# ---- 主入口 ----
COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
  list)
    list_data_files
    ;;
  backup)
    cmd_backup "$@"
    ;;
  pull)
    cmd_pull "$@"
    ;;
  push)
    cmd_push "$@"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    fail "未知命令: $COMMAND（可用命令: pull, push, backup, list）"
    ;;
esac
