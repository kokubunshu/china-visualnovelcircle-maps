# VNFest Galgame 同好会地图

> 中日高校 Galgame / 视觉小说同好会导航、社团资料维护、活动发布、刊物征稿、企划运营与 Wiki 共建平台。

<p align="center">
  <img src="images/VNF.png" alt="VNFest" width="420">
</p>

<p align="center">
  <a href="package.json"><img alt="Version" src="https://img.shields.io/badge/version-1.7.0-2ecc71?style=for-the-badge"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-GPLv3-355c9b?style=for-the-badge"></a>
  <a href="https://www.php.net/"><img alt="PHP" src="https://img.shields.io/badge/PHP-8.x-777bb4?style=for-the-badge&logo=php&logoColor=white"></a>
  <a href="https://d3js.org/"><img alt="D3.js" src="https://img.shields.io/badge/D3.js-7.9-f9a03c?style=for-the-badge&logo=d3.js&logoColor=white"></a>
</p>

## 项目定位

VNFest Galgame 同好会地图不是一个单纯的社团目录，而是给视觉小说同好会使用的轻量运营平台。它把地图导航、同好会资料、成员绑定、活动日历、刊物征稿、企划运营、投票赛事、Wiki 和反馈串在一起，让用户能找到组织，也让负责人能持续维护自己的同好会信息。

核心体验：

```text
发现同好会 -> 查看详情 -> 申请绑定/加入 -> 参与活动 -> 投稿刊物/Wiki -> 参与企划赛事
```

## 1.7.0 更新重点

相较于 1.6.6，本版本是一次超大规模更新，新增了企划枢纽、十二器、萌战、投票活动、同好会广场等核心模块，同时移除了不再维护的桌面端/移动端打包和 Astrbot 插件。

| 模块 | 更新 |
| --- | --- |
| 企划枢纽 | 全新企划管理系统 (`project-hub.js`)，同好会可创建/管理企划项目，支持项目成员、进度追踪、文件关联；配套管理后台 (`admin/club_project_manager.html`) 和 PHP API |
| 十二器 | 完整赛事系统 (`twelve/`)，支持提名、海选、分组多轮投票/评分制，最终沉淀 Top 12；数据源优先 Bangumi 搜索，补充 VNDB，保留手动提名 |
| 萌战系统 | 萌战赛事 (`moe/contest.html`)，支持提名、海选、2 的幂人数 1v1 淘汰赛，最终选出萌王；赛事页面独立于旧版萌战 Hub |
| 投票活动系统 | 统一投票企划底座 (`vote.html`)，同好会负责人/管理员可创建、发布、归档本会企划，支持多阶段多轮次投票 |
| 同好会广场 | 集中浏览入口 (`club_square.html`)，展示公开的十二器、萌战和后续大型企划 |
| 成长系统 | 用户成长体系 (`includes/growth.php`)，用户活跃度和贡献追踪 API |
| 图片代理 | 图片代理服务 (`api/image_proxy.php`)，支持外部图片安全加载；VNDB 代理 (`api/vndb_proxy.php`) 用于赛事数据补充 |
| 国际化 | 页面国际化初步支持 (`js/page-i18n.js`)，日本都道府县数据 (`includes/japan_prefectures.php`) |
| 配置规范 | `config.php` 新增 `LEGACY_AUTH_ENABLED` 过渡期兼容开关，Bangumi Token 配置项 |
| 移除模块 | 移除 Electron 桌面端打包、Capacitor 安卓打包、Astrbot QQ 机器人插件、旧版萌战管理页 (`admin/moe_manager.html`)、`package-lock.json` |

## 功能总览

### 地图与列表

- 中国省份地图、日本都道府县地图、海外同好会入口
- 地图模式 / 列表模式切换
- 省份索引、搜索、类型筛选和排序
- 多省份绑定，同一组织可显示在多个地区
- 访客浏览与登录后管理入口

### 同好会资料

- 同好会名称、地区、学校、类型、联系方式和简介维护
- 头像上传、裁剪与展示
- 负责人 / 管理员 / 超级管理员权限层级
- 成员申请、审核、绑定和成员列表
- 详细页直达 Wiki、活动、刊物和相关操作

### 活动与刊物

- 活动日历与列表视图
- 活动投稿、审核、展示和报名数据
- 刊物征稿发布、状态追踪和关联同好会
- GalOnly 活动专题入口和审核页

### 企划枢纽

