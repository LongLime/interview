-- 面经贡献系统数据库初始化脚本
-- 创建时间: 2024-xx-xx

-- ============================================
-- 1. 公司表
-- ============================================
CREATE TABLE IF NOT EXISTS contribution_company (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    short_name      VARCHAR(50),
    tier            VARCHAR(20),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 预设公司数据
INSERT INTO contribution_company (name, short_name, tier) VALUES
    ('阿里巴巴', '阿里', 'T1'),
    ('字节跳动', '字节', 'T1'),
    ('腾讯', '腾讯', 'T1'),
    ('美团', '美团', 'T1'),
    ('京东', '京东', 'T1'),
    ('百度', '百度', 'T1'),
    ('华为', '华为', 'T1'),
    ('拼多多', '拼多多', 'T1'),
    ('小米', '小米', 'T2'),
    ('滴滴', '滴滴', 'T2'),
    ('快手', '快手', 'T2'),
    ('网易', '网易', 'T2'),
    ('商汤科技', '商汤', 'T2'),
    ('其他', '其他', 'T3')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 2. 面经主记录表
-- ============================================
CREATE TABLE IF NOT EXISTS contribution (
    id                      BIGSERIAL PRIMARY KEY,

    -- 贡献者信息
    contributor_id          BIGINT,
    contributor_nickname    VARCHAR(50),
    is_anonymous            BOOLEAN DEFAULT TRUE,

    -- 面试基本信息
    company_id             BIGINT REFERENCES contribution_company(id),
    department              VARCHAR(200),
    position                VARCHAR(100),
    interview_year          INTEGER,
    interview_month         INTEGER,

    -- 面试类型
    interview_type          VARCHAR(20),          -- SOCIAL/CAMPUS/INTERN
    interview_round         INTEGER DEFAULT 1,

    -- 来源与审核
    source                  VARCHAR(50) DEFAULT 'USER',
    verified                BOOLEAN DEFAULT FALSE,
    verifier_id            BIGINT,
    verified_at            TIMESTAMP,

    -- 统计
    view_count              INTEGER DEFAULT 0,
    helpful_count           INTEGER DEFAULT 0,

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT check_interview_month CHECK (interview_month >= 1 AND interview_month <= 12),
    CONSTRAINT check_interview_type CHECK (interview_type IN ('SOCIAL', 'CAMPUS', 'INTERN'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_contribution_company ON contribution(company_id);
CREATE INDEX IF NOT EXISTS idx_contribution_position ON contribution(position);
CREATE INDEX IF NOT EXISTS idx_contribution_verified ON contribution(verified);
CREATE INDEX IF NOT EXISTS idx_contribution_created ON contribution(created_at DESC);

-- ============================================
-- 3. 面试题目表
-- ============================================
CREATE TABLE IF NOT EXISTS contribution_question (
    id                  BIGSERIAL PRIMARY KEY,
    contribution_id      BIGINT REFERENCES contribution(id) ON DELETE CASCADE,

    -- 题目内容
    question_text        TEXT NOT NULL,
    follow_up_text       TEXT,

    -- 题目分类
    category_key         VARCHAR(50),
    category_label      VARCHAR(100),

    -- 题目属性
    difficulty           VARCHAR(20),           -- EASY/MEDIUM/HARD
    question_type        VARCHAR(20),           -- SINGLE/MULTI/CODING/DESIGN/DISCUSSION/BEHAVIOR

    -- 答案
    answer_text          TEXT,
    key_points           TEXT[],
    ideal_answer_hint    TEXT,

    -- AI 增强
    ai_enhanced          BOOLEAN DEFAULT FALSE,
    ai_summary           TEXT,

    -- 关联 Skill 系统
    mapped_skill_id      VARCHAR(50),
    mapped_ref_file      VARCHAR(100),

    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT check_difficulty CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    CONSTRAINT check_question_type CHECK (question_type IN ('SINGLE', 'MULTI', 'CODING', 'DESIGN', 'DISCUSSION', 'BEHAVIOR'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_question_contribution ON contribution_question(contribution_id);
CREATE INDEX IF NOT EXISTS idx_question_category ON contribution_question(category_key);

-- ============================================
-- 4. 题目知识点表
-- ============================================
CREATE TABLE IF NOT EXISTS contribution_topic (
    id                  BIGSERIAL PRIMARY KEY,
    topic_key           VARCHAR(50) NOT NULL UNIQUE,
    topic_label         VARCHAR(100) NOT NULL,
    description         TEXT,
    question_count      INTEGER DEFAULT 0,
    contribution_count  INTEGER DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_topic_key ON contribution_topic(topic_key);

-- ============================================
-- 5. 题目-知识点关联表
-- ============================================
CREATE TABLE IF NOT EXISTS contribution_question_topic (
    question_id          BIGINT REFERENCES contribution_question(id) ON DELETE CASCADE,
    topic_id             BIGINT REFERENCES contribution_topic(id) ON DELETE CASCADE,
    PRIMARY KEY (question_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_qt_question ON contribution_question_topic(question_id);
CREATE INDEX IF NOT EXISTS idx_qt_topic ON contribution_question_topic(topic_id);

-- ============================================
-- 6. 知识点与 Skill 映射表
-- ============================================
CREATE TABLE IF NOT EXISTS topic_skill_mapping (
    id                  BIGSERIAL PRIMARY KEY,
    topic_key           VARCHAR(50) NOT NULL,
    topic_label         VARCHAR(100),
    skill_id            VARCHAR(50),
    ref_file            VARCHAR(100),
    category_key        VARCHAR(50),
    source              VARCHAR(20) DEFAULT 'AUTO',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(topic_key, skill_id)
);

-- 预设映射
INSERT INTO topic_skill_mapping (topic_key, topic_label, skill_id, ref_file, category_key, source) VALUES
    ('HashMap', 'HashMap原理', 'java-backend', 'java.md', 'JAVA', 'AUTO'),
    ('HashMap扩容', 'HashMap扩容机制', 'java-backend', 'java.md', 'JAVA', 'AUTO'),
    ('ConcurrentHashMap', 'ConcurrentHashMap', 'java-backend', 'java.md', 'JAVA', 'AUTO'),
    ('JVM内存', 'JVM内存模型', 'java-backend', 'java.md', 'JVM', 'AUTO'),
    ('JVM GC', 'JVM垃圾回收', 'java-backend', 'java.md', 'JVM', 'AUTO'),
    ('Redis持久化', 'Redis持久化', 'java-backend', 'redis.md', 'REDIS', 'AUTO'),
    ('Redis缓存', 'Redis缓存问题', 'java-backend', 'redis.md', 'REDIS', 'AUTO'),
    ('MySQL索引', 'MySQL索引', 'java-backend', 'mysql.md', 'MYSQL', 'AUTO'),
    ('MySQL事务', 'MySQL事务', 'java-backend', 'mysql.md', 'MYSQL', 'AUTO'),
    ('Spring', 'Spring框架', 'java-backend', 'spring.md', 'SPRING', 'AUTO'),
    ('并发编程', '并发编程', 'java-backend', 'java.md', 'JAVA', 'AUTO'),
    ('分布式', '分布式系统', 'java-backend', 'distributed.md', 'DISTRIBUTED', 'AUTO'),
    ('消息队列', '消息队列', 'java-backend', 'mq.md', 'MQ', 'AUTO')
ON CONFLICT (topic_key, skill_id) DO NOTHING;

-- ============================================
-- 7. 预设知识点（常见面试知识点）
-- ============================================
INSERT INTO contribution_topic (topic_key, topic_label, description) VALUES
    ('HashMap', 'HashMap原理', 'HashMap底层实现、扩容机制、线程安全问题'),
    ('HashMap扩容', 'HashMap扩容机制', '负载因子、扩容时机、迁移过程'),
    ('ConcurrentHashMap', 'ConcurrentHashMap', 'JDK7分段锁 vs JDK8 CAS+synchronized'),
    ('JVM内存', 'JVM内存模型', '堆、栈、方法区、元空间'),
    ('JVM GC', 'JVM垃圾回收', 'GC算法、垃圾收集器、调优'),
    ('Redis持久化', 'Redis持久化', 'RDB、AOF、混合持久化'),
    ('Redis缓存', 'Redis缓存问题', '穿透、击穿、雪崩'),
    ('MySQL索引', 'MySQL索引', 'B+树、索引失效、最左前缀'),
    ('MySQL事务', 'MySQL事务', 'ACID、隔离级别、MVCC'),
    ('Spring', 'Spring框架', 'IoC、AOP、循环依赖'),
    ('并发编程', '并发编程', '线程安全、锁、JMM'),
    ('分布式锁', '分布式锁', '实现方式、Redisson'),
    ('消息队列', '消息队列', 'Kafka、RabbitMQ、RocketMQ'),
    ('系统设计', '系统设计', '高并发、分布式一致性'),
    ('算法', '算法与数据结构', '数组、链表、树、图、DP'),
    ('设计模式', '设计模式', '单例、工厂、代理'),
    ('微服务', '微服务', '服务拆分、网关、熔断'),
    ('Docker', 'Docker容器', '容器化、镜像、Docker Compose'),
    ('Kubernetes', 'Kubernetes', 'K8s、Pod、Service'),
    ('网络', '计算机网络', 'TCP/UDP、HTTP、HTTPS')
ON CONFLICT (topic_key) DO NOTHING;
