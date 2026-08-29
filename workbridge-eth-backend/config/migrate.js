const { pool } = require('./database');

/**
 * Idempotent migration. Safe to run on every boot — every statement uses
 * IF NOT EXISTS, and CREATE TABLE has no destructive ALTER.
 */
const schema = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  password_hash VARCHAR(255) NOT NULL,
  user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('jobseeker','employer','freelancer','model','dating','business','admin')),

  profile_photo VARCHAR(500),
  date_of_birth DATE,
  gender VARCHAR(20),
  country VARCHAR(100) DEFAULT 'Ethiopia',
  region VARCHAR(100),
  city VARCHAR(100),
  sub_city VARCHAR(100),
  full_address TEXT,

  education_level VARCHAR(100),
  school VARCHAR(255),
  field_of_study VARCHAR(255),
  skills TEXT[],
  languages TEXT[],
  experience TEXT,
  cv_url VARCHAR(500),
  certificates TEXT[],
  portfolio_url VARCHAR(500),
  salary_expectation VARCHAR(100),
  job_preference VARCHAR(100),
  availability VARCHAR(100),
  emergency_contact VARCHAR(100),
  bio TEXT,
  reason_for_work TEXT,

  company_name VARCHAR(255),
  company_logo VARCHAR(500),
  company_website VARCHAR(255),
  business_license VARCHAR(500),
  industry VARCHAR(100),
  company_description TEXT,
  employee_count INTEGER,

  height_cm INTEGER,
  weight_kg INTEGER,
  age INTEGER,
  model_photos TEXT[],
  model_experience TEXT,
  model_categories TEXT[],
  model_availability VARCHAR(100),

  dating_interests TEXT[],
  dating_photos TEXT[],
  dating_bio TEXT,
  dating_preferences JSONB,
  dating_verified BOOLEAN DEFAULT FALSE,

  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_until TIMESTAMP,
  verification_badge VARCHAR(50),

  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  otp_secret VARCHAR(255),
  otp_enabled BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP,
  login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  sub_category VARCHAR(100),
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('full-time','part-time','contract','freelance','remote','daily')),
  location VARCHAR(255),
  salary_min DECIMAL(12,2),
  salary_max DECIMAL(12,2),
  salary_currency VARCHAR(10) DEFAULT 'ETB',
  requirements TEXT[],
  benefits TEXT[],
  skills_required TEXT[],
  experience_level VARCHAR(50),
  education_required VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active','paused','filled','expired')),
  is_featured BOOLEAN DEFAULT FALSE,
  featured_until TIMESTAMP,
  applications_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id UUID REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT,
  resume_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'applied' CHECK (status IN ('applied','viewed','shortlisted','interview','hired','rejected')),
  interview_date TIMESTAMP,
  interview_notes TEXT,
  employer_rating INTEGER CHECK (employer_rating BETWEEN 1 AND 5),
  applicant_rating INTEGER CHECK (applicant_rating BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, applicant_id)
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(12,2),
  price_type VARCHAR(50) DEFAULT 'fixed' CHECK (price_type IN ('fixed','hourly','daily','negotiable')),
  currency VARCHAR(10) DEFAULT 'ETB',
  delivery_time VARCHAR(100),
  revisions INTEGER DEFAULT 1,
  images TEXT[],
  tags TEXT[],
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  is_featured BOOLEAN DEFAULT FALSE,
  rating DECIMAL(2,1) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  requirements TEXT,
  price DECIMAL(12,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','in-progress','completed','cancelled','disputed')),
  completed_at TIMESTAMP,
  buyer_rating INTEGER CHECK (buyer_rating BETWEEN 1 AND 5),
  buyer_review TEXT,
  provider_rating INTEGER CHECK (provider_rating BETWEEN 1 AND 5),
  provider_review TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dating_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  looking_for VARCHAR(50) CHECK (looking_for IN ('male','female','both')),
  age_min INTEGER,
  age_max INTEGER,
  distance_max INTEGER,
  relationship_type VARCHAR(50),
  interests TEXT[],
  hobbies TEXT[],
  about_me TEXT,
  ideal_match TEXT,
  photos TEXT[],
  is_verified BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dating_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  liker_id UUID REFERENCES users(id) ON DELETE CASCADE,
  liked_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_match BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(liker_id, liked_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text' CHECK (message_type IN ('text','image','file','voice')),
  attachment_url VARCHAR(500),
  context_type VARCHAR(50) CHECK (context_type IN ('job','service','dating','general')),
  context_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a UUID REFERENCES users(id) ON DELETE CASCADE,
  user_b UUID REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_preview TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reviewer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  context_type VARCHAR(50) NOT NULL CHECK (context_type IN ('job','service','user')),
  context_id UUID,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID,
  order_type VARCHAR(50) NOT NULL CHECK (order_type IN ('job_hire','service_order','featured_listing','premium_subscription','advertisement')),
  amount DECIMAL(12,2) NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 10.00,
  commission_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'ETB',
  payer_id UUID REFERENCES users(id),
  payee_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded')),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  target_type VARCHAR(100),
  target_id UUID,
  details JSONB,
  ip_address VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reported_id UUID REFERENCES users(id) ON DELETE CASCADE,
  report_type VARCHAR(100) NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT[],
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('job','service','user')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_id, item_type)
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image VARCHAR(500),
  tags TEXT[],
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  replaced_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_applications_job ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON job_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Widen services.price_type to include 'negotiable' (matches PRICE_TYPES in
-- service.controller.js). Safe to run on every boot: DROP IF EXISTS means
-- this is a no-op on a fresh DB where the CREATE TABLE above already has it,
-- and it fixes any DB migrated before this constraint was added.
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_price_type_check;
ALTER TABLE services ADD CONSTRAINT services_price_type_check CHECK (price_type IN ('fixed','hourly','daily','negotiable'));
`;

/**
 * Run the schema. Each statement is split on the trailing `;` and executed
 * individually so failures point at the offending statement.
 */
const migrate = async () => {
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await pool.query(stmt);
  }
};

module.exports = { migrate };
