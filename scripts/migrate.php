<?php
// scripts/migrate.php - 创建数据库表（CLI 脚本）
// 用法: php scripts/migrate.php
// 支持 SQLite 和 MySQL 两种驱动，由 config.php 中 DB_DRIVER 控制

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/moe.php';
require_once __DIR__ . '/../includes/twelve.php';

echo "开始创建数据库表... (驱动: " . (defined('DB_DRIVER') ? DB_DRIVER : 'sqlite') . ")\n";

$db = getDB();
$isMysql = defined('DB_DRIVER') && DB_DRIVER === 'mysql';

if ($isMysql) {
    // ==================== MySQL 建表 ====================

    // MySQL 不支持 CREATE INDEX IF NOT EXISTS，用 try-catch 包装
    $tryIndex = function (string $sql) use ($db) {
        try { $db->exec($sql); } catch (PDOException $e) { /* 索引已存在，忽略 */ }
    };

    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            qq_openid     VARCHAR(255) UNIQUE,
            discord_id    VARCHAR(255) UNIQUE,
            qq_unionid    VARCHAR(255),
            password_hash VARCHAR(255),
            username      VARCHAR(255) NOT NULL UNIQUE,
            avatar_url    VARCHAR(500) DEFAULT '',
            role          VARCHAR(50) NOT NULL DEFAULT 'visitor',
            status        VARCHAR(50) NOT NULL DEFAULT 'active',
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    echo "[OK] users 表已创建\n";

    // 迁移：添加新列（安全，列已存在时忽略）
    $tryAlter = function (string $sql) use ($db) {
        try { $db->exec($sql); } catch (PDOException $e) { /* 列已存在，忽略 */ }
    };
    $tryAlter("ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE");
    $tryAlter("ALTER TABLE users ADD COLUMN email_verified_at DATETIME");
    $tryAlter("ALTER TABLE users ADD COLUMN avatar_updated_at DATETIME");
    $tryAlter("ALTER TABLE users ADD COLUMN nickname VARCHAR(255) DEFAULT '' AFTER username");
    $tryAlter("ALTER TABLE users ADD COLUMN profile_bio VARCHAR(300) DEFAULT ''");

    $db->exec("
        CREATE TABLE IF NOT EXISTS sessions (
            id           VARCHAR(128) PRIMARY KEY,
            user_id      INT NOT NULL,
            ip_address   VARCHAR(45),
            user_agent   TEXT,
            created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at   DATETIME NOT NULL,
            is_valid     TINYINT(1) NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_sessions_user ON sessions(user_id)");
    $tryIndex("CREATE INDEX idx_sessions_expires ON sessions(expires_at)");
    echo "[OK] sessions 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS clubs (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            province      VARCHAR(255) NOT NULL DEFAULT '',
            prefecture    VARCHAR(255) DEFAULT '',
            representative_id INT,
            visibility    VARCHAR(50) DEFAULT 'public',
            country       VARCHAR(50) DEFAULT 'china'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    echo "[OK] clubs 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS audit_logs (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT,
            action      VARCHAR(255) NOT NULL,
            target_type VARCHAR(255),
            target_id   INT,
            details     TEXT,
            ip_address  VARCHAR(45),
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_audit_user ON audit_logs(user_id)");
    $tryIndex("CREATE INDEX idx_audit_created ON audit_logs(created_at)");
    echo "[OK] audit_logs 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS rate_limits (
            ip_address   VARCHAR(45) NOT NULL,
            endpoint     VARCHAR(255) NOT NULL,
            hit_count    INT DEFAULT 1,
            window_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (ip_address, endpoint)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    echo "[OK] rate_limits 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS notifications (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            user_id       INT NOT NULL,
            type          VARCHAR(50) NOT NULL,
            title         VARCHAR(255) NOT NULL,
            message       TEXT NOT NULL,
            link          VARCHAR(500) DEFAULT '',
            related_type  VARCHAR(50) DEFAULT '',
            related_id    INT DEFAULT 0,
            is_read       TINYINT(1) NOT NULL DEFAULT 0,
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at       DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at)");
    echo "[OK] notifications 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_memberships (
            id       INT AUTO_INCREMENT PRIMARY KEY,
            user_id  INT NOT NULL,
            club_id  INT NOT NULL,
            role     VARCHAR(50) NOT NULL DEFAULT 'member',
            status   VARCHAR(50) NOT NULL DEFAULT 'active',
            qq_account VARCHAR(255) DEFAULT '',
            contact_account VARCHAR(255) DEFAULT '',
            apply_role VARCHAR(50) DEFAULT 'member',
            is_student INT DEFAULT 0,
            country  VARCHAR(20) DEFAULT 'china',
            join_method VARCHAR(50) DEFAULT 'school_no_code',
            external_club_name VARCHAR(255) DEFAULT '',
            external_club_role VARCHAR(255) DEFAULT '',
            apply_reason TEXT,
            joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            left_at  DATETIME,
            UNIQUE(user_id, club_id, country),
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_memberships_user ON club_memberships(user_id)");
    $tryIndex("CREATE INDEX idx_memberships_club ON club_memberships(club_id)");
    echo "[OK] club_memberships 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_verification_codes (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            club_id     INT NOT NULL,
            code        VARCHAR(255) NOT NULL,
            created_by  INT NOT NULL,
            max_uses    INT DEFAULT 50,
            use_count   INT DEFAULT 0,
            expires_at  DATETIME,
            is_active   TINYINT(1) NOT NULL DEFAULT 1,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_verify_codes_club ON club_verification_codes(club_id)");
    echo "[OK] club_verification_codes 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_recommendations (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            club_id     INT NOT NULL,
            country     VARCHAR(20) DEFAULT 'china',
            bangumi_id  INT NOT NULL,
            title       VARCHAR(255) NOT NULL,
            image_url   VARCHAR(500) DEFAULT '',
            rating      DECIMAL(3,1) DEFAULT 0,
            summary     TEXT,
            sort_order  INT DEFAULT 0,
            created_by  INT NOT NULL,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_recommendations_club ON club_recommendations(club_id, sort_order)");
    echo "[OK] club_recommendations 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_moe_kings (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            club_id       INT NOT NULL,
            country       VARCHAR(20) DEFAULT 'china',
            character_id  INT NOT NULL,
            name          VARCHAR(255) NOT NULL,
            name_cn       VARCHAR(255) DEFAULT '',
            image_url     VARCHAR(500) DEFAULT '',
            summary       TEXT,
            updated_by    INT NOT NULL,
            updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_moe_king_club (club_id, country),
            FOREIGN KEY (updated_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_moe_kings_club ON club_moe_kings(club_id, country)");
    echo "[OK] club_moe_kings 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_comments (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            club_id     INT NOT NULL,
            country     VARCHAR(20) DEFAULT 'china',
            user_id     INT NOT NULL,
            content     TEXT NOT NULL,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME,
            is_deleted  TINYINT(1) DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_comments_club ON club_comments(club_id, created_at)");
    echo "[OK] club_comments 表已创建\n";

    $tryAlter("ALTER TABLE club_verification_codes ADD COLUMN country VARCHAR(20) DEFAULT 'china'");
    echo "[OK] club_verification_codes.country 列已添加\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS email_verifications (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NOT NULL,
            email       VARCHAR(255) NOT NULL,
            code        VARCHAR(10) NOT NULL,
            expires_at  DATETIME NOT NULL,
            used        TINYINT(1) NOT NULL DEFAULT 0,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_email_verify_user ON email_verifications(user_id)");
    echo "[OK] email_verifications 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_events (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            name              VARCHAR(255) NOT NULL,
            location          VARCHAR(255) NOT NULL DEFAULT '',
            date              DATE NOT NULL,
            registration_open TINYINT(1) NOT NULL DEFAULT 1,
            description       TEXT,
            created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    echo "[OK] galonly_events 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_applications (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            event_id      INT NOT NULL,
            user_id       INT NOT NULL,
            is_joint      TINYINT(1) NOT NULL DEFAULT 0,
            joint_name    VARCHAR(255) NOT NULL DEFAULT '',
            wants_upgrade TINYINT(1) NOT NULL DEFAULT 0,
            contact       VARCHAR(255) NOT NULL DEFAULT '',
            notes         TEXT,
            image_path    VARCHAR(500) NOT NULL DEFAULT '',
            status        VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES galonly_events(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_galonly_app_event ON galonly_applications(event_id)");
    $tryIndex("CREATE INDEX idx_galonly_app_user ON galonly_applications(user_id)");
    $tryIndex("CREATE INDEX idx_galonly_app_status ON galonly_applications(status)");
    echo "[OK] galonly_applications 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_application_clubs (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            application_id  INT NOT NULL,
            club_id         INT NOT NULL,
            club_country    VARCHAR(50) NOT NULL DEFAULT '',
            UNIQUE(application_id, club_id),
            FOREIGN KEY (application_id) REFERENCES galonly_applications(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_galonly_app_clubs_app ON galonly_application_clubs(application_id)");
    echo "[OK] galonly_application_clubs 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_votes (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            application_id  INT NOT NULL,
            auditer_id      INT NOT NULL,
            vote            VARCHAR(10) NOT NULL,
            created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(application_id, auditer_id),
            FOREIGN KEY (application_id) REFERENCES galonly_applications(id),
            FOREIGN KEY (auditer_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_galonly_votes_app ON galonly_votes(application_id)");
    echo "[OK] galonly_votes 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS announcements (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            title         VARCHAR(255) NOT NULL,
            content       TEXT NOT NULL,
            type          VARCHAR(50) NOT NULL DEFAULT 'info',
            status        VARCHAR(50) NOT NULL DEFAULT 'draft',
            is_persistent TINYINT(1) NOT NULL DEFAULT 1,
            created_by    INT NOT NULL,
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            published_at  DATETIME,
            FOREIGN KEY (created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_announce_status ON announcements(status)");
    echo "[OK] announcements 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS star_unions (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            name        VARCHAR(255) NOT NULL,
            description TEXT,
            region      VARCHAR(100) DEFAULT '',
            country     VARCHAR(50) DEFAULT 'china',
            created_by  INT NOT NULL,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_star_unions_country ON star_unions(country)");
    $tryIndex("CREATE INDEX idx_star_unions_created_by ON star_unions(created_by)");
    echo "[OK] star_unions 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS star_union_members (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            union_id     INT NOT NULL,
            club_id      INT NOT NULL,
            club_country VARCHAR(50) DEFAULT 'china',
            added_by     INT,
            added_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(union_id, club_id, club_country),
            FOREIGN KEY (union_id) REFERENCES star_unions(id) ON DELETE CASCADE,
            FOREIGN KEY (added_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $tryIndex("CREATE INDEX idx_star_union_members_union ON star_union_members(union_id)");
    echo "[OK] star_union_members 表已创建\n";

    $tryAlter("ALTER TABLE star_unions ADD COLUMN bound_club_id INT DEFAULT NULL");
    $tryAlter("ALTER TABLE star_unions ADD COLUMN bound_club_country VARCHAR(50) DEFAULT 'china'");
    $tryAlter("ALTER TABLE star_unions ADD COLUMN star_color VARCHAR(20) DEFAULT '#f0c060'");
    echo "[OK] star_unions 新列已添加 (bound_club_id, bound_club_country, star_color)\n";

    $tryAlter("ALTER TABLE users ADD COLUMN is_audit TINYINT(1) NOT NULL DEFAULT 0");
    echo "[OK] users.is_audit 列已添加\n";

    $tryAlter("ALTER TABLE galonly_applications ADD COLUMN booth_name VARCHAR(255) NOT NULL DEFAULT ''");
    echo "[OK] galonly_applications.booth_name 列已添加\n";
    $tryAlter("ALTER TABLE galonly_applications ADD COLUMN resubmitted TINYINT(1) NOT NULL DEFAULT 0");
    echo "[OK] galonly_applications.resubmitted 列已添加\n";
    $tryAlter("ALTER TABLE galonly_applications ADD COLUMN has_update TINYINT(1) NOT NULL DEFAULT 0");
    echo "[OK] galonly_applications.has_update 列已添加\n";

} else {
    // ==================== SQLite 建表 ====================

    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            qq_openid     TEXT UNIQUE,
            discord_id    TEXT UNIQUE,
            qq_unionid    TEXT,
            password_hash TEXT,
            username      TEXT NOT NULL UNIQUE,
            avatar_url    TEXT DEFAULT '',
            role          TEXT NOT NULL DEFAULT 'visitor'
                          CHECK(role IN ('visitor','member','manager','representative','super_admin')),
            status        TEXT NOT NULL DEFAULT 'active'
                          CHECK(status IN ('active','disabled','banned')),
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
            last_login_at TEXT
        )
    ");
    echo "[OK] users 表已创建\n";

    // 迁移：为已有数据库添加新列（如果尚不存在）
    $tryAlter = function (string $sql) use ($db) {
        try { $db->exec($sql); } catch (PDOException $e) { /* 列已存在，忽略 */ }
    };
    $tryAlter("ALTER TABLE users ADD COLUMN password_hash TEXT");
    $tryAlter("ALTER TABLE users ADD COLUMN email TEXT");
    $tryAlter("ALTER TABLE users ADD COLUMN email_verified_at TEXT");
    $tryAlter("ALTER TABLE users ADD COLUMN avatar_updated_at TEXT");
    $tryAlter("ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT ''");
    $tryAlter("ALTER TABLE users ADD COLUMN profile_bio TEXT DEFAULT ''");

    $db->exec("CREATE INDEX IF NOT EXISTS idx_users_qq ON users(qq_openid)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_users_discord ON users(discord_id)");
    $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");

    $db->exec("
        CREATE TABLE IF NOT EXISTS sessions (
            id           TEXT PRIMARY KEY,
            user_id      INTEGER NOT NULL REFERENCES users(id),
            ip_address   TEXT,
            user_agent   TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at   TEXT NOT NULL,
            is_valid     INTEGER NOT NULL DEFAULT 1
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)");
    echo "[OK] sessions 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS clubs (
            id            INTEGER PRIMARY KEY,
            province      TEXT NOT NULL DEFAULT '',
            prefecture    TEXT DEFAULT '',
            representative_id INTEGER REFERENCES users(id),
            visibility    TEXT DEFAULT 'public' CHECK(visibility IN ('public','members_only')),
            country       TEXT DEFAULT 'china'
        )
    ");
    echo "[OK] clubs 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS audit_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id),
            action      TEXT NOT NULL,
            target_type TEXT,
            target_id   INTEGER,
            details     TEXT,
            ip_address  TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)");
    echo "[OK] audit_logs 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS rate_limits (
            ip_address  TEXT NOT NULL,
            endpoint    TEXT NOT NULL,
            hit_count   INTEGER DEFAULT 1,
            window_start TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (ip_address, endpoint)
        )
    ");
    echo "[OK] rate_limits 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS notifications (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL REFERENCES users(id),
            type          TEXT NOT NULL,
            title         TEXT NOT NULL,
            message       TEXT NOT NULL,
            link          TEXT DEFAULT '',
            related_type  TEXT DEFAULT '',
            related_id    INTEGER DEFAULT 0,
            is_read       INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            read_at       TEXT
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at)");
    echo "[OK] notifications 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS announcements (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            content       TEXT NOT NULL,
            type          TEXT NOT NULL DEFAULT 'info'
                          CHECK(type IN ('info','warning','important','update')),
            status        TEXT NOT NULL DEFAULT 'draft'
                          CHECK(status IN ('draft','published')),
            is_persistent INTEGER NOT NULL DEFAULT 1,
            created_by    INTEGER NOT NULL REFERENCES users(id),
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            published_at  TEXT
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_announce_status ON announcements(status)");
    echo "[OK] announcements 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_memberships (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            club_id     INTEGER NOT NULL,
            role        TEXT NOT NULL DEFAULT 'member'
                        CHECK(role IN ('external','member','manager','representative')),
            status      TEXT NOT NULL DEFAULT 'active'
                        CHECK(status IN ('active','pending','rejected','left','kicked')),
            qq_account  TEXT DEFAULT '',
            contact_account TEXT DEFAULT '',
            apply_role  TEXT DEFAULT 'member',
            is_student  INTEGER DEFAULT 0,
            country     TEXT DEFAULT 'china',
            join_method TEXT DEFAULT 'school_no_code',
            external_club_name TEXT DEFAULT '',
            external_club_role TEXT DEFAULT '',
            apply_reason TEXT,
            joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
            left_at     TEXT,
            UNIQUE(user_id, club_id, country)
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_memberships_user ON club_memberships(user_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_memberships_club ON club_memberships(club_id)");
    echo "[OK] club_memberships 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_verification_codes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id     INTEGER NOT NULL,
            code        TEXT NOT NULL,
            created_by  INTEGER NOT NULL REFERENCES users(id),
            max_uses    INTEGER DEFAULT 50,
            use_count   INTEGER DEFAULT 0,
            expires_at  TEXT,
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_verify_codes_club ON club_verification_codes(club_id)");
    echo "[OK] club_verification_codes 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_recommendations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id     INTEGER NOT NULL,
            country     TEXT DEFAULT 'china',
            bangumi_id  INTEGER NOT NULL,
            title       TEXT NOT NULL,
            image_url   TEXT DEFAULT '',
            rating      REAL DEFAULT 0,
            summary     TEXT DEFAULT '',
            sort_order  INTEGER DEFAULT 0,
            created_by  INTEGER NOT NULL REFERENCES users(id),
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_recommendations_club ON club_recommendations(club_id, sort_order)");
    echo "[OK] club_recommendations 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_moe_kings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id       INTEGER NOT NULL,
            country       TEXT DEFAULT 'china',
            character_id  INTEGER NOT NULL,
            name          TEXT NOT NULL,
            name_cn       TEXT DEFAULT '',
            image_url     TEXT DEFAULT '',
            summary       TEXT DEFAULT '',
            updated_by    INTEGER NOT NULL REFERENCES users(id),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(club_id, country)
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_moe_kings_club ON club_moe_kings(club_id, country)");
    echo "[OK] club_moe_kings 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS club_comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id     INTEGER NOT NULL,
            country     TEXT DEFAULT 'china',
            user_id     INTEGER NOT NULL REFERENCES users(id),
            content     TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT,
            is_deleted  INTEGER DEFAULT 0
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_comments_club ON club_comments(club_id, created_at)");
    echo "[OK] club_comments 表已创建\n";

    $tryAlter("ALTER TABLE club_verification_codes ADD COLUMN country TEXT DEFAULT 'china'");
    echo "[OK] club_verification_codes.country 列已添加\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS email_verifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            email       TEXT NOT NULL,
            code        TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            used        INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verifications(user_id)");
    echo "[OK] email_verifications 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_events (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT NOT NULL,
            location          TEXT NOT NULL DEFAULT '',
            date              TEXT NOT NULL,
            registration_open INTEGER NOT NULL DEFAULT 1,
            description       TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ");
    echo "[OK] galonly_events 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_applications (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id      INTEGER NOT NULL REFERENCES galonly_events(id),
            user_id       INTEGER NOT NULL REFERENCES users(id),
            is_joint      INTEGER NOT NULL DEFAULT 0,
            joint_name    TEXT NOT NULL DEFAULT '',
            wants_upgrade INTEGER NOT NULL DEFAULT 0,
            contact       TEXT NOT NULL DEFAULT '',
            notes         TEXT,
            image_path    TEXT NOT NULL DEFAULT '',
            status        TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','approved','rejected')),
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_galonly_app_event ON galonly_applications(event_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_galonly_app_user ON galonly_applications(user_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_galonly_app_status ON galonly_applications(status)");
    echo "[OK] galonly_applications 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_application_clubs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id  INTEGER NOT NULL REFERENCES galonly_applications(id),
            club_id         INTEGER NOT NULL,
            club_country    TEXT NOT NULL DEFAULT '',
            UNIQUE(application_id, club_id)
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_galonly_app_clubs_app ON galonly_application_clubs(application_id)");
    echo "[OK] galonly_application_clubs 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS galonly_votes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id  INTEGER NOT NULL REFERENCES galonly_applications(id),
            auditer_id      INTEGER NOT NULL REFERENCES users(id),
            vote            TEXT NOT NULL CHECK(vote IN ('approve','reject')),
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(application_id, auditer_id)
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_galonly_votes_app ON galonly_votes(application_id)");
    echo "[OK] galonly_votes 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS star_unions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            region      TEXT DEFAULT '',
            country     TEXT DEFAULT 'china',
            created_by  INTEGER NOT NULL REFERENCES users(id),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            bound_club_id INTEGER DEFAULT NULL,
            bound_club_country TEXT DEFAULT 'china',
            star_color  TEXT DEFAULT '#f0c060'
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_star_unions_country ON star_unions(country)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_star_unions_created_by ON star_unions(created_by)");
    echo "[OK] star_unions 表已创建\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS star_union_members (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            union_id     INTEGER NOT NULL REFERENCES star_unions(id) ON DELETE CASCADE,
            club_id      INTEGER NOT NULL,
            club_country TEXT DEFAULT 'china',
            added_by     INTEGER REFERENCES users(id),
            added_at     TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(union_id, club_id, club_country)
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_star_union_members_union ON star_union_members(union_id)");
    echo "[OK] star_union_members 表已创建\n";

    $tryAlter("ALTER TABLE star_unions ADD COLUMN bound_club_id INTEGER DEFAULT NULL");
    $tryAlter("ALTER TABLE star_unions ADD COLUMN bound_club_country TEXT DEFAULT 'china'");
    $tryAlter("ALTER TABLE star_unions ADD COLUMN star_color TEXT DEFAULT '#f0c060'");
    echo "[OK] star_unions 新列已添加 (bound_club_id, bound_club_country, star_color)\n";

    $tryAlter("ALTER TABLE users ADD COLUMN is_audit INTEGER NOT NULL DEFAULT 0");
    echo "[OK] users.is_audit 列已添加\n";

    $tryAlter("ALTER TABLE galonly_applications ADD COLUMN booth_name TEXT NOT NULL DEFAULT ''");
    echo "[OK] galonly_applications.booth_name 列已添加\n";
    $tryAlter("ALTER TABLE galonly_applications ADD COLUMN resubmitted INTEGER NOT NULL DEFAULT 0");
    echo "[OK] galonly_applications.resubmitted 列已添加\n";
    $tryAlter("ALTER TABLE galonly_applications ADD COLUMN has_update INTEGER NOT NULL DEFAULT 0");
    echo "[OK] galonly_applications.has_update 列已添加\n";
}

moeEnsureSchema($db);
echo "[OK] moe contest tables ready\n";

twelveEnsureSchema($db);
echo "[OK] twelve contest tables ready\n";

echo "\n所有数据库表创建完成！\n";
