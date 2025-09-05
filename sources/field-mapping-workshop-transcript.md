# Field Mapping Workshop
**Date:** September 5, 2025  
**Attendees:** David Park (Sales Ops), Rachel Torres (NetSuite Admin), Marcus Williams (IT Director), Jordan Kim (Integration Architect), Sam Patel (Technical Consultant)
**Duration:** 3 hours (supposed to be 1 hour)

---

## Meeting Transcript

**Jordan Kim:** Good morning everyone. Today we're doing the field mapping workshop. Should be straightforward - we'll map Salesforce fields to NetSuite fields. I have a template we'll fill out.

**David Park:** Great, I brought our Salesforce data dictionary. We have the Sales Order object and Sales Order Lines.

**Rachel Torres:** And I have the NetSuite record browser open. Let's start with the basics.

### Hour 1: The Simple Mappings

**Jordan Kim:** Let's start with Order Date. In Salesforce it's Order_Date__c, type Date.

**Rachel Torres:** Maps to tranDate in NetSuite. Also Date type. Direct mapping.

**Sam Patel:** [typing] Perfect. Next - Order Total?

**David Park:** Order_Total__c, currency field.

**Rachel Torres:** That's... hmm. In NetSuite, the total is calculated from line items. You can't set it directly.

**Jordan Kim:** So we'll need to validate that the totals match after line items are added?

**Rachel Torres:** Yes, and if they don't match, the order gets rejected. We've had issues with penny differences due to rounding.

**Sam Patel:** [sighs] Noting that as a validation rule. What about the order number?

**David Park:** Salesforce generates it automatically. Format is SO-2025-XXXXX.

**Rachel Torres:** NetSuite won't accept that. We need sequential numbers with no gaps. Audit requirement.

**Jordan Kim:** So we can't use the Salesforce number at all?

**David Park:** Sales needs to give customers an order number immediately!

**Sam Patel:** What if we use the Salesforce number as a provisional ID, then update it with the NetSuite number?

**Rachel Torres:** That could work. We have a custom field custbody_provisional_id we could use.

**David Park:** But then we have TWO order numbers? That's confusing.

**Jordan Kim:** [making notes] We'll need to handle this carefully in the UI. Moving on - customer field?

**David Park:** Account__c, it's a lookup to the Account object.

**Rachel Torres:** In NetSuite it's entity, which is an integer - the internal ID.

**Sam Patel:** How do we map a Salesforce ID to a NetSuite integer?

**Rachel Torres:** That's the correlation problem we discussed. We need to look up the NetSuite customer ID based on... something.

**David Park:** Email address?

**Rachel Torres:** [laughs] Half our customers use info@ or sales@. Plus Salesforce allows multiple contacts with the same email.

### Hour 2: The Correlation Nightmare

**Jordan Kim:** Let's tackle this customer correlation properly. What fields do we have?

**David Park:** In Salesforce: Account ID, Name, Email__c, Tax_ID__c, DUNS_Number__c, and we added AS400_Customer_ID__c last month.

**Rachel Torres:** Tax_ID__c is optional though. Sales rarely fills it out.

**David Park:** Customers don't have their tax ID ready during sales calls!

**Marcus Williams:** The AS400_Customer_ID__c is only populated for existing customers. New customers won't have it.

**Sam Patel:** So for new customers, we have no reliable correlation key?

**Rachel Torres:** Correct. I've been manually matching them based on company name and address.

**Jordan Kim:** [worried] That's not scalable. What about the DUNS number?

**David Park:** Also optional. We only have it for about 60% of accounts.

**Sam Patel:** We'll need a correlation table then. Try email first, then DUNS, then AS400 ID, then fuzzy matching on name?

**Rachel Torres:** And flag the low-confidence matches for manual review.

**Jordan Kim:** [typing] Adding correlation confidence score to the mapping. What about products?

**David Park:** Product2Id in Salesforce, links to our Product2 object.

**Rachel Torres:** NetSuite uses item, which is an integer internal ID.

**Sam Patel:** Another correlation problem?

**Rachel Torres:** No, products are mastered in NetSuite. We sync them to Salesforce nightly. The NetSuite_Item_ID__c field has the mapping.

**David Park:** Except for custom products.

**Rachel Torres:** [frustrated] David, those aren't real products! Sales just makes them up!

**David Park:** We need flexibility for special deals! Sometimes we bundle things or create custom SKUs.

**Rachel Torres:** And then NetSuite rejects the entire order because item ID 'CUSTOM-DEAL-123' doesn't exist!

**Jordan Kim:** How do you handle this today?

**Rachel Torres:** I manually create them in NetSuite when I see the errors. Sometimes takes 2-3 days.

**Sam Patel:** [adding to mapping] Custom_Product__c boolean - if true, flag for manual creation. Order blocked until resolved.

### Hour 3: The Edge Cases

**Jordan Kim:** Let's talk about pricing. Unit_Price__c in Salesforce?

**Rachel Torres:** It's rate in NetSuite, but here's the thing - NetSuite might override it.

**David Park:** Override it? Sales quotes specific prices!

**Rachel Torres:** Contract pricing takes precedence. If the customer has a volume agreement, NetSuite recalculates.

**David Park:** Then the customer gets a different price than quoted?

**Rachel Torres:** It's usually lower due to volume discounts. But yes, it can be different.

**Marcus Williams:** This explains the commission calculation issues.

**Jordan Kim:** Speaking of which, how do we maintain the link for commissions?

**David Park:** The Opportunity__c field links the order back to the opportunity.

