# AS/400 Legacy System API Specification
*Credit Management & Master Data System (CMMS)*

## SOAP Web Service v1.2 (Legacy)

### Overview
- **System**: IBM AS/400 (iSeries) 
- **Location**: German Data Center (Frankfurt)
- **Protocol**: SOAP 1.2 over HTTPS
- **Encoding**: UTF-8 (despite German origin)
- **WSDL**: `https://as400.company-frankfurt.de:8443/CMMS/CreditService?wsdl`
- **Original Documentation**: German (2015)
- **Maintenance Window**: Sunday 02:00-06:00 CET

### Authentication

#### Client Certificate Authentication
- **Certificate Type**: X.509 Client Certificate
- **Validity**: 90 days
- **Renewal Process**: Manual via legacy portal
- **Portal URL**: `https://cert.company-frankfurt.de:9443/renewal`
- **Portal Requirements**: Internet Explorer 11 (Compatibility Mode)
- **Certificate Store**: Windows Certificate Store (Personal)
- **Key Details**:
  - Algorithm: RSA 2048-bit
  - Signature: SHA-256
  - Subject: `/CN=INTEGRATION_USER/O=COMPANY/C=DE`

#### SOAP Security Headers
```xml
<soap:Header>
  <wsse:Security>
    <wsse:BinarySecurityToken 
      EncodingType="Base64Binary"
      ValueType="X509v3">
      {BASE64_CERTIFICATE}
    </wsse:BinarySecurityToken>
    <Signature>
      <SignedInfo>
        <CanonicalizationMethod Algorithm="xml-c14n"/>
        <SignatureMethod Algorithm="rsa-sha256"/>
      </SignedInfo>
    </Signature>
  </wsse:Security>
  <SystemContext>
    <RequestID>{UUID}</RequestID>
    <Timestamp>{ISO8601}</Timestamp>
    <SourceSystem>BOOMI</SourceSystem>
  </SystemContext>
</soap:Header>
```

### Credit Management Endpoints

#### GetCustomerCredit
- **Purpose**: Retrieve real-time credit limit and score
- **Operation**: `getCreditInfo`
- **SOAP Action**: `http://as400.company.de/credit/getCreditInfo`
- **Request**:
```xml
<soap:Envelope>
  <soap:Body>
    <cms:GetCreditInfoRequest>
      <cms:CustomerIdentifier>
        <cms:AS400ID>CUST-48392</cms:AS400ID>
        <!-- OR -->
        <cms:AlternateID type="EMAIL">contact@company.com</cms:AlternateID>
      </cms:CustomerIdentifier>
      <cms:IncludeHistory>false</cms:IncludeHistory>
      <cms:Currency>USD</cms:Currency>
    </cms:GetCreditInfoRequest>
  </soap:Body>
</soap:Envelope>
```
- **Response**:
```xml
<soap:Envelope>
  <soap:Body>
    <cms:GetCreditInfoResponse>
      <cms:CustomerData>
        <cms:AS400ID>CUST-48392</cms:AS400ID>
        <cms:CreditLimit>50000.00</cms:CreditLimit>
        <cms:AvailableCredit>23847.93</cms:AvailableCredit>
        <cms:CreditScore>742</cms:CreditScore>
        <cms:LastReviewDate>2025-08-15</cms:LastReviewDate>
        <cms:PaymentTerms>NET30</cms:PaymentTerms>
        <cms:VolumeDiscount>5.5</cms:VolumeDiscount>
        <cms:PastDueAmount>0.00</cms:PastDueAmount>
        <cms:DUNSNumber>049384759</cms:DUNSNumber>
      </cms:CustomerData>
    </cms:GetCreditInfoResponse>
  </soap:Body>
</soap:Envelope>
```

#### UpdateCreditUtilization
- **Purpose**: Update credit usage after order creation
- **Operation**: `updateUtilization`
- **Note**: Must be called within 30 seconds of credit check
- **Request**:
```xml
<cms:UpdateUtilizationRequest>
  <cms:AS400ID>CUST-48392</cms:AS400ID>
  <cms:OrderAmount>15234.50</cms:OrderAmount>
  <cms:OrderReference>SO-100234</cms:OrderReference>
  <cms:TransactionType>RESERVE</cms:TransactionType>
</cms:UpdateUtilizationRequest>
```

### Customer Master Endpoints

#### GetCustomerMapping
- **Purpose**: Retrieve customer ID mappings across systems
- **Operation**: `getSystemMapping`
- **Request Fields**:
  - SearchKey: Email, AS400ID, DUNSNumber, TaxID
  - TargetSystems: Array of [SALESFORCE, NETSUITE, AS400]
- **Response**: Returns all known system IDs for customer

#### CreateCustomerMapping
- **Purpose**: Register new customer across systems
- **Operation**: `createMapping`
- **Important**: Generates AS400 ID using German naming convention
- **ID Format**: `CUST-{YEAR}{SEQUENTIAL}`
- **Sequence Resets**: January 1st annually

### Vendor Master Endpoints

#### GetVendorLeadTime
- **Purpose**: Get drop-ship vendor lead times
- **Operation**: `getVendorInfo`
- **Request**:
```xml
<cms:GetVendorInfoRequest>
  <cms:VendorCode>VNDR-3847</cms:VendorCode>
  <cms:ShipToCountry>US</cms:ShipToCountry>
  <cms:ItemList>
    <cms:ItemCode>WIDGET-100</cms:ItemCode>
    <cms:Quantity>50</cms:Quantity>
  </cms:ItemList>
</cms:GetVendorInfoRequest>
```
- **Response**: Lead time in business days (German holidays excluded)

### Batch Endpoints

#### NightlyCustomerSync
- **Purpose**: Batch endpoint for nightly sync
- **Operation**: `batchCustomerExport`
- **Schedule**: 01:00 CET daily
- **Format**: Fixed-width EBCDIC (requires conversion)
- **FTP Location**: `ftp://as400.company-frankfurt.de/EXPORT/CUSTOMERS.DAT`
- **Record Layout**: See Appendix A (German documentation)

### Rate Limits & Constraints

- **Max Connections**: 5 concurrent
- **Timeout**: 30 seconds
- **Message Size**: Max 1MB request, 5MB response
- **Batch Window**: Real-time disabled 01:00-03:00 CET
- **Throttling**: 100 requests per minute
- **Circuit Breaker**: 5 consecutive failures triggers 5-minute lockout

### Error Codes

- `CUST_NOT_FOUND`: Customer ID not in system
- `CREDIT_CALC_ERROR`: Credit calculation engine failure
- `INVALID_CERT`: Certificate expired or not recognized
- `SYSTEM_MAINT`: System in maintenance window
- `EBCDIC_CONV_ERR`: Character set conversion failure
- `SEQ_EXHAUSTED`: Annual sequence number limit reached (99999)
- `LOCKOUT_ACTIVE`: Circuit breaker triggered

### Special Considerations

1. **Time Zones**: All timestamps in CET/CEST (German time)
2. **Decimal Format**: European format (comma separator)
3. **Date Format**: DD.MM.YYYY in responses
4. **Character Set**: Mixed EBCDIC/UTF-8 depending on endpoint
5. **Null Values**: Represented as "NIL" not null
6. **German Holidays**: System operates skeleton crew on German holidays
7. **Y2K Field**: Some fields still use 2-digit years (legacy)

### Appendix A: EBCDIC Field Mappings
```
Position  Length  Field Name          Type
001-010   10      CUSTOMER_ID         CHAR
011-050   40      CUSTOMER_NAME       CHAR
051-070   20      CREDIT_LIMIT        DECIMAL(18,2)
071-090   20      AVAILABLE_CREDIT    DECIMAL(18,2)
091-093   3       CREDIT_SCORE        NUMERIC
094-101   8       LAST_REVIEW         DATE(DDMMYYYY)
```

### Known Issues

1. **Certificate Portal**: Only works in IE11, Windows 2012 Server required
2. **SOAP Faults**: Generic "SYSTEM ERROR" for all failures
3. **Correlation**: No unique request ID returned
4. **Monitoring**: No health check endpoint
5. **Documentation**: Comments in German, variable names mixed German/English
6. **Timeout Behavior**: Silently drops connection, no error returned
7. **Decimal Precision**: Randomly rounds to 2 or 4 decimal places