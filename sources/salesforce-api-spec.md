# Salesforce API Specification

## REST API v59.0

### Authentication
- **Method**: OAuth 2.0 (JWT Bearer Flow for Integration)
- **Token Endpoint**: `https://login.salesforce.com/services/oauth2/token`
- **Instance URL**: `https://{instance}.salesforce.com`
- **Session Duration**: 2 hours (configurable)
- **Concurrent Session Limit**: 10 per integration user

### Sales Order Objects (Custom)

#### Create Sales Order
- **Purpose**: Create order from converted opportunity
- **Method**: POST
- **Endpoint**: `/services/data/v59.0/sobjects/Sales_Order__c`
- **Request Body**:
```json
{
  "Name": "AUTO-GENERATED",
  "Opportunity__c": "0061234567890ABC",
  "Account__c": "0011234567890DEF", 
  "Order_Date__c": "2025-09-01",
  "Status__c": "Draft",
  "Billing_Country__c": "United States",
  "Order_Total__c": 9999.00,
  "External_Order_Number__c": "",
  "Provisional_Order_ID__c": "PROV-2025-48573",
  "NetSuite_Sync_Status__c": "Pending",
  "Credit_Status__c": "Not Checked",
  "Inventory_Status_Text__c": "plenty"
}
```
- **Returns**: Salesforce ID immediately (e.g., "a0X1234567890GHI")

#### Create Sales Order Line Items
- **Purpose**: Add products to sales order
- **Method**: POST
- **Endpoint**: `/services/data/v59.0/composite/sobjects`
- **Batch Request**:
```json
{
  "records": [{
    "attributes": {"type": "Sales_Order_Line__c"},
    "Sales_Order__c": "a0X1234567890GHI",
    "Product2Id": "01t1234567890JKL",
    "Quantity__c": 10,
    "Unit_Price__c": 99.99,
    "Custom_Product__c": false,
    "Special_Terms__c": ""
  }]
}
```

#### Update Order with NetSuite Response
- **Purpose**: Update after NetSuite processing
- **Method**: PATCH
- **Endpoint**: `/services/data/v59.0/sobjects/Sales_Order__c/{salesforce_id}`
- **Update Fields**:
```json
{
  "External_Order_Number__c": "SO-100234",
  "NetSuite_Internal_ID__c": "98765",
  "NetSuite_Sync_Status__c": "Synced",
  "Status__c": "Confirmed",
  "Last_Sync_Date__c": "2025-09-01T10:30:00Z"
}
```

### Account (Customer) Endpoints

#### Get Account with Credit Info
- **Purpose**: Retrieve customer details
- **Method**: GET
- **Endpoint**: `/services/data/v59.0/sobjects/Account/{account_id}`
- **Key Fields**:
  - `Id`: Salesforce Account ID
  - `Name`: Company name
  - `Email__c`: Primary contact email (often generic)
  - `Tax_ID__c`: Federal Tax ID (frequently null)
  - `DUNS_Number__c`: D&B DUNS (optional)
  - `Credit_Limit__c`: Cached from AS/400 (may be stale)
  - `Credit_Score__c`: Cached from D&B
  - `Credit_Last_Updated__c`: Timestamp of last credit check
  - `AS400_Customer_ID__c`: Legacy system reference
  - `NetSuite_Internal_ID__c`: NetSuite customer ID

### Product Endpoints

#### Query Products
- **Purpose**: Get product catalog
- **Method**: GET  
- **Endpoint**: `/services/data/v59.0/query`
- **SOQL Query**: 
```
SELECT Id, Name, ProductCode, IsActive, 
       Custom_Product__c, NetSuite_Item_ID__c,
       Last_Sync_From_NetSuite__c
FROM Product2 
WHERE IsActive = true 
  AND (Custom_Product__c = false OR CreatedDate > LAST_N_DAYS:7)
```

### Opportunity Endpoints

#### Get Opportunity for Commission
- **Purpose**: Source data for commission calculation
- **Method**: GET
- **Endpoint**: `/services/data/v59.0/sobjects/Opportunity/{opp_id}`
- **Commission-Relevant Fields**:
  - `Amount`: Original opportunity value
  - `CloseDate`: When deal was closed
  - `OwnerId`: Sales rep for commission
  - `Related_Orders__r`: Child relationship to Sales_Order__c

### Platform Events (Webhooks)

#### Order Status Change Event
- **Purpose**: Publish order status changes
- **Platform Event**: `Order_Status_Change__e`
- **Publishing**: Via Process Builder or Flow
- **Payload Structure**:
```json
{
  "Order_ID__c": "a0X1234567890GHI",
  "Old_Status__c": "Draft",
  "New_Status__c": "Confirmed", 
  "NetSuite_Order_Number__c": "SO-100234",
  "Changed_By__c": "Integration User",
  "Change_Timestamp__c": "2025-09-01T10:30:00Z"
}
```

### Custom Metadata

#### Subsidiary Mapping (Custom Metadata Type)
- **Object**: `Subsidiary_Mapping__mdt`
- **Purpose**: Store subsidiary decision rules
- **Fields**: Country__c, State__c, Customer_Type__c, Subsidiary_ID__c
- **Access**: Read-only via API, maintained via UI

### API Limits & Governors

- **API Calls**: 1,000,000 per 24 hours (Enterprise Edition)
- **Concurrent Requests**: 25 long-running, 100 total
- **SOQL Queries**: 100 per transaction
- **DML Statements**: 150 per transaction
- **Bulk API**: 10,000 records per batch
- **Streaming API**: 1,000,000 events per day

### Error Responses

- `DUPLICATE_VALUE`: Duplicate external ID or unique field
- `FIELD_CUSTOM_VALIDATION_EXCEPTION`: Validation rule failure
- `INSUFFICIENT_ACCESS_OR_READONLY`: Permission issue
- `INVALID_FIELD_FOR_INSERT_UPDATE`: Field not createable/updateable
- `STORAGE_LIMIT_EXCEEDED`: Org data storage full
- `REQUEST_LIMIT_EXCEEDED`: Governor limit hit

### Known Issues & Workarounds

1. **Generic Emails**: Email field unreliable for matching (info@, sales@)
2. **Tax ID Optional**: Cannot rely on Tax_ID__c for correlation
3. **Free Text Fields**: Inventory_Status_Text__c has inconsistent values
4. **Custom Products**: Created directly in SF without NetSuite validation
5. **Commission Lambda**: Reads orders hourly, missing real-time updates