**Rachel Torres:** NetSuite doesn't have opportunities. We'd need a custom field.

**Sam Patel:** custbody_sf_opportunity?

**Rachel Torres:** That works. But Jordan, there's something else about line items.

**Jordan Kim:** What now?

**Rachel Torres:** Quantity. In Salesforce it's a number field, allows decimals.

**David Park:** Yeah, we sell fractional units for some products. Like 2.5 licenses.

**Rachel Torres:** NetSuite inventory items only allow whole numbers. Service items allow decimals.

**Sam Patel:** How do you know which is which?

**Rachel Torres:** You have to query the item type in NetSuite first.

**Jordan Kim:** [rubbing eyes] So before we can map the quantity, we need to know the product type?

**Rachel Torres:** Correct. And if someone orders 2.5 units of an inventory item, we need to round up or reject it.

**David Park:** Round up? The customer pays for 3 when they ordered 2.5?

**Rachel Torres:** Or we reject the order and sales has to fix it.

**Marcus Williams:** What about that Inventory_Status_Text__c field?

**David Park:** Oh, that shows if items are in stock.

**Sam Patel:** Text field? What are the valid values?

**David Park:** Well... sales reps type whatever makes sense.

**Jordan Kim:** [checking Salesforce] I'm seeing: "plenty", "lots available", "In Stock", "yes", "good amount", "check warehouse", "backordered maybe"...

**Rachel Torres:** [head in hands] NetSuite has five valid values: In Stock, Backordered, Partial, Drop Ship, Special Order.

**Sam Patel:** We'll need transformation rules. "plenty" maps to "In Stock", "none" to "Backordered"...

**David Park:** What about "check warehouse"?

**Sam Patel:** Default to "Unknown" and flag for review?

**Jordan Kim:** Almost done. What about Credit_Status__c?

**David Park:** That's supposed to show if the customer's credit is approved.

**Marcus Williams:** It's populated from the AS400, remember?

**Rachel Torres:** But the field in Salesforce is just text. I've seen "good", "OK", "approved", "HOLD", "credit hold", "CHECK REQUIRED"...

**Sam Patel:** [frustrated] Another standardization mapping. 

**Jordan Kim:** Wait, where does the actual credit limit come from?

**Marcus Williams:** AS400 has it. We cache it in Salesforce's Credit_Limit__c field.

**Rachel Torres:** "Cache" is generous. It's updated nightly. Could be 24 hours stale.

**David Park:** What about the credit score?

**Marcus Williams:** That's from D&B, cached for 72 hours per our contract.

**Sam Patel:** But with the rate limiting...

**Marcus Williams:** Right, only 100 calls per hour.

**Jordan Kim:** [looking at growing mapping document] This is way more complex than expected.

**Rachel Torres:** Now you see why I haven't taken vacation in two years.

**David Park:** Can't we just map the fields we're sure about and figure out the rest later?

**Sam Patel:** That's how you end up with a broken integration and manual processes.

**Jordan Kim:** We need to map everything properly. Including edge cases and transformations.

**Rachel Torres:** Don't forget Status__c. 

**David Park:** That's just "Draft", "Confirmed", "Shipped", "Closed".

**Rachel Torres:** NetSuite has "Pending Approval", "Pending Fulfillment", "Partially Fulfilled", "Pending Billing", "Partially Billed", "Fully Billed", "Closed", "Cancelled".

**Sam Patel:** So "Confirmed" maps to... "Pending Fulfillment"?

**Rachel Torres:** Unless it's on credit hold, then it stays "Pending Approval".

**David Park:** How does sales know the difference?

**Rachel Torres:** They don't. That's why they keep calling asking about orders.

**Marcus Williams:** We should add Credit_Hold__c as a separate field.

**Jordan Kim:** [typing] Added. Anything else?

**Rachel Torres:** Ship status is separate from order status.

**David Park:** We don't have a ship status field.

**Rachel Torres:** That explains why sales doesn't know when things ship.

**Sam Patel:** Should we add one?

**David Park:** Yes! Ship_Status__c. 

**Jordan Kim:** Mapping it to NetSuite's shipStatus. What else?

**Rachel Torres:** Special terms on line items?

**David Park:** Special_Terms__c, it's a long text field.

**Rachel Torres:** Maps to description in NetSuite but has a 4000 character limit.

**Sam Patel:** Truncate with warning if over limit?

**Rachel Torres:** That works.

**Jordan Kim:** [exhausted] I think we have everything. 43 field mappings with transformation rules.

**Marcus Williams:** This was supposed to be a simple integration.

**Rachel Torres:** There's no such thing as a simple integration.

**Sam Patel:** At least now we know what we're dealing with. I'll create the formal mapping document.

**David Park:** Will this handle all our edge cases?

**Jordan Kim:** Most of them. But I guarantee we'll find more during testing.

**Rachel Torres:** [sarcastically] Can't wait.

---

## Meeting Outcome

**Mapping Complexity Discovered:**
- 43 fields requiring mapping
- 15 fields need transformation rules
- 12 fields have data quality issues
- Customer correlation requires multi-key approach
- Product correlation works except for custom products
- Multiple fields using free text that need standardization
- Credit data comes from multiple sources with different refresh rates
- Status mapping is many-to-many, not one-to-one

**Next Steps:**
1. Sam to create formal mapping document (CSV format)
2. David to work on data quality in Salesforce
3. Rachel to document all NetSuite validation rules
4. Marcus to investigate AS400 field availability
5. Jordan to design transformation engine in Boomi

**Time Overrun:** Meeting scheduled for 1 hour, took 3 hours