# Design Document: Salesforce to NetSuite Sales Order Integration

## Executive Summary
We will implement a phased, production-ready integration to automate sales order flow from Salesforce to NetSuite using Boomi as the integration platform and an AWS RDS PostgreSQL staging database for correlation and orchestration. The integration addresses customer correlation across Salesforce, NetSuite and an AS/400 credit system, handles asynchronous NetSuite order creation, and implements caching to mitigate D&B rate limits. Expected benefits: elimination of manual order entry, improved order visibility, and reduced processing time from 24 hours to under 1 hour for typical orders.

## Problem Statement
Current process is manual and error prone: sales creates orders in Salesforce and finance re-enters them in NetSuite. Complications include: inconsistent customer/product correlation across systems, an AS/400 credit system with client certificate auth and EBCDIC data, NetSuite async order processing, D&B rate limiting, and a multi-subsidiary Excel-based decision matrix with no audit trail.

## Proposed Solution
Use Boomi AtomSphere for orchestration, an RDS PostgreSQL staging database (order_staging_db) to persist and correlate incoming orders, and implement the following high-level flow:
- Receive order and line items from Salesforce
- Validate and normalize fields (inventory status, quantities, prices)
- Correlate customer using composite logic (AS400 ID, DUNS, email, fuzzy match)
- Perform credit check (AS/400 primary, D&B fallback with cache)
- Create order in NetSuite via SuiteTalk REST (async), store transaction id and poll
- Update Salesforce with NetSuite order number and status
Provide manual review queues and alerting for low-confidence correlation, custom products, and failed operations.

### Integration Approach
- Low-code orchestration in Boomi with reusable components
- Persistent staging in RDS PostgreSQL for correlation, retries and auditing
- API integrations: Salesforce REST v59, NetSuite REST v2 (async), AS/400 SOAP (client cert), D&B credit API
- Webhooks from NetSuite for status changes where possible
- Smart caching for D&B to respect 100 calls/hour contract (72 hour TTL)

### Key Components
- Salesforce (source of orders and line items)
- Boomi (integration orchestration, transformations, retries)
- AWS RDS PostgreSQL order_staging_db (correlation, polling queue, error logs)
- NetSuite (target ERP via SuiteTalk REST async)
- AS/400 (credit and master data via SOAP with client certs)
- D&B credit API (rate limited, cached)
- Monitoring and alerting (PagerDuty/Slack/email) and daily reconciliation reports

## Technical Architecture
A high-level architecture is below (Mermaid diagram).

### System Architecture Diagram
```mermaid
graph TB
    SF[Salesforce] --> BOOMI[Boomi Integration]
    BOOMI --> STDB[Staging DB - order_staging_db]
    BOOMI --> AS400[AS400 Credit System]
    BOOMI --> DNB[DnB Credit API]
    STDB --> BOOMI
    BOOMI --> NS[NetSuite API v2]
    NS --> BOOMI
    BOOMI --> SF
```

### Data Flow Sequence Diagram
```mermaid
sequenceDiagram
    participant SF as Salesforce
    participant BI as Boomi
    participant DB as StagingDB
    participant A4 as AS400
    participant NB as NetSuite

    SF->>BI: Post Order + Line Items
    BI->>DB: Persist staging record (provisional ID)
    BI->>A4: Query credit by AS400ID or Email
    BI->>DB: Update credit cache
    BI->>NB: Create Sales Order Async
    NB-->>BI: TransactionId
    BI->>DB: Insert netsuite_polling_queue
    BI->>NB: Poll Transaction Status
    NB-->>BI: OrderNumber + InternalId
    BI->>SF: Update Order with NetSuite number and Status
```

