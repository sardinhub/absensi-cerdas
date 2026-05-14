-- Skema Database MVP Absensi Cerdas (Supabase / PostgreSQL)

-- Aktifkan ekstensi uuid-ossp jika belum aktif
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabel 1: employees
-- Menyimpan data karyawan dan referensi biometrik wajah
CREATE TABLE employees (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    face_descriptor TEXT, -- Menyimpan data vektor wajah (JSON array dari face-api.js)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabel 2: settings_config
-- Konfigurasi jam kerja, reward, dan denda
CREATE TABLE settings_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    work_start_time TIME NOT NULL DEFAULT '08:00:00',
    early_bird_time TIME NOT NULL DEFAULT '07:50:00',
    early_bird_limit_minutes INTEGER DEFAULT 10,
    early_bird_reward DECIMAL(10, 2) DEFAULT 15000.00,
    late_penalty_per_minute DECIMAL(10, 2) DEFAULT 1000.00,
    max_daily_penalty DECIMAL(10, 2) DEFAULT 50000.00, -- Maks denda per hari
    admin_password VARCHAR(255) DEFAULT '123',
    enable_geofencing BOOLEAN DEFAULT FALSE,
    office_latitude DOUBLE PRECISION DEFAULT -6.200000,
    office_longitude DOUBLE PRECISION DEFAULT 106.816666,
    allowed_radius_meters INTEGER DEFAULT 100,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert default settings
INSERT INTO settings_config (work_start_time, early_bird_time, early_bird_reward, late_penalty_per_minute, max_daily_penalty, enable_geofencing, office_latitude, office_longitude, allowed_radius_meters) 
VALUES ('08:00:00', '07:50:00', 15000.00, 1000.00, 50000.00, FALSE, -6.200000, 106.816666, 100);

-- MIGRASI: Jika tabel sudah ada, jalankan ini untuk menambah kolom baru
-- ALTER TABLE settings_config ADD COLUMN IF NOT EXISTS max_daily_penalty DECIMAL(10, 2) DEFAULT 50000.00;
-- ALTER TABLE settings_config ADD COLUMN IF NOT EXISTS enable_geofencing BOOLEAN DEFAULT FALSE;
-- ALTER TABLE settings_config ADD COLUMN IF NOT EXISTS office_latitude DECIMAL(10, 8) DEFAULT -6.200000;
-- ALTER TABLE settings_config ADD COLUMN IF NOT EXISTS office_longitude DECIMAL(11, 8) DEFAULT 106.816666;
-- ALTER TABLE settings_config ADD COLUMN IF NOT EXISTS allowed_radius_meters INTEGER DEFAULT 100;
-- ALTER TABLE settings_config ADD COLUMN IF NOT EXISTS admin_password VARCHAR(255) DEFAULT '123';
-- ALTER TABLE settings_config ADD COLUMN IF NOT EXISTS early_bird_limit_minutes INTEGER DEFAULT 10;

-- Tabel 3: attendance_logs
-- Log absensi harian dengan kalkulasi reward dan denda
CREATE TABLE attendance_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'Early Bird', 'On-Time', 'Late'
    reward_amount DECIMAL(10, 2) DEFAULT 0.00,
    penalty_amount DECIMAL(10, 2) DEFAULT 0.00,
    late_duration_minutes INT DEFAULT 0,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
