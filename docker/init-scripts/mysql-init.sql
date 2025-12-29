-- MySQL Test Database Schema (Modern SaaS Application)
-- Uses modern naming, separate fields, some extra features

-- Organizations (like SF Account)
CREATE TABLE IF NOT EXISTS organizations (
    org_id INT AUTO_INCREMENT PRIMARY KEY,
    org_name VARCHAR(255) NOT NULL,
    org_type ENUM('customer', 'prospect', 'partner', 'vendor'),  -- Enum vs picklist
    industry_name VARCHAR(100),                 -- Full name not code
    annual_revenue_usd DECIMAL(18, 2),          -- Explicit currency
    headcount INT,
    website_url VARCHAR(500),
    phone_primary VARCHAR(50),
    phone_secondary VARCHAR(50),                -- Extra phone field
    street_address VARCHAR(255),
    suite_unit VARCHAR(100),                    -- Extra address field
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),                       -- Full country name
    timezone VARCHAR(50),                       -- Extra field
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- People (SF Contact)
CREATE TABLE IF NOT EXISTS people (
    person_id INT AUTO_INCREMENT PRIMARY KEY,
    org_id INT,
    first_name VARCHAR(100),                    -- Separate first/last
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),                   -- Extra field
    email_primary VARCHAR(255),
    email_secondary VARCHAR(255),               -- Two emails
    phone_work VARCHAR(50),
    phone_mobile VARCHAR(50),
    phone_home VARCHAR(50),                     -- Extra phone
    title VARCHAR(100),
    department VARCHAR(100),
    reports_to_id INT,                          -- Manager relationship
    street_address VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    date_of_birth DATE,
    preferred_contact_method ENUM('email', 'phone', 'sms'),  -- Extra
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(org_id)
);

-- Deals (SF Opportunity)
CREATE TABLE IF NOT EXISTS deals (
    deal_id INT AUTO_INCREMENT PRIMARY KEY,
    org_id INT,
    deal_name VARCHAR(255) NOT NULL,
    pipeline_stage VARCHAR(50),                 -- Stage with different name
    deal_amount DECIMAL(18, 2),
    currency_code VARCHAR(3) DEFAULT 'USD',     -- Multi-currency support
    probability_pct DECIMAL(5, 2),              -- Allows decimals
    expected_close_date DATE,
    actual_close_date DATE,                     -- Extra field
    source VARCHAR(100),
    deal_type VARCHAR(50),
    next_action VARCHAR(500),
    notes TEXT,
    owner_id INT,                               -- Explicit owner
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    won_lost ENUM('open', 'won', 'lost'),       -- Extra status
    FOREIGN KEY (org_id) REFERENCES organizations(org_id)
);

-- Leads table (SF Lead)
CREATE TABLE IF NOT EXISTS leads (
    lead_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100),                    -- Separate names
    last_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(255),
    job_title VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    website VARCHAR(500),
    source_campaign VARCHAR(100),               -- More specific source
    source_medium VARCHAR(50),                  -- UTM-style tracking
    lead_status ENUM('new', 'contacted', 'qualified', 'nurturing', 'converted', 'disqualified'),
    industry VARCHAR(100),
    estimated_revenue DECIMAL(18, 2),
    employee_range VARCHAR(50),                 -- "10-50" instead of number
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    zip VARCHAR(20),
    country VARCHAR(100),
    converted_org_id INT,                       -- Link to converted org
    converted_person_id INT,                    -- Link to converted contact
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Support cases (SF Case)
CREATE TABLE IF NOT EXISTS support_cases (
    case_id INT AUTO_INCREMENT PRIMARY KEY,
    org_id INT,
    person_id INT,
    case_number VARCHAR(50) UNIQUE,
    subject_line VARCHAR(255) NOT NULL,
    description_text TEXT,
    case_status ENUM('new', 'in_progress', 'waiting_customer', 'escalated', 'resolved', 'closed'),
    priority ENUM('p1_critical', 'p2_high', 'p3_medium', 'p4_low'),  -- Different priority scheme
    source_channel ENUM('email', 'phone', 'chat', 'web_form', 'social'),
    case_category VARCHAR(50),
    resolution_summary TEXT,                    -- Extra field
    first_response_at TIMESTAMP,                -- SLA tracking
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(org_id),
    FOREIGN KEY (person_id) REFERENCES people(person_id)
);

-- Products (SF Product2)
CREATE TABLE IF NOT EXISTS products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(50) UNIQUE,
    description TEXT,
    product_family VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    base_price DECIMAL(15, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    recurring_type ENUM('one_time', 'monthly', 'annual'),  -- Extra
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_people_org ON people(org_id);
CREATE INDEX idx_people_email ON people(email_primary);
CREATE INDEX idx_deals_org ON deals(org_id);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_cases_org ON support_cases(org_id);