### Process Flow Diagram
```mermaid
flowchart TD
    START([Order Created in Salesforce]) --> VALIDATE[Validate & Normalize]
    VALIDATE --> CORRELATE{Customer Correlation Confidence}
    CORRELATE -->|High| CREDIT_CHECK[Credit Check]
    CORRELATE -->|Low| MANUAL[Send to Manual Review]
    CREDIT_CHECK -->|Approved| CREATE_NS[Create Order in NetSuite Async]
    CREDIT_CHECK -->|On Hold| HOLD[Set Credit Hold and Notify]
    CREATE_NS --> POLL[Enqueue Polling]
    POLL --> POLL_LOOP[Poll NetSuite Status]
    POLL_LOOP -->|Success| UPDATE_SF[Update Salesforce with NS Number]
    POLL_LOOP -->|Timeout| ESCALATE[Flag for Manual Review]
    UPDATE_SF --> COMPLETE([Complete])
```

### State Transition Diagram
```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> CORRELATING
    CORRELATING --> CREDIT_CHECK
    CREDIT_CHECK --> AWAITING_NS
    AWAITING_NS --> POLLING_NS
    POLLING_NS --> COMPLETED
    POLLING_NS --> FAILED
    FAILED --> AWAITING_MANUAL
    AWAITING_MANUAL --> COMPLETED
```

### Entity Relationship Diagram
```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--o{ LINE : contains
    CUSTOMER {
        string salesforce_account_id PK
        string netsuite_customer_id
        string as400_customer_id
        string email
    }
    ORDER {
        uuid staging_id PK
        string provisional_order_id
        string salesforce_order_id
        string netsuite_order_number
        decimal order_total
        timestamp order_date
    }
    LINE {
        uuid line_id PK
        uuid staging_id FK
        string product_id
        decimal quantity
        decimal unit_price
    }
```

### Component Interaction Diagram
```mermaid
graph LR
    subgraph "Source Layer"
        SF[Salesforce]
    end
    subgraph "Processing Layer"
        BI[Boomi Integration]
        DB[Staging DB - order_staging_db]
    end
    subgraph "External Systems"
        NS[NetSuite API v2]
        A4[AS400 Credit System]
        DNB[DnB Credit API]
    end
    SF --> BI
    BI --> DB
    BI --> NS
    BI --> A4
    BI --> DNB
```

## Implementation Plan
Deliver as three phases with clear acceptance criteria and automation for retries and monitoring.

### Phase Breakdown
- Phase 1 (6 weeks): Core order flow
  - Receive orders from Salesforce, persist provisional ID, basic correlation using NetSuite_Item_ID and AS400_Customer_ID where available, create NetSuite orders async, implement polling queue and update Salesforce with NetSuite number.
  - Deliverables: Boomi processes for order receive, staging DB schema and endpoints, NetSuite creation component, SF update flow, daily reconciliation report.
- Phase 2 (6 weeks): Credit and inventory
  - Integrate AS/400 SOAP credit checks, implement credit_check_cache, D&B fallback with TTL caching, inventory status normalization, vendor lead time for drop ship items.
  - Deliverables: AS/400 connector config, credit cache management, inventory transformation rules, monitoring for rate limits.
- Phase 3 (6 weeks): Advanced features & hardening
  - Subsidiary decision engine (migrate Excel logic into staged service), custom product handling (manual creation queue), commission event stream redesign, resilience and performance tuning.
  - Deliverables: Subsidiary decision microservice or stored procedures, manual product creation workflow, SLA testing, runbooks.

### Data Mappings
Primary mappings are captured in sources/salesforce-netsuite-field-mapping.csv. Key rules:
- Provisional Order ID: generated in Boomi and stored in Sales_Order__c.Provisional_Order_ID__c and NetSuite custbody_provisional_id
- Customer correlation: prefer AS400 ID > NetSuite internal ID > DUNS > email fuzzy match; store correlation_confidence in staging_orders
- Inventory status: normalize free text to NetSuite values (e.g., "plenty"->"In Stock")
- Quantities: map decimals, but validate item type in NetSuite; reject or round per config
- Prices: send unit_price but accept NetSuite overrides; validate totals after item creation

