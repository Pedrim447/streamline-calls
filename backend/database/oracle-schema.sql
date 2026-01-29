-- ============================================
-- SCRIPTS SQL PARA BANCO DE DADOS ORACLE
-- Sistema FilaFácil - Gerenciamento de Filas
-- ============================================
-- Execute estes scripts na ordem para criar
-- todas as tabelas, índices e dados iniciais.
-- ============================================

-- ============================================
-- 1. CRIAR USUÁRIO E SCHEMA (executar como SYSDBA)
-- ============================================

-- CREATE USER filafacil IDENTIFIED BY "SuaSenhaSegura123!";
-- GRANT CONNECT, RESOURCE, CREATE SESSION TO filafacil;
-- GRANT UNLIMITED TABLESPACE TO filafacil;
-- ALTER USER filafacil DEFAULT TABLESPACE users;

-- ============================================
-- 2. TABELAS PRINCIPAIS (executar como filafacil)
-- ============================================

-- Tabela de Usuários (autenticação)
CREATE TABLE users (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    password_hash VARCHAR2(255),
    ldap_dn VARCHAR2(500),
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

COMMENT ON TABLE users IS 'Usuários do sistema para autenticação';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt da senha (NULL para usuários LDAP)';
COMMENT ON COLUMN users.ldap_dn IS 'Distinguished Name do usuário no LDAP/AD';

-- Tabela de Unidades
CREATE TABLE units (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    name VARCHAR2(255) NOT NULL,
    logo_url VARCHAR2(500),
    primary_color VARCHAR2(20) DEFAULT '#1e40af',
    secondary_color VARCHAR2(20) DEFAULT '#3b82f6',
    voice_enabled NUMBER(1) DEFAULT 1,
    voice_speed NUMBER(3,1) DEFAULT 1.0,
    voice_message_template VARCHAR2(500) DEFAULT 'Senha {ticket}, guichê {counter}',
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

COMMENT ON TABLE units IS 'Unidades/Locais de atendimento';
COMMENT ON COLUMN units.voice_enabled IS '1=Ativo, 0=Inativo';

-- Tabela de Perfis de Usuário
CREATE TABLE profiles (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    user_id RAW(16) NOT NULL,
    email VARCHAR2(255) NOT NULL,
    full_name VARCHAR2(255) NOT NULL,
    matricula VARCHAR2(50),
    cpf VARCHAR2(14),
    birth_date DATE,
    avatar_url VARCHAR2(500),
    unit_id RAW(16),
    is_active NUMBER(1) DEFAULT 1,
    current_session_id VARCHAR2(100),
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_profiles_unit FOREIGN KEY (unit_id) REFERENCES units(id),
    CONSTRAINT uk_profiles_email UNIQUE (email),
    CONSTRAINT uk_profiles_matricula UNIQUE (matricula),
    CONSTRAINT uk_profiles_cpf UNIQUE (cpf)
);

COMMENT ON TABLE profiles IS 'Perfis de usuários com dados pessoais';
COMMENT ON COLUMN profiles.current_session_id IS 'ID da sessão ativa (para controle de sessão única)';

-- Índices para profiles
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_unit_id ON profiles(unit_id);
CREATE INDEX idx_profiles_email ON profiles(LOWER(email));

-- Tabela de Roles de Usuário
CREATE TABLE user_roles (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    user_id RAW(16) NOT NULL,
    role VARCHAR2(20) NOT NULL,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_role CHECK (role IN ('admin', 'attendant', 'recepcao'))
);

COMMENT ON TABLE user_roles IS 'Roles/Permissões dos usuários';

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- Tabela de Configurações
CREATE TABLE settings (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    unit_id RAW(16) NOT NULL,
    auto_reset_daily NUMBER(1) DEFAULT 1,
    reset_time VARCHAR2(8) DEFAULT '06:00:00',
    normal_priority NUMBER(3) DEFAULT 0,
    preferential_priority NUMBER(3) DEFAULT 10,
    lock_timeout_seconds NUMBER(5) DEFAULT 30,
    max_retry_attempts NUMBER(2) DEFAULT 3,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_settings_unit FOREIGN KEY (unit_id) REFERENCES units(id),
    CONSTRAINT uk_settings_unit UNIQUE (unit_id)
);

COMMENT ON TABLE settings IS 'Configurações por unidade';

-- Tabela de Guichês
CREATE TABLE counters (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    unit_id RAW(16) NOT NULL,
    number NUMBER(3) NOT NULL,
    name VARCHAR2(100),
    is_active NUMBER(1) DEFAULT 1,
    current_attendant_id RAW(16),
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_counters_unit FOREIGN KEY (unit_id) REFERENCES units(id),
    CONSTRAINT uk_counters_unit_number UNIQUE (unit_id, number)
);

COMMENT ON TABLE counters IS 'Guichês de atendimento';
COMMENT ON COLUMN counters.current_attendant_id IS 'ID do atendente atualmente alocado';

CREATE INDEX idx_counters_unit_id ON counters(unit_id);

-- Tabela de Contadores de Tickets (sequência diária)
CREATE TABLE ticket_counters (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    unit_id RAW(16) NOT NULL,
    ticket_type VARCHAR2(20) NOT NULL,
    counter_date DATE DEFAULT TRUNC(SYSDATE) NOT NULL,
    last_number NUMBER(6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_ticket_counters_unit FOREIGN KEY (unit_id) REFERENCES units(id),
    CONSTRAINT uk_ticket_counters UNIQUE (unit_id, ticket_type, counter_date),
    CONSTRAINT chk_ticket_type CHECK (ticket_type IN ('normal', 'preferential'))
);

COMMENT ON TABLE ticket_counters IS 'Contadores de sequência de senhas por dia';

-- Tabela de Tickets (Senhas)
CREATE TABLE tickets (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    unit_id RAW(16) NOT NULL,
    ticket_number NUMBER(6) NOT NULL,
    ticket_type VARCHAR2(20) DEFAULT 'normal' NOT NULL,
    display_code VARCHAR2(10) NOT NULL,
    status VARCHAR2(20) DEFAULT 'waiting' NOT NULL,
    priority NUMBER(3) DEFAULT 0,
    client_name VARCHAR2(255),
    client_cpf VARCHAR2(14),
    attendant_id RAW(16),
    counter_id RAW(16),
    called_at TIMESTAMP,
    service_started_at TIMESTAMP,
    completed_at TIMESTAMP,
    skip_reason VARCHAR2(500),
    cancel_reason VARCHAR2(500),
    locked_at TIMESTAMP,
    locked_by RAW(16),
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_tickets_unit FOREIGN KEY (unit_id) REFERENCES units(id),
    CONSTRAINT fk_tickets_counter FOREIGN KEY (counter_id) REFERENCES counters(id),
    CONSTRAINT chk_tickets_type CHECK (ticket_type IN ('normal', 'preferential')),
    CONSTRAINT chk_tickets_status CHECK (status IN ('waiting', 'called', 'in_service', 'completed', 'cancelled', 'skipped'))
);

COMMENT ON TABLE tickets IS 'Senhas/Tickets de atendimento';
COMMENT ON COLUMN tickets.display_code IS 'Código exibido (ex: N-501, P-001)';
COMMENT ON COLUMN tickets.priority IS 'Maior número = maior prioridade';

-- Índices para tickets
CREATE INDEX idx_tickets_unit_id ON tickets(unit_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_tickets_attendant_id ON tickets(attendant_id);
CREATE INDEX idx_tickets_unit_status_date ON tickets(unit_id, status, TRUNC(created_at));

-- Tabela de Logs de Auditoria
CREATE TABLE audit_logs (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    user_id RAW(16),
    unit_id RAW(16),
    action VARCHAR2(100) NOT NULL,
    entity_type VARCHAR2(50) NOT NULL,
    entity_id RAW(16),
    details CLOB,
    ip_address VARCHAR2(50),
    user_agent VARCHAR2(500),
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

COMMENT ON TABLE audit_logs IS 'Logs de auditoria para compliance';
COMMENT ON COLUMN audit_logs.details IS 'Detalhes em formato JSON';

-- Índices para audit_logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_unit_id ON audit_logs(unit_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================
-- 3. TRIGGERS PARA UPDATED_AT
-- ============================================

CREATE OR REPLACE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_units_updated_at
BEFORE UPDATE ON units
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_settings_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_counters_updated_at
BEFORE UPDATE ON counters
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_ticket_counters_updated_at
BEFORE UPDATE ON ticket_counters
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

-- ============================================
-- 4. DADOS INICIAIS
-- ============================================

-- Criar unidade padrão
INSERT INTO units (id, name) 
VALUES (SYS_GUID(), 'Unidade Principal');

-- Criar configurações para a unidade
INSERT INTO settings (id, unit_id)
SELECT SYS_GUID(), id FROM units WHERE name = 'Unidade Principal';

-- Criar guichês iniciais (1-5)
INSERT INTO counters (id, unit_id, number, name)
SELECT SYS_GUID(), id, 1, 'Guichê 1' FROM units WHERE name = 'Unidade Principal';
INSERT INTO counters (id, unit_id, number, name)
SELECT SYS_GUID(), id, 2, 'Guichê 2' FROM units WHERE name = 'Unidade Principal';
INSERT INTO counters (id, unit_id, number, name)
SELECT SYS_GUID(), id, 3, 'Guichê 3' FROM units WHERE name = 'Unidade Principal';

-- Criar usuário admin padrão (senha: admin123)
-- IMPORTANTE: Altere a senha após primeiro login!
DECLARE
    v_user_id RAW(16);
    v_unit_id RAW(16);
BEGIN
    v_user_id := SYS_GUID();
    SELECT id INTO v_unit_id FROM units WHERE name = 'Unidade Principal';
    
    -- Senha hash para 'admin123' (bcrypt)
    INSERT INTO users (id, password_hash)
    VALUES (v_user_id, '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4/5VQ5z5kMKJ4wAu');
    
    INSERT INTO profiles (id, user_id, email, full_name, unit_id)
    VALUES (SYS_GUID(), v_user_id, 'admin@filafacil.gov.br', 'Administrador', v_unit_id);
    
    INSERT INTO user_roles (id, user_id, role)
    VALUES (SYS_GUID(), v_user_id, 'admin');
END;
/

COMMIT;

-- ============================================
-- 5. VERIFICAÇÃO
-- ============================================

SELECT 'Tabelas criadas:' AS info, COUNT(*) AS total 
FROM user_tables 
WHERE table_name IN ('USERS', 'UNITS', 'PROFILES', 'USER_ROLES', 'SETTINGS', 'COUNTERS', 'TICKETS', 'TICKET_COUNTERS', 'AUDIT_LOGS');

SELECT 'Unidades:' AS info, COUNT(*) AS total FROM units;
SELECT 'Usuários:' AS info, COUNT(*) AS total FROM users;
SELECT 'Guichês:' AS info, COUNT(*) AS total FROM counters;

-- ============================================
-- FIM DO SCRIPT
-- ============================================
