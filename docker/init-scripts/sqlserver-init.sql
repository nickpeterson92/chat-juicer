-- SQL Server Test Database Schema (Enterprise System)
-- Mix of legacy and modern, corporate naming conventions

-- tbl_Accounts (SF Account - uses tbl_ prefix, PascalCase)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tbl_Accounts' AND xtype='U')
CREATE TABLE tbl_Accounts (
    AccountID INT IDENTITY(1,1) PRIMARY KEY,
    AccountName NVARCHAR(255) NOT NULL,
    AccountType NVARCHAR(50),                   -- No enum, free text
    IndustryID INT,                             -- FK to lookup table (not included)
    AnnualRevenue MONEY,                        -- MONEY type
    NumberOfEmployees INT,
    WebsiteURL NVARCHAR(500),
    MainPhone NVARCHAR(50),
    FaxNumber NVARCHAR(50),                     -- Legacy fax field
    BillingAddress1 NVARCHAR(255),
    BillingAddress2 NVARCHAR(255),
    BillingCity NVARCHAR(100),
    BillingStateCode NVARCHAR(10),              -- State as code
    BillingZipCode NVARCHAR(20),
    BillingCountryCode NVARCHAR(3),
    ShippingAddress1 NVARCHAR(255),             -- Separate shipping address!
    ShippingAddress2 NVARCHAR(255),
    ShippingCity NVARCHAR(100),
    ShippingStateCode NVARCHAR(10),
    ShippingZipCode NVARCHAR(20),
    ShippingCountryCode NVARCHAR(3),
    CreatedDate DATETIME2 DEFAULT GETDATE(),
    ModifiedDate DATETIME2 DEFAULT GETDATE(),
    CreatedBy NVARCHAR(100),                    -- Audit fields
    ModifiedBy NVARCHAR(100),
    IsDeleted BIT DEFAULT 0                     -- Soft delete
);

-- tbl_Contacts (SF Contact)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tbl_Contacts' AND xtype='U')
CREATE TABLE tbl_Contacts (
    ContactID INT IDENTITY(1,1) PRIMARY KEY,
    AccountID INT,
    Salutation NVARCHAR(20),                    -- Mr./Mrs./Dr.
    FirstName NVARCHAR(100),
    MiddleInitial NVARCHAR(10),                 -- Just initial
    LastName NVARCHAR(100) NOT NULL,
    Suffix NVARCHAR(20),                        -- Jr./Sr./III
    EmailAddress NVARCHAR(255),
    BusinessPhone NVARCHAR(50),
    MobilePhone NVARCHAR(50),
    HomePhone NVARCHAR(50),
    JobTitle NVARCHAR(100),
    Department NVARCHAR(100),
    AssistantName NVARCHAR(100),                -- Extra field
    AssistantPhone NVARCHAR(50),
    MailingAddress1 NVARCHAR(255),
    MailingAddress2 NVARCHAR(255),
    MailingCity NVARCHAR(100),
    MailingStateCode NVARCHAR(10),
    MailingZipCode NVARCHAR(20),
    MailingCountryCode NVARCHAR(3),
    DateOfBirth DATE,
    CreatedDate DATETIME2 DEFAULT GETDATE(),
    ModifiedDate DATETIME2 DEFAULT GETDATE(),
    IsDeleted BIT DEFAULT 0,
    FOREIGN KEY (AccountID) REFERENCES tbl_Accounts(AccountID)
);

-- tbl_Opportunities (SF Opportunity)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tbl_Opportunities' AND xtype='U')
CREATE TABLE tbl_Opportunities (
    OpportunityID INT IDENTITY(1,1) PRIMARY KEY,
    AccountID INT,
    OpportunityName NVARCHAR(255) NOT NULL,
    StageID INT,                                -- FK to stage lookup
    StageName NVARCHAR(50),                     -- Denormalized stage name
    Amount MONEY,
    Probability DECIMAL(5, 2),
    CloseDate DATE,
    LeadSource NVARCHAR(100),
    OpportunityType NVARCHAR(50),
    NextStep NVARCHAR(500),
    Description NVARCHAR(MAX),
    ForecastCategory NVARCHAR(50),              -- Extra forecasting field
    ContractValue MONEY,                        -- Extra field
    ContractLength INT,                         -- Months
    IsClosed BIT DEFAULT 0,
    IsWon BIT DEFAULT 0,
    CreatedDate DATETIME2 DEFAULT GETDATE(),
    ModifiedDate DATETIME2 DEFAULT GETDATE(),
    OwnerID INT,
    FOREIGN KEY (AccountID) REFERENCES tbl_Accounts(AccountID)
);

