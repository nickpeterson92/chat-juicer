# NetSuite API Specification

## REST API v2 (SuiteTalk REST)

### Authentication
- **Method**: OAuth 2.0 or Token-Based Authentication (TBA)
- **Endpoint**: `https://{accountId}.suitetalk.api.netsuite.com/services/rest/auth`
- **Headers Required**: 
  - `Authorization: Bearer {token}`
  - `Content-Type: application/json`
  - `Prefer: transient` (for async operations)

### Sales Order Endpoints

#### Create Sales Order (Async)
- **Purpose**: Create new sales order in NetSuite
- **Method**: POST
- **Endpoint**: `/record/v1/salesOrder`
- **Request Body**:
```json
{
  "entity": {"id": "customer_internal_id"},
  "subsidiary": {"id": "subsidiary_id"},
  "tranDate": "2025-09-01",
  "otherRefNum": "SF-ORDER-12345",
  "item": [{
    "item": {"id": "item_internal_id"},
    "quantity": 10,
    "rate": 99.99
  }],
  "customFields": [{
    "fieldId": "custbody_sf_order_id",
    "value": "SO-2025-00123"
  }]
}
```
- **Response**: 
```json
{
  "transactionId": "TXN-TEMP-8374923",
  "status": "PENDING",
  "estimatedProcessingTime": 10
}
```
- **Notes**: Returns temporary transaction ID, must poll for actual order number

#### Poll Transaction Status
- **Purpose**: Get actual sales order number after async creation
- **Method**: GET
- **Endpoint**: `/transaction/v1/status/{transactionId}`
- **Response**:
```json
{
  "transactionId": "TXN-TEMP-8374923",
  "status": "COMPLETED",
  "recordType": "salesOrder",
  "internalId": "98765",
  "documentNumber": "SO-100234",
  "processingTime": 8.3
}
```
- **Polling**: Required every 5 seconds, up to 3 minutes during peak

#### Get Sales Order Status
- **Purpose**: Retrieve order status and details
- **Method**: GET
- **Endpoint**: `/record/v1/salesOrder/{internalId}`
- **Response Fields**:
  - `status`: Pending Fulfillment | Partially Fulfilled | Pending Billing | Fully Billed | Closed | Cancelled
  - `creditHoldStatus`: null | ON_HOLD | RELEASED | PENDING_REVIEW
  - `inventoryStatus`: In Stock | Backordered | Partial | Drop Ship | Special Order

#### Update Sales Order Status Webhook
- **Purpose**: NetSuite pushes status changes
- **Method**: Webhook (configured in NetSuite)
- **Payload**:
```json
{
  "eventType": "salesorder.statuschange",
  "timestamp": "2025-09-01T10:30:00Z",
  "recordId": "98765",
  "documentNumber": "SO-100234",
  "previousStatus": "Pending Fulfillment",
  "newStatus": "Partially Fulfilled",
  "creditHold": false,
  "items": [...]
}
```

### Customer Endpoints

#### Search Customer
- **Purpose**: Find customer by various criteria
- **Method**: POST
- **Endpoint**: `/query/v1/suiteql`
- **Request**:
```json
{
  "q": "SELECT id, entityid, email, creditlimit FROM customer WHERE email = :email OR custentity_as400_id = :as400id",
  "params": {
    "email": "contact@company.com",
    "as400id": "CUST-48392"
  }
}
```
- **Response**: Returns array of matching customers with internal IDs

### Subsidiary Decision Endpoint

#### Get Subsidiary for Customer
- **Purpose**: Determine correct subsidiary based on complex rules
- **Method**: POST  
- **Endpoint**: `/script/v1/customscript_subsidiary_decision`
- **Custom Logic**: Implements Excel-based decision matrix
- **Parameters**: country, state, customerType, taxId
- **Returns**: subsidiary_id

### Rate Limits & Constraints
- **Concurrency**: Max 4 parallel requests per integration user
- **Requests/Second**: 10 requests per second burst, 5 sustained
- **Async Queue**: Max 100 pending transactions
- **Timeout**: 45 seconds for sync, unlimited for async

### Error Codes
- `INVALID_SUBSIDIARY`: Subsidiary mismatch or not authorized
- `CREDIT_LIMIT_EXCEEDED`: Order exceeds available credit
- `INVALID_ITEM`: Item doesn't exist or inactive
- `DUPLICATE_EXTERNAL_ID`: Salesforce ID already exists
- `TRANSACTION_LOCK`: Record being modified by another process
- `ASYNC_QUEUE_FULL`: Too many pending async operations