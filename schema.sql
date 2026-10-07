-- Admins table definition
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Posts table definition
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    thumbnail_url TEXT,
    slug TEXT UNIQUE NOT NULL,
    meta_title TEXT,
    meta_description TEXT,
    meta_keywords TEXT,
    status TEXT DEFAULT 'published',
    published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for slug lookups
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);

-- Migration for existing tables (adds missing columns if they don't exist)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='meta_title') THEN
        ALTER TABLE posts ADD COLUMN meta_title TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='meta_description') THEN
        ALTER TABLE posts ADD COLUMN meta_description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='meta_keywords') THEN
        ALTER TABLE posts ADD COLUMN meta_keywords TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='status') THEN
        ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'published';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='published_at') THEN
        ALTER TABLE posts ADD COLUMN published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='views') THEN
        ALTER TABLE posts ADD COLUMN views INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='updated_at') THEN
        ALTER TABLE posts ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='deleted_at') THEN
        ALTER TABLE posts ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='likes') THEN
        ALTER TABLE posts ADD COLUMN likes INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='is_private') THEN
        ALTER TABLE comments ADD COLUMN is_private BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='likes') THEN
        ALTER TABLE comments ADD COLUMN likes INTEGER DEFAULT 0;
    END IF;

    -- Add visitor_logs columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='browser') THEN
        ALTER TABLE visitor_logs ADD COLUMN browser TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='os') THEN
        ALTER TABLE visitor_logs ADD COLUMN os TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='device_model') THEN
        ALTER TABLE visitor_logs ADD COLUMN device_model TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='is_bot') THEN
        ALTER TABLE visitor_logs ADD COLUMN is_bot BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Comments table definition
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    reports INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_reports ON comments(reports);

-- Visitor logs for advanced analytics
CREATE TABLE IF NOT EXISTS visitor_logs (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    path TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    device_type TEXT, -- mobile, tablet, desktop, Crawler/Bot
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    browser TEXT,
    os TEXT,
    device_model TEXT,
    is_bot BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_visitor_logs_created_at ON visitor_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_session_id ON visitor_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_post_id ON visitor_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_is_bot ON visitor_logs(is_bot);

-- Post views table for duplicate prevention
CREATE TABLE IF NOT EXISTS post_views (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    ip_address TEXT NOT NULL,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_ip_address ON post_views(ip_address);

-- Bamboo posts table definition (익명 대나무숲 게시판)
CREATE TABLE IF NOT EXISTS bamboo_posts (
    id SERIAL PRIMARY KEY,
    author_name VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    password TEXT NOT NULL,
    client_token TEXT NOT NULL,
    likes INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    seo_title VARCHAR(255),
    slug VARCHAR(255),
    meta_title VARCHAR(255),
    meta_description TEXT,
    meta_keywords TEXT[],
    summary TEXT,
    category VARCHAR(50),
    tags TEXT[],
    seo_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    indexable BOOLEAN DEFAULT true NOT NULL,
    ai_generated_at TIMESTAMP WITH TIME ZONE,
    ai_model VARCHAR(50),
    ai_error TEXT,
    ai_retry_count INTEGER DEFAULT 0 NOT NULL,
    ai_last_attempt_at TIMESTAMP WITH TIME ZONE,
    seo_locked BOOLEAN DEFAULT false NOT NULL,
    manual_override BOOLEAN DEFAULT false NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    content_hash VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_bamboo_posts_created_at ON bamboo_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bamboo_posts_slug ON bamboo_posts(slug);
CREATE INDEX IF NOT EXISTS idx_bamboo_posts_seo_status ON bamboo_posts(seo_status);
CREATE INDEX IF NOT EXISTS idx_bamboo_posts_indexable ON bamboo_posts(indexable);

-- Forbidden words table definition (금칙어 관리)
CREATE TABLE IF NOT EXISTS forbidden_words (
    id SERIAL PRIMARY KEY,
    word VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'other', -- abuse, sexual, political, other
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed forbidden words if empty
INSERT INTO forbidden_words (word, category)
SELECT w.word, w.category FROM (
    VALUES 
    -- 욕설 (abuse)
    ('시발', 'abuse'), ('씨발', 'abuse'), ('개새끼', 'abuse'), ('병신', 'abuse'), 
    ('좆', 'abuse'), ('씹', 'abuse'), ('미친놈', 'abuse'), ('미친년', 'abuse'), 
    ('씨발놈', 'abuse'), ('씨발년', 'abuse'), ('지랄', 'abuse'), ('존나', 'abuse'), 
    ('꺼져', 'abuse'), ('닥쳐', 'abuse'),
    -- 음란 (sexual)
    ('섹스', 'sexual'), ('자위', 'sexual'), ('야동', 'sexual'), ('성인물', 'sexual'), 
    ('조건만남', 'sexual'), ('보지', 'sexual'), ('자지', 'sexual'), ('몸캠', 'sexual'),
    -- 정치비하 (political)
    ('문재앙', 'political'), ('찢재명', 'political'), ('닭근혜', 'political'), 
    ('쥐박이', 'political'), ('뇌물현', 'political'), ('대깨문', 'political'),
    ('틀딱', 'political')
) AS w(word, category)
WHERE NOT EXISTS (SELECT 1 FROM forbidden_words);

-- Bamboo comments table definition (익명 대나무숲 댓글)
CREATE TABLE IF NOT EXISTS bamboo_comments (
    id SERIAL PRIMARY KEY,
    bamboo_post_id INTEGER REFERENCES bamboo_posts(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES bamboo_comments(id) ON DELETE CASCADE,
    author_name VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    password TEXT NOT NULL,
    client_token TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bamboo_comments_post_id ON bamboo_comments(bamboo_post_id);
CREATE INDEX IF NOT EXISTS idx_bamboo_comments_parent_id ON bamboo_comments(parent_id);

-- Indexing schedules table definition
CREATE TABLE IF NOT EXISTS indexing_schedules (
    id INTEGER PRIMARY KEY DEFAULT 1,
    scheduled_hour INTEGER DEFAULT 3 NOT NULL CHECK (scheduled_hour >= 0 AND scheduled_hour <= 23),
    enabled BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO indexing_schedules (id, scheduled_hour, enabled)
SELECT 1, 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM indexing_schedules WHERE id = 1);

-- Indexing logs table definition
CREATE TABLE IF NOT EXISTS indexing_logs (
    id SERIAL PRIMARY KEY,
    trigger_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    message TEXT,
    url_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
