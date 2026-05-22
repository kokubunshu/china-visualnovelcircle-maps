# VNFest Galgame 同好会地图

> 中日高校 Galgame / 视觉小说同好会导航、社团资料维护、活动发布、刊物征稿、Wiki 共建与萌战活动平台。

<p align="center">
  <img src="images/VNF.png" alt="VNFest" width="420">
</p>

<p align="center">
  <a href="package.json"><img alt="Version" src="https://img.shields.io/badge/version-1.6.6-2ecc71?style=for-the-badge"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-GPLv3-355c9b?style=for-the-badge"></a>
  <a href="https://www.php.net/"><img alt="PHP" src="https://img.shields.io/badge/PHP-8.x-777bb4?style=for-the-badge&logo=php&logoColor=white"></a>
  <a href="https://d3js.org/"><img alt="D3.js" src="https://img.shields.io/badge/D3.js-7.9-f9a03c?style=for-the-badge&logo=d3.js&logoColor=white"></a>
</p>

## 项目定位

VNFest Galgame 同好会地图不是一个单纯的社团目录，而是给视觉小说同好会使用的轻量运营平台。它把地图导航、同好会资料、成员绑定、活动日历、刊物征稿、Wiki、反馈和萌战活动串在一起，让用户能找到组织，也让负责人能持续维护自己的同好会信息。

核心体验：

```text
发现同好会 -> 查看详情 -> 申请绑定/加入 -> 参与活动 -> 投稿刊物/Wiki -> 参与萌战
```

## 1.6.6 更新重点

相较于 1.6.5，本版本新增了星图系统与用户中心：

| 模块 | 更新 |
| --- | --- |
| 星图系统 | 全新联合星图页面 (`star_map.html`)，联合星图重设计为始终展开模式 + 核心-成员轨道布局；新增 PHP API 支持星图联合的增删改查与成员管理 |
| 用户中心 | 独立用户中心页面 (`user.html`)，账号按钮由弹窗改为直接跳转至用户中心 |
| 浏览器缓存 | `.htaccess` 新增图片资源 1 年强缓存、CSS/JS 1 天缓存策略 |
| 主题系统 | `index.html` 与 `login.html` 新增主题预加载脚本，消除深色/浅色主题切换闪烁；theme-color 暗色 media query 修复 |
| 图片优化 | 新增媒体预加载 (`preloadMediaUrl`) 和图片增强 (`enhanceImages`) 工具，上传头像/图片后即时加载；裁剪图片启用 `loading="eager"` + `decoding="async"` |
| 登录页 | 登录页视觉重构：品牌符号改为 Logo 图片，按钮样式改为毛玻璃+边框，移除硬编码暗色主题 |
| 壁纸系统 | 移动端/触摸设备自动禁用壁纸，防止性能问题；重入保护防止重复初始化 |
| 模式切换 | 地图/列表模式新增「星图」切换按钮，支持中/日文翻译 |
| 管理后台 | 审核页视觉翻新：颜色对比度优化、状态卡片样式调整、移除壁纸脚本 |
| CSS 适配 | 窄桌面 (≤800px) 适配、mode-tab 弹性布局修复、display-switch 移动端优化 |
| Wiki | 所有 Wiki 页面移除壁纸脚本引用 |
| 数据库 | 迁移脚本新增 `star_unions` 与 `star_union_members` 表 (MySQL + SQLite) |

完整记录见 [CHANGELOG.md](CHANGELOG.md)。

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

### Wiki

- Wiki 首页、写作指南和静态详情页
- 可视化编辑工具
- 中文 / 日文内容支持
- 图片、信息卡、时间线、外链和结构化段落
- 生成后的 Wiki 页面可直接发布为静态 HTML

### 萌战

- 公共萌战门户：查看活动、提名候选、投票、查看赛程和结果
- 管理端：创建活动、配置阶段、审核候选、生成对阵、结算比赛
- 阶段：提名、预选、分组投票、淘汰赛、复活赛、决赛
- 赛程：支持 1v1 对阵、自动晋级、决赛阶段和公开对阵图
- 数据：候选、阶段、场次、投票和权限统一走 PHP API

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
| 桌面/移动打包 | Electron, Capacitor |
| 测试 | Node.js contract tests |

## 项目结构

```text
.
├─ admin/                 管理后台页面
├─ api/                   PHP API
├─ css/                   全站样式
├─ data/                  本地运行数据目录，生产数据不进入 Git
├─ Galgame_events/         GalOnly 活动相关页面
├─ image/background/       本地壁纸投放目录，仅保留 .gitkeep
├─ images/                站点内置图片资源
├─ includes/              PHP 公共模块
├─ js/                    前端脚本
├─ moe/                   萌战公共页面和赛程页面
├─ scripts/               测试、迁移和生成脚本
├─ wiki/                  Wiki 静态页面、资源和内容
├─ docs/                  设计方案与 Demo
├─ index.html             主地图入口
├─ login.html             登录入口
├─ star_map.html          联合星图入口
├─ user.html              用户中心页面
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

该命令会检查核心前端契约、Wiki 生成、上传契约、同好会编辑、后端隐私、萌战接口与 UI 契约，以及项目健康状态。

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
wiki/
images/
image/background/.gitkeep
index.html
login.html
star_map.html
user.html
submit*.html
feedback.html
config.example.php
.env.example
.gitignore
README.md
CHANGELOG.md
package.json
package-lock.json
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
data/cache/
data/avatars/*
data/club_avatars/*
data/event_images/*
data/publication_images/*
data/manuscripts/*
uploads/**
wiki/uploads/*
image/background/*
php-server*.log
.php-server*.log
docs/superpowers/
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
