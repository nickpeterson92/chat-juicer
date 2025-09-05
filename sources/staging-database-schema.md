# AWS RDS PostgreSQL Staging Database Schema
**Database Name:** order_staging_db  
**Purpose:** Order correlation, provisional ID management, and retry orchestration

## Core Tables

### staging_orders
Primary staging table for order correlation and processing
```sql
CREATE TABLE staging_orders (
    -- Identity & Tracking
    staging_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provisional_order_id VARCHAR(50) NOT NULL UNIQUE, -- PROV-2025-48573
    salesforce_order_id VARCHAR(18), -- a0X1234567890GHI
    netsuite_transaction_id VARCHAR(50), -- TXN-TEMP-8374923
    netsuite_order_number VARCHAR(20), -- SO-100234
    netsuite_internal_id BIGINT, -- 98765
    
    -- Correlation Keys
    salesforce_account_id VARCHAR(18) NOT NULL,
    customer_email VARCHAR(255),
    as400_customer_id VARCHAR(20), -- CUST-48392
    netsuite_customer_id BIGINT,
    duns_number VARCHAR(9),
    tax_id VARCHAR(20),
    correlation_confidence DECIMAL(3,2), -- 0.00 to 1.00
    correlation_method VARCHAR(50), -- EMAIL, AS400_ID, DUNS, COMPOSITE
    
    -- Order Data
    order_date TIMESTAMP NOT NULL,
    order_total DECIMAL(15,2) NOT NULL,
    currency_code VARCHAR(3) DEFAULT 'USD',
    salesforce_opportunity_id VARCHAR(18),
    billing_country VARCHAR(100),
    subsidiary_id INTEGER,
    subsidiary_determination_method VARCHAR(50), -- COUNTRY, EXCEL_MATRIX, MANUAL
    
    -- Processing Status
    staging_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    -- PENDING, CORRELATING, CREDIT_CHECK, AWAITING_NS, POLLING_NS, COMPLETED, FAILED
    credit_check_status VARCHAR(50),
    -- NOT_REQUIRED, PENDING, APPROVED, REJECTED, CACHE_USED, RATE_LIMITED
    inventory_status VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sf_created_at TIMESTAMP,
    ns_created_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Error Handling
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error_message TEXT,
    last_error_code VARCHAR(50),
    requires_manual_review BOOLEAN DEFAULT FALSE,
    manual_review_reason TEXT,
    
    -- Audit
    created_by VARCHAR(100) DEFAULT 'BOOMI_INTEGRATION',
    updated_by VARCHAR(100),
    boomi_execution_id VARCHAR(100),
    
    CONSTRAINT check_staging_status CHECK (
        staging_status IN ('PENDING', 'CORRELATING', 'CREDIT_CHECK', 
                          'AWAITING_NS', 'POLLING_NS', 'COMPLETED', 'FAILED')
    )
);

CREATE INDEX idx_provisional_order ON staging_orders(provisional_order_id);
CREATE INDEX idx_salesforce_order ON staging_orders(salesforce_order_id);
CREATE INDEX idx_netsuite_order ON staging_orders(netsuite_order_number);
CREATE INDEX idx_staging_status ON staging_orders(staging_status);
CREATE INDEX idx_created_at ON staging_orders(created_at);
CREATE INDEX idx_correlation ON staging_orders(salesforce_account_id, customer_email);
```

### staging_order_lines
Line items for staged orders
```sql
CREATE TABLE staging_order_lines (
    line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staging_id UUID NOT NULL REFERENCES staging_orders(staging_id),
    line_number INTEGER NOT NULL,
    
    -- Product Identification
    salesforce_product_id VARCHAR(18),
    salesforce_product_code VARCHAR(100),
    netsuite_item_id BIGINT,
    netsuite_item_name VARCHAR(255),
    is_custom_product BOOLEAN DEFAULT FALSE,
    product_correlation_status VARCHAR(50), -- MATCHED, PENDING_CREATION, FAILED
    
    -- Line Details
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(15,4) NOT NULL,
    line_total DECIMAL(15,2) NOT NULL,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    
    -- Inventory
    inventory_status VARCHAR(50),
    -- IN_STOCK, BACKORDERED, PARTIAL, DROP_SHIP, SPECIAL_ORDER
    available_quantity DECIMAL(10,2),
    vendor_id VARCHAR(20), -- For drop ship
    vendor_lead_time INTEGER, -- Days
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(staging_id, line_number)
);

CREATE INDEX idx_staging_lines ON staging_order_lines(staging_id);
```