-- tbl_Leads (SF Lead)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tbl_Leads' AND xtype='U')
CREATE TABLE tbl_Leads (
    LeadID INT IDENTITY(1,1) PRIMARY KEY,
    Salutation NVARCHAR(20),
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100) NOT NULL,
    CompanyName NVARCHAR(255),
    Title NVARCHAR(100),
    EmailAddress NVARCHAR(255),
    Phone NVARCHAR(50),
    MobilePhone NVARCHAR(50),
    Website NVARCHAR(500),
    LeadSource NVARCHAR(100),
    LeadStatus NVARCHAR(50),
    Rating NVARCHAR(20),                        -- Hot/Warm/Cold
    IndustryID INT,
    AnnualRevenue MONEY,
    NumberOfEmployees INT,
    Address1 NVARCHAR(255),
    Address2 NVARCHAR(255),
    City NVARCHAR(100),
    StateCode NVARCHAR(10),
    ZipCode NVARCHAR(20),
    CountryCode NVARCHAR(3),
    IsConverted BIT DEFAULT 0,
    ConvertedAccountID INT,
    ConvertedContactID INT,
    ConvertedOpportunityID INT,
    ConvertedDate DATETIME2,
    CreatedDate DATETIME2 DEFAULT GETDATE(),
    ModifiedDate DATETIME2 DEFAULT GETDATE(),
    OwnerID INT
);

-- tbl_Cases (SF Case)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tbl_Cases' AND xtype='U')
CREATE TABLE tbl_Cases (
    CaseID INT IDENTITY(1,1) PRIMARY KEY,
    AccountID INT,
    ContactID INT,
    CaseNumber NVARCHAR(50),
    Subject NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    Status NVARCHAR(50),
    Priority NVARCHAR(20),
    Origin NVARCHAR(50),
    CaseType NVARCHAR(50),
    CaseReason NVARCHAR(100),
    SuppliedName NVARCHAR(200),                 -- Web-to-case fields
    SuppliedEmail NVARCHAR(255),
    SuppliedPhone NVARCHAR(50),
    SuppliedCompany NVARCHAR(255),
    CreatedDate DATETIME2 DEFAULT GETDATE(),
    ClosedDate DATETIME2,
    ModifiedDate DATETIME2 DEFAULT GETDATE(),
    OwnerID INT,
    IsClosed BIT DEFAULT 0,
    IsEscalated BIT DEFAULT 0,
    FOREIGN KEY (AccountID) REFERENCES tbl_Accounts(AccountID),
    FOREIGN KEY (ContactID) REFERENCES tbl_Contacts(ContactID)
);

-- tbl_Products (SF Product2)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tbl_Products' AND xtype='U')
CREATE TABLE tbl_Products (
    ProductID INT IDENTITY(1,1) PRIMARY KEY,
    ProductName NVARCHAR(255) NOT NULL,
    ProductCode NVARCHAR(50),
    Description NVARCHAR(MAX),
    ProductFamily NVARCHAR(100),
    IsActive BIT DEFAULT 1,
    StandardPrice MONEY,
    CostPrice MONEY,
    QuantityUnitOfMeasure NVARCHAR(20),         -- Each, Box, etc.
    QuantityPerUnit INT,
    CreatedDate DATETIME2 DEFAULT GETDATE(),
    ModifiedDate DATETIME2 DEFAULT GETDATE()
);

-- Indexes
CREATE INDEX idx_Contacts_Account ON tbl_Contacts(AccountID);
CREATE INDEX idx_Contacts_Email ON tbl_Contacts(EmailAddress);
CREATE INDEX idx_Opportunities_Account ON tbl_Opportunities(AccountID);
CREATE INDEX idx_Leads_Email ON tbl_Leads(EmailAddress);
CREATE INDEX idx_Cases_Account ON tbl_Cases(AccountID);
