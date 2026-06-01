<?php
// config.example.php - 配置模板
// 使用说明：复制此文件为 config.php 并填入真实配置

if (!defined('ADMIN_TOKEN')) {

define('ADMIN_TOKEN', 'your_secure_password_here');
define('BOT_API_KEY', 'your_private_bot_api_key_here');
define('DATA_PATH', __DIR__ . '/data/');
define('SITE_URL', 'https://yourdomain.com');

// 数据库驱动: 'sqlite' 或 'mysql'
define('DB_DRIVER', 'sqlite');

// SQLite 配置（DB_DRIVER = sqlite 时使用）
define('DB_PATH', __DIR__ . '/data/galgame.db');

// MySQL 配置（DB_DRIVER = mysql 时使用）
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'www_test_map_vnf');
define('DB_USER', 'www_test_map_vnf');
define('DB_PASS', '');

define('SESSION_LIFETIME', 7200);
define('SESSION_SECRET', 'change-to-a-random-64-char-string');

// 邮件发送配置
// 方式一: 使用 PHP mail()（需服务器支持 sendmail/postfix）
define('MAIL_DRIVER', 'mail');       // 'mail' 或 'smtp'
define('MAIL_FROM_NAME', '地图');     // 发件人名称
define('MAIL_FROM_ADDR', 'noreply@yourdomain.com'); // 发件人地址

// 方式二: 使用 SMTP（如 QQ邮箱、阿里云邮件推送等）
// 启用 SMTP 时把 MAIL_DRIVER 改为 'smtp' 并填写以下配置
define('SMTP_HOST', '');     // SMTP 服务器 (例: smtp.qq.com)
define('SMTP_PORT', 465);    // 端口 (QQ邮箱: 465)
define('SMTP_USER', '');     // SMTP 账号 (例: your@qq.com)
define('SMTP_PASS', '');     // SMTP 密码/授权码 (QQ邮箱需开启 SMTP 并生成授权码)
define('SMTP_SECURE', 'ssl'); // ssl 或 tls

// OAuth 配置
define('QQ_APPID', '');
define('QQ_APPSECRET', '');
define('QQ_REDIRECT_URI', SITE_URL . '/api/qq_callback.php');
define('DISCORD_CLIENT_ID', '');
define('DISCORD_CLIENT_SECRET', '');
define('DISCORD_REDIRECT_URI', SITE_URL . '/api/discord_callback.php');

define('LEGACY_AUTH_ENABLED', true);

}
