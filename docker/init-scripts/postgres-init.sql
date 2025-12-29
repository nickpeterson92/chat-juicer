-- PostgreSQL Test Database Schema (Legacy ERP System)
-- Uses older naming conventions, combined fields, different structures

-- Customer master (like SF Account, but different structure)
CREATE TABLE IF NOT EXISTS customer_master (
    cust_id SERIAL PRIMARY KEY,
    cust_name VARCHAR(255) NOT NULL,           -- Maps to Account.Name but different column name
    cust_type_cd VARCHAR(10),                  -- 'CUST', 'PROS', 'PART' - needs value mapping
    industry_code VARCHAR(20),                 -- Industry but as code not label
    revenue_amt NUMERIC(15, 2),                -- Slightly different name
    emp_cnt INTEGER,
    web_url VARCHAR(255),
    main_phone VARCHAR(50),
    addr_line1 VARCHAR(255),                   -- Address combined differently
    addr_line2 VARCHAR(255),
    city VARCHAR(100),
    state_prov VARCHAR(100),
    zip_postal VARCHAR(20),
    country_cd VARCHAR(3),                     -- ISO country code, not full name
    create_dt TIMESTAMP DEFAULT NOW(),
    update_dt TIMESTAMP DEFAULT NOW(),
    active_flag CHAR(1) DEFAULT 'Y'            -- Y/N instead of boolean
);

-- Contact persons (SF Contact equivalent)
CREATE TABLE IF NOT EXISTS contact_persons (
    contact_id SERIAL PRIMARY KEY,
    cust_id INTEGER REFERENCES customer_master(cust_id),
    full_name VARCHAR(200) NOT NULL,           -- Combined! Would need split for SF first/last
    email_addr VARCHAR(255),
    work_phone VARCHAR(50),
    cell_phone VARCHAR(50),
    job_title VARCHAR(100),
    dept VARCHAR(100),
    addr_line1 VARCHAR(255),
    addr_line2 VARCHAR(255),
    city VARCHAR(100),
    state_prov VARCHAR(100),
    zip_postal VARCHAR(20),
    country_cd VARCHAR(3),
    birth_dt DATE,
    create_dt TIMESTAMP DEFAULT NOW(),
    update_dt TIMESTAMP DEFAULT NOW()
);

-- Sales opportunities (SF Opportunity)
CREATE TABLE IF NOT EXISTS sales_oppty (
    oppty_id SERIAL PRIMARY KEY,
    cust_id INTEGER REFERENCES customer_master(cust_id),
    oppty_desc VARCHAR(255) NOT NULL,          -- Name vs desc
    stage_cd VARCHAR(20),                      -- Stage as code
    deal_value NUMERIC(15, 2),                 -- Amount with different name
    win_pct INTEGER,                           -- Probability
    target_close_dt DATE,
    source_cd VARCHAR(50),                     -- Lead source as code
    oppty_type_cd VARCHAR(20),
    notes TEXT,
    create_dt TIMESTAMP DEFAULT NOW(),
    update_dt TIMESTAMP DEFAULT NOW(),
    sales_rep_id INTEGER                       -- Extra field not in SF default
);

-- Prospect table (SF Lead equivalent - but different structure)
CREATE TABLE IF NOT EXISTS prospects (
    prospect_id SERIAL PRIMARY KEY,
    contact_name VARCHAR(200),                 -- Combined first/last
    company_name VARCHAR(255),
    job_title VARCHAR(100),
    email VARCHAR(255),
    phone_nbr VARCHAR(50),
    mobile_nbr VARCHAR(50),
    website VARCHAR(255),
    source_channel VARCHAR(100),               -- Lead source
    status_cd VARCHAR(20),                     -- Status as code
    industry_cd VARCHAR(50),
    est_revenue NUMERIC(15, 2),
    approx_employees INTEGER,
    full_address TEXT,                         -- All address in one field!
    create_dt TIMESTAMP DEFAULT NOW(),
    update_dt TIMESTAMP DEFAULT NOW(),
    assigned_to VARCHAR(100)                   -- Owner as name not ID
);

-- Support tickets (SF Case)
CREATE TABLE IF NOT EXISTS support_tickets (
    ticket_id SERIAL PRIMARY KEY,
    cust_id INTEGER REFERENCES customer_master(cust_id),
    contact_id INTEGER REFERENCES contact_persons(contact_id),
    ticket_nbr VARCHAR(50) UNIQUE,
    title VARCHAR(255) NOT NULL,               -- Subject
    description TEXT,
    status VARCHAR(30),
    priority_level INTEGER,                    -- Numeric instead of Low/Med/High
    channel VARCHAR(30),                       -- Origin
    category VARCHAR(50),                      -- Type
    root_cause VARCHAR(100),                   -- Reason
    opened_dt TIMESTAMP DEFAULT NOW(),
    closed_dt TIMESTAMP,
    last_modified_dt TIMESTAMP DEFAULT NOW(),
    sla_due_dt TIMESTAMP                       -- Extra SLA field
);

-- Item catalog (SF Product2)
CREATE TABLE IF NOT EXISTS item_catalog (
    item_id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    item_sku VARCHAR(50) UNIQUE,               -- Product code
    item_desc TEXT,
    category VARCHAR(100),                     -- Family
    status CHAR(1) DEFAULT 'A',                -- A/I instead of boolean
    list_price NUMERIC(15, 2),
    cost_price NUMERIC(15, 2),                 -- Extra field
    create_dt TIMESTAMP DEFAULT NOW(),
    update_dt TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_cust ON contact_persons(cust_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contact_persons(email_addr);
CREATE INDEX IF NOT EXISTS idx_oppty_cust ON sales_oppty(cust_id);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
CREATE INDEX IF NOT EXISTS idx_tickets_cust ON support_tickets(cust_id);