### Error Handling Strategy
- Persist all inbound orders to staging_orders with staging_status and retry_count
- Use netsuite_polling_queue to manage async operations and limit poll attempts (default 36 attempts at 5s intervals)
- integration_errors table captures request/response payload for troubleshooting
- Automatic retries with exponential backoff up to max_retries (default 3) for transient errors
- Escalate to manual review and create task notifications for low-confidence correlation, custom products, or repeated failures
- Alerts: Slack/PagerDuty for critical failures (e.g., AS/400 certificate invalid, NetSuite async timeout)

## Success Metrics
- Functional: 99.9% uptime for integration flows
- Performance: 95% of orders processed end-to-end within 5 minutes (provisional ID to NetSuite confirmed)
- Accuracy: <0.1% data mapping failures after go-live
- Operations: Manual review queue size < 1% of daily order volume within 30 days of go-live

## Technical Specifications
- Boomi runtime for orchestration; use environment-specific Atoms (dev/stage/prod)
- RDS PostgreSQL (order_staging_db) with monthly partitioning and retention policies
- NetSuite: SuiteTalk REST v2 async create and transaction status polling; adhere to concurrency limits
- Salesforce: REST v59.0 for order creation and updates; use Platform Events for status notifications
- AS/400: SOAP 1.2 over HTTPS with X.509 client certificate; EBCDIC conversion routines required
- D&B: rate-limited credit API with TTL cache (72 hours)

### Database Schema
Staging DB schema and objects are defined in sources/staging-database-schema.md. Key tables: staging_orders, staging_order_lines, customer_correlation_map, credit_check_cache, netsuite_polling_queue, integration_errors, audit_log.

### API Integrations
- Salesforce: JWT Bearer OAuth 2.0 for integration user; endpoints for Sales_Order__c and composite sObjects
- NetSuite: OAuth2 or TBA for authentication; POST /record/v1/salesOrder (async) and GET /transaction/v1/status/{transactionId}
- AS/400: SOAP operations getCreditInfo and updateUtilization; WSDL: https://as400.company-frankfurt.de:8443/CMMS/CreditService?wsdl
- D&B: credit score API with contractual limits 100 calls/hour

### Transformation Rules
- Date format: convert Salesforce dates to YYYY-MM-DD for NetSuite
- Decimal handling: convert EBCDIC European decimal formats from AS/400 to standard decimal points
- Inventory status mapping: implement deterministic mapping table for free text -> NetSuite enums
- Subsidiary decision: migrate Excel matrix into deterministic rules in DB or microservice; maintain audit trail for every decision
- Provisional order strategy: assign PROV-{YYYY}-{SEQ} and replace after NetSuite confirmation

## Risks and Mitigations
- AS/400 client certificate renewal is manual and brittle -> Mitigation: automate certificate monitoring and create scheduled certificate renewal runbook; maintain a renewal VM if needed
- D&B rate limits causing blocked orders -> Mitigation: aggressive caching and fallback rules; surface manual review when cache stale
- Customer correlation errors causing order duplication -> Mitigation: confidence scoring, staged manual review, and protective dedup logic
- Subsidiary Excel logic causing tax compliance issues -> Mitigation: extract and validate rules with tax/legal, build decision engine and audit log before cutover
- NetSuite async queue delay during peak -> Mitigation: scale Boomi polling workers, monitor netsuite_polling_queue, implement backpressure and user notifications

## Timeline
Assuming project kickoff on 2025-09-15:
- Phase 1 complete: ~2025-10-27 (6 weeks)
- Phase 2 complete: ~2025-12-08 (additional 6 weeks)
- Phase 3 complete: ~2026-01-19 (additional 6 weeks)
Milestones: design review, integration test, UAT, go/no-go, production cutover.

---
*References: source materials used to generate this design document are in the project repository under the sources/ directory, including:*
- sources/requirements-client-draft.md
- sources/salesforce-netsuite-field-mapping.csv
- sources/staging-database-schema.md
- sources/as400-legacy-api-spec.md
- sources/netsuite-api-spec.md
- sources/salesforce-api-spec.md
- sources/sales-order-technical-discussion-transcript.md
- sources/field-mapping-workshop-transcript.md
- sources/subsidiary-mapping-crisis-transcript.md

*Generated from template: design-doc.md*