### customer_correlation_map
Master customer correlation across systems
```sql
CREATE TABLE customer_correlation_map (
    correlation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- System IDs
    salesforce_account_id VARCHAR(18) UNIQUE,
    netsuite_customer_id BIGINT UNIQUE,
    as400_customer_id VARCHAR(20) UNIQUE,
    
    -- Matching Keys
    primary_email VARCHAR(255),
    duns_number VARCHAR(9),
    tax_id VARCHAR(20),
    
    -- Metadata
    correlation_score DECIMAL(3,2), -- Confidence score
    last_verified TIMESTAMP,
    verification_source VARCHAR(50),
    is_validated BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_sf_ns_pair UNIQUE(salesforce_account_id, netsuite_customer_id)
);

CREATE INDEX idx_email_correlation ON customer_correlation_map(primary_email);
CREATE INDEX idx_duns_correlation ON customer_correlation_map(duns_number);
```

### credit_check_cache
D&B credit check caching to handle rate limits
```sql
CREATE TABLE credit_check_cache (
    cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Customer Identity
    as400_customer_id VARCHAR(20),
    duns_number VARCHAR(9),
    customer_key VARCHAR(100) NOT NULL, -- Composite key for lookups
    
    -- Credit Data
    credit_limit DECIMAL(15,2),
    available_credit DECIMAL(15,2),
    credit_score INTEGER,
    past_due_amount DECIMAL(15,2),
    payment_terms VARCHAR(50),
    volume_discount DECIMAL(5,2),
    
    -- Cache Management
    cached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL, -- 72 hours per D&B contract
    source_system VARCHAR(20), -- DUN_BRADSTREET, AS400
    is_stale BOOLEAN DEFAULT FALSE,
    api_calls_today INTEGER DEFAULT 0, -- Track for rate limiting
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_customer_key UNIQUE(customer_key)
);

CREATE INDEX idx_cache_expiry ON credit_check_cache(expires_at);
CREATE INDEX idx_cache_customer ON credit_check_cache(as400_customer_id);
```

### netsuite_polling_queue
Track async NetSuite operations requiring polling
```sql
CREATE TABLE netsuite_polling_queue (
    poll_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staging_id UUID REFERENCES staging_orders(staging_id),
    
    -- Transaction Details
    transaction_id VARCHAR(50) NOT NULL, -- TXN-TEMP-8374923
    transaction_type VARCHAR(50), -- SALES_ORDER, CREDIT_MEMO, etc.
    
    -- Polling Status
    poll_status VARCHAR(20) DEFAULT 'PENDING',
    -- PENDING, POLLING, COMPLETED, FAILED, TIMEOUT
    poll_attempts INTEGER DEFAULT 0,
    max_poll_attempts INTEGER DEFAULT 36, -- 3 minutes at 5-second intervals
    next_poll_at TIMESTAMP,
    poll_interval_seconds INTEGER DEFAULT 5,
    
    -- Results
    result_document_number VARCHAR(50),
    result_internal_id BIGINT,
    result_status VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    timeout_at TIMESTAMP, -- created_at + 3 minutes
    
    CONSTRAINT check_poll_status CHECK (
        poll_status IN ('PENDING', 'POLLING', 'COMPLETED', 'FAILED', 'TIMEOUT')
    )
);

CREATE INDEX idx_poll_status ON netsuite_polling_queue(poll_status, next_poll_at);
CREATE INDEX idx_poll_staging ON netsuite_polling_queue(staging_id);
```