- 同好会企划项目的创建、编辑和管理
- 项目成员管理（邀请/移除/角色分配）
- 项目进度状态追踪（筹备中 / 进行中 / 已完成 / 搁置）
- 项目文件关联
- 企划列表浏览和详情查看

### 投票赛事系统

- 统一投票企划底座：多阶段多轮次投票
- 十二器：提名 → 海选 → 分组评分/投票，最终 Top 12
- 萌战：提名 → 海选 → 1v1 淘汰赛，最终萌王
- 数据源：Bangumi + VNDB 搜索提名，手动补充

### 同好会广场

- 集中浏览所有公开企划、赛事和活动
- 快速筛选和分类查看

### 成长系统

- 用户活跃度追踪
- 贡献度统计

### Wiki

- Wiki 首页、写作指南和静态详情页
- 可视化编辑工具
- 中文 / 日文内容支持
- 图片、信息卡、时间线、外链和结构化段落
- 生成后的 Wiki 页面可直接发布为静态 HTML

### 登录与账号

- 默认登录页入口
- 本地账号登录 / 注册
- 邮箱验证码和找回密码
- QQ / Discord OAuth 入口
- Session 和第三方账号隐私保护

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | HTML, CSS, Vanilla JavaScript, D3.js |
| 后端 | PHP 8.x |
| 数据 | JSON runtime files, SQLite/MySQL via PDO |
| 测试 | Node.js contract tests |

## 项目结构

```text
.
├─ admin/                 管理后台页面
├─ api/                   PHP API
├─ css/                   全站样式
├─ data/                  本地运行数据目录，生产数据不进入 Git
├─ Galgame_events/        GalOnly 活动相关页面
├─ image/background/      本地壁纸投放目录，仅保留 .gitkeep
├─ images/                站点内置图片资源
├─ includes/              PHP 公共模块
├─ js/                    前端脚本
├─ moe/                   萌战系统页面
├─ scripts/               测试、迁移和生成脚本
├─ twelve/                十二器赛事页面
├─ wiki/                  Wiki 静态页面、资源和内容
├─ club_square.html       同好会广场入口
├─ club_share.html        同好会分享页
├─ index.html             主地图入口
├─ login.html             登录入口
├─ star_map.html          联合星图入口
├─ user.html              用户中心页面
├─ vote.html              投票活动入口
├─ CHANGELOG.md           版本更新记录
└─ README.md
```

## 本地运行

安装依赖：

```bash
npm install
```

准备配置：

```bash
cp config.example.php config.php
```

启动 PHP 开发服务器：

```bash
php -S 127.0.0.1:8000
```

打开：

```text
http://127.0.0.1:8000/login.html
http://127.0.0.1:8000/index.html?guest=1
```

## 检查命令

```bash
npm run check
```

该命令会检查核心前端契约、Wiki 生成、上传契约、同好会编辑、后端隐私、成长系统、用户页面资产、国际化、性能优化、投票企划契约以及项目健康状态。

## 壁纸目录

本地壁纸放在：

```text
image/background/
```

规则：

- 目录内支持 `jpg`、`jpeg`、`png`、`webp`、`gif`、`avif`
- 登录页和其他接入页面会读取 `api/backgrounds.php`
- 该目录只提交 `.gitkeep`
- 你本地放入的壁纸不会被上传到 GitHub
- 没有本地壁纸时，会使用仓库内置图片作为默认壁纸

## GitHub 上传清单

可以上传：

```text
admin/
api/
css/
Galgame_events/
includes/
js/
moe/
scripts/
twelve/
wiki/
images/
image/background/.gitkeep
index.html
login.html
star_map.html
user.html
club_square.html
club_share.html
vote.html
submit*.html
feedback.html
config.example.php
.env.example
.gitignore
README.md
CHANGELOG.md
package.json
```

不要上传：

```text
config.php
.env*
.user.ini
node_modules/
dist/
www/
android/
data/*.json
data/*.db
data/*.bak*
data/_tmp_*
data/cache/
data/avatars/*
data/club_avatars/*
data/event_images/*
data/publication_images/*
data/manuscripts/*
uploads/**
wiki/uploads/*
wiki_n68E2.7z
image/background/*
php-server*.log
.php-server*.log
*.7z
参考/
docs/
.superpowers/
.claude/
```

## 发布前检查

```bash
git status --short
git status --ignored --short
npm run check
```

确认没有本地配置、运行数据、用户上传文件、构建产物或临时截图进入待提交列表后，再提交并推送。

## License

本项目基于 [GPLv3](LICENSE) 发布。