### integration_errors
Detailed error tracking for troubleshooting
```sql
CREATE TABLE integration_errors (
    error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staging_id UUID REFERENCES staging_orders(staging_id),
    
    -- Error Context
    error_source VARCHAR(50) NOT NULL, -- SALESFORCE, NETSUITE, AS400, BOOMI, DB
    error_type VARCHAR(100) NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT NOT NULL,
    
    -- Request/Response Data
    request_payload JSONB,
    response_payload JSONB,
    stack_trace TEXT,
    
    -- Resolution
    is_resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP,
    
    -- Metadata
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    boomi_execution_id VARCHAR(100),
    
    CONSTRAINT check_error_source CHECK (
        error_source IN ('SALESFORCE', 'NETSUITE', 'AS400', 'BOOMI', 'DB', 'DUN_BRADSTREET')
    )
);

CREATE INDEX idx_error_staging ON integration_errors(staging_id);
CREATE INDEX idx_error_time ON integration_errors(occurred_at);
CREATE INDEX idx_unresolved ON integration_errors(is_resolved, occurred_at);
```

### audit_log
Complete audit trail for compliance
```sql
CREATE TABLE audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staging_id UUID REFERENCES staging_orders(staging_id),
    
    -- Event Details
    event_type VARCHAR(100) NOT NULL,
    event_description TEXT,
    old_value JSONB,
    new_value JSONB,
    
    -- Context
    system_source VARCHAR(50),
    user_id VARCHAR(100),
    boomi_execution_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_staging ON audit_log(staging_id);
CREATE INDEX idx_audit_time ON audit_log(created_at);
```

## Views

### v_orders_pending_correlation
Orders needing customer correlation
```sql
CREATE VIEW v_orders_pending_correlation AS
SELECT 
    so.staging_id,
    so.provisional_order_id,
    so.salesforce_account_id,
    so.customer_email,
    so.correlation_confidence,
    so.created_at,
    CASE 
        WHEN so.customer_email LIKE '%@%' 
             AND so.customer_email NOT IN ('info@%', 'sales@%', '%@example.com')
        THEN 'EMAIL_AVAILABLE'
        WHEN so.as400_customer_id IS NOT NULL THEN 'AS400_AVAILABLE'
        WHEN so.duns_number IS NOT NULL THEN 'DUNS_AVAILABLE'
        ELSE 'NO_RELIABLE_KEY'
    END as correlation_strategy
FROM staging_orders so
WHERE so.staging_status = 'CORRELATING'
  AND so.correlation_confidence < 0.8;
```

### v_orders_stuck_polling
NetSuite polling operations that may be stuck
```sql
CREATE VIEW v_orders_stuck_polling AS
SELECT 
    pq.poll_id,
    pq.staging_id,
    pq.transaction_id,
    pq.poll_attempts,
    pq.created_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - pq.created_at))/60 as minutes_polling,
    so.provisional_order_id,
    so.salesforce_order_id
FROM netsuite_polling_queue pq
JOIN staging_orders so ON pq.staging_id = so.staging_id
WHERE pq.poll_status = 'POLLING'
  AND (pq.poll_attempts > 20 OR pq.timeout_at < CURRENT_TIMESTAMP);
```

## Stored Procedures

### sp_get_or_create_correlation
```sql
CREATE OR REPLACE FUNCTION sp_get_or_create_correlation(
    p_sf_account_id VARCHAR,
    p_email VARCHAR,
    p_as400_id VARCHAR,
    p_duns VARCHAR
) RETURNS TABLE (
    correlation_id UUID,
    netsuite_customer_id BIGINT,
    confidence_score DECIMAL
) AS $$
BEGIN
    -- Logic to find or create customer correlation
    -- Implements the complex matching logic discussed
END;
$$ LANGUAGE plpgsql;
```

## Indexes Strategy
- Covering indexes for common query patterns
- Partial indexes for status-based queries
- BRIN indexes for time-series data

## Partitioning Strategy
- Partition staging_orders by created_at (monthly)
- Partition audit_log by created_at (monthly)
- Automatic partition management via pg_partman

## Retention Policy
- staging_orders: 90 days
- integration_errors: 180 days  
- audit_log: 7 years (compliance requirement)
- credit_check_cache: 7 days after expiry