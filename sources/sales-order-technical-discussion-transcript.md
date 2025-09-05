# Sales Order Integration Technical Deep Dive
**Date:** September 3, 2025  
**Attendees:** Sarah Chen (Client CTO), Marcus Williams (Client IT Director), David Park (Client Sales Ops), Rachel Torres (Client NetSuite Admin), Alex Rodriguez (Lead Consultant), Jordan Kim (Integration Architect), Sam Patel (Technical Consultant)

---

## Meeting Transcript

**Alex Rodriguez:** Alright everyone, now that we've selected Boomi, let's dive deep into the sales order integration requirements. David, can you walk us through the current process?

**David Park:** Sure. Sales creates quotes in Salesforce, converts to orders, and then... well, that's where our pain starts. We manually enter them into NetSuite, usually batch processing at end of day.

**Rachel Torres:** [interrupting] That's not entirely accurate, David. The finance team often has to create the orders mid-day for priority customers. And there's the whole credit check situation...

**David Park:** [defensive] Well, that's not the standard process—

**Sarah Chen:** Let's focus on what actually happens, not what the process document says. Rachel, tell us about these credit checks.

**Rachel Torres:** NetSuite runs credit checks through Dun & Bradstreet. If a customer fails, the order goes on credit hold. Currently, nobody in sales knows about the hold until they call asking where their shipment is.

**Jordan Kim:** So we need bidirectional sync. Order status updates from NetSuite back to Salesforce. What about the credit check itself - is that real-time?

**Rachel Torres:** It's supposed to be, but D&B has rate limits. We can only make 100 calls per hour. During month-end, we hit that limit by noon.

**Sam Patel:** [taking notes] That's concerning. How many orders require credit checks?

**David Park:** New customers always. Existing customers only if the order exceeds their credit limit or they have past-due invoices.

**Marcus Williams:** Which is about 30% of orders. But here's what David isn't mentioning - Salesforce doesn't have the credit limit data. That lives in our old ERP system.

**Alex Rodriguez:** [surprised] Wait, there's another system? The requirements only mentioned Salesforce and NetSuite.

**Sarah Chen:** [sighs] Marcus, I thought we migrated everything to NetSuite last year.

**Marcus Williams:** Customer master data, yes. But the credit management module still runs on the AS/400. We have a nightly batch that updates NetSuite.

**Jordan Kim:** [concerned] So NetSuite doesn't have real-time credit limits either?

**Rachel Torres:** It gets worse. The AS/400 generates its own customer IDs. We maintain a mapping table in NetSuite, but sometimes new customers get created in Salesforce before they exist in the AS/400.

**Sam Patel:** How do you handle that mapping?

**David Park:** We use the email address as a match key.

**Rachel Torres:** [frustrated] When it exists! Half our B2B customers use generic emails like info@ or sales@. I've been telling David for months—

**David Park:** [defensive] Sales needs to create orders immediately after verbal confirmation. We can't wait for IT to create customer records in three systems!

**Alex Rodriguez:** Let's take a breath. Sam, what are you thinking for correlation?

**Sam Patel:** We'll need a composite key. Email alone won't work. What about tax ID or DUNS number?

**Rachel Torres:** Tax IDs are optional in Salesforce. Sales skips it.

**David Park:** Because customers don't have it handy during sales calls!

**Jordan Kim:** What about the sales order numbers? How are those generated?

**David Park:** Salesforce auto-generates them. SO-2024-XXXXX format.

**Rachel Torres:** NetSuite won't accept those. We use a different format, and the numbers must be sequential with no gaps - it's an audit requirement.

**Sam Patel:** So we need to let NetSuite generate the order numbers and update Salesforce?

**Rachel Torres:** Yes, but there's a timing issue. NetSuite's order creation API is asynchronous. It returns a transaction ID, not the order number. You have to poll for the actual order number.

**Jordan Kim:** How long does that take?

**Rachel Torres:** Usually 5-10 seconds. During month-end processing? Could be 2-3 minutes.

**David Park:** [agitated] Sales can't wait 3 minutes to give customers an order confirmation!

**Sarah Chen:** What about inventory allocation? When does that happen?

**Rachel Torres:** That's another fun one. NetSuite checks inventory during order creation, but actual allocation happens when the order is approved. If inventory isn't available, it creates the order anyway but puts it on backorder status.

**David Park:** Which Salesforce doesn't understand! We have a custom field for inventory status, but it's just a text field. Sales has been putting anything in there - "Available", "In Stock", "plenty", "check warehouse"...

**Sam Patel:** [rubbing temples] We'll need to standardize those values. What are the valid statuses in NetSuite?

**Rachel Torres:** In Stock, Backordered, Partial, Drop Ship, or Special Order. But here's the kicker - for Drop Ship items, we need the vendor lead time, which comes from... 

**Marcus Williams:** The AS/400. Of course.

**Alex Rodriguez:** Are there any other integrations touching these orders?

**David Park:** Oh, the commission calculator reads from Salesforce.

**Sarah Chen:** [sharp] What commission calculator?

**David Park:** The one sales ops built. It's a Lambda function that triggers off Opportunity close.

**Jordan Kim:** But we're syncing Orders, not Opportunities.

**David Park:** Right, but the Order has to link back to the Opportunity for commission calculation. The Lambda reads the Order to get the actual products shipped versus what was quoted.

**Sam Patel:** When does this Lambda run?

**David Park:** Every hour during business hours.

**Rachel Torres:** [laughs bitterly] Which explains why sales is always complaining about wrong commission calculations. They're reading orders before NetSuite processes returns or adjustments.

**Marcus Williams:** Speaking of returns, how do we handle those?

**Rachel Torres:** Returns are created in NetSuite as RMA records. They reference the original sales order but have their own transaction type.

**David Park:** Salesforce doesn't have RMAs. We've been using negative quantity line items.

**Rachel Torres:** [exasperated] Which breaks our revenue recognition! Finance has been manually adjusting—

**Sarah Chen:** [firmly] Okay, stop. Alex, what are we looking at here?

**Alex Rodriguez:** [carefully] This is more complex than the initial requirements suggested. We have shadow integrations, a third system with critical data, async APIs with polling requirements, and data quality issues.

**Jordan Kim:** The D&B rate limiting is particularly concerning. Sam, thoughts on caching?

**Sam Patel:** We could cache credit scores in Salesforce, but for how long? Credit can change daily.

**Rachel Torres:** Our contract with D&B actually requires us to refresh credit scores every 72 hours for active transactions.

**David Park:** Nobody told sales about that!

**Marcus Williams:** There's one more thing. Our NetSuite instance is multi-subsidiary. Each subsidiary has different tax rules, revenue recognition rules, and approval workflows.

**Jordan Kim:** How does Salesforce know which subsidiary to use?

**David Park:** There's a picklist field based on the billing country.

**Rachel Torres:** [shaking her head] It's not that simple. US companies could be under our Canadian subsidiary for tax purposes. We have a whole decision matrix in Excel.

**Sam Patel:** Is that logic documented anywhere besides Excel?

**Rachel Torres:** I have SQL queries that implement most of it. But there are exceptions that only I know about.

**Sarah Chen:** Rachel, what happens if you're sick during month-end?

**Rachel Torres:** [quietly] That's why I haven't taken vacation in two years.

**Alex Rodriguez:** [making notes] We need to capture this tribal knowledge in the integration logic. What about order modifications?

**David Park:** Sales can modify orders in Salesforce until they're shipped.

**Rachel Torres:** [incredulous] No, they can't! Once an order is in NetSuite, changes have to go through change order process. There's an approval workflow!

**David Park:** Then why does sales keep editing orders?

**Rachel Torres:** Because you never check if it's been sent to NetSuite! You just change it and wonder why the customer gets the original items!

**Marcus Williams:** The Salesforce-NetSuite status sync was supposed to prevent that.

**Jordan Kim:** What status sync?

**Marcus Williams:** The one the previous consultants built. It's a scheduled job that runs every... actually, I'm not sure it's still running.

**Sam Patel:** [checking laptop] I don't see any integration user activity in the last six months.

**Sarah Chen:** [frustrated] So we've been flying blind for six months?

**Alex Rodriguez:** Let's refocus on moving forward. We need to map out all these dependencies. What about products? How are those synced?

**Rachel Torres:** Products are mastered in NetSuite. We have a nightly sync to Salesforce.

**David Park:** Which doesn't include custom products! Sales creates those directly in Salesforce for special deals.

**Rachel Torres:** Those aren't real products! They're just placeholder SKUs. NetSuite rejects them.

**David Park:** Then how are we selling them?

**Rachel Torres:** I manually create them in NetSuite when I see the errors. Usually takes me 2-3 days to catch up.

**Jordan Kim:** [writing furiously] We need real-time product sync. Or at least validation before order creation.

**Sam Patel:** What about pricing? Where's the source of truth?

**David Park:** Salesforce has the price books.

**Rachel Torres:** NetSuite has the actual prices! Salesforce prices are just suggestions. We have customer-specific pricing in NetSuite based on contracts.

**Marcus Williams:** Some of which are volume-based with retroactive adjustments.

**Alex Rodriguez:** [long pause] Okay. This is going to need a phased approach. We can't solve all of this in one integration.

**Sarah Chen:** What's your recommendation?

**Jordan Kim:** Phase 1: Basic order flow with standard products and existing customers. Get the foundation working.

**Sam Patel:** Phase 2: Credit checks and inventory allocation. Add the AS/400 integration.

**Alex Rodriguez:** Phase 3: Custom products, pricing synchronization, and returns.

**David Park:** How long are we talking?

**Jordan Kim:** Originally we said 10-12 weeks. With these complexities... we're looking at 16-18 weeks for all three phases.

**Sarah Chen:** [sighs] And I suppose the budget needs adjustment too?

**Alex Rodriguez:** We'll need to add at least 40% for the additional scope. The AS/400 integration alone—

**Marcus Williams:** [interrupting] Actually, there's an API. We just found out last week. It's SOAP-based and uses custom XML schemas, but it exists.

**Sam Patel:** [sarcastically] Of course it's SOAP. Is it documented?

**Marcus Williams:** There's a Word document from 2015. In German.

**Rachel Torres:** The AS/400 was implemented by our German subsidiary. They maintain it.

**Jordan Kim:** What about authentication?

**Marcus Williams:** Client certificates. The certificates expire every 90 days and have to be manually renewed through a portal that only works in Internet Explorer.

**Sam Patel:** [head in hands] Internet Explorer was discontinued.

**Marcus Williams:** We have a Windows 2012 server specifically for certificate renewal.

**Sarah Chen:** [standing up] I need a break. And possibly a drink. Let's reconvene in 15 minutes.

**Alex Rodriguez:** Good idea. Team, let's use the break to digest this and come back with a realistic plan.

---

## [After Break]

**Sarah Chen:** Alright, what's the real situation here?

**Alex Rodriguez:** It's complex but manageable. The key is not trying to fix everything at once. We need to stabilize the current state first, then improve incrementally.

**Jordan Kim:** The biggest risk is the correlation logic. Without reliable customer matching, orders will get lost or duplicated.

**Sam Patel:** I suggest we implement a staging database in AWS. We'll need something like RDS PostgreSQL to hold orders while we correlate data from all three systems. Boomi can orchestrate the flow, but we need persistent storage for the correlation logic.

**Rachel Torres:** That could work. But what about the real-time requirement? And who maintains this database?

**Marcus Williams:** We already have AWS RDS instances for other applications. IT can provision a new PostgreSQL instance.

**Sam Patel:** Perfect. Real-time doesn't mean instantaneous. If we can get orders flowing in under 5 minutes, that's huge improvement over daily batches.

**David Park:** Sales expects to see the order number immediately.

**Jordan Kim:** We can return a provisional order ID from Boomi immediately, then update with the NetSuite order number when it's available.

**Marcus Williams:** Two order numbers? That'll confuse everyone.

**Alex Rodriguez:** Not if we're clear about it. "Order Received" status with provisional ID, then "Order Confirmed" with the NetSuite ID.

**Sarah Chen:** What about the credit checks?

**Sam Patel:** We implement smart caching. Check D&B first, if we hit rate limits, use cached data if it's less than 72 hours old. Flag for manual review if older.

**Rachel Torres:** I can live with that.

**David Park:** But what about the commission calculator?

**Jordan Kim:** That needs to be redesigned regardless. It should trigger on order status changes, not on a schedule.

**Sarah Chen:** Agreed. Marcus, can your team handle that?

**Marcus Williams:** If we get proper documentation of the new integration events, yes.

**Alex Rodriguez:** We'll provide comprehensive webhook documentation. Now, about that German API...

**Marcus Williams:** [laughing] I'll get it translated. My nephew speaks German.

**Sarah Chen:** [smiling for the first time] This is why we pay consultants. To tell us our baby is ugly but fixable.

**Alex Rodriguez:** Every integration has skeletons. The key is acknowledging them early. Should we start documenting the actual requirements?

**Sarah Chen:** Yes. And this time, let's document what actually happens, not what we wish happened.

---

## Meeting Outcome

**Identified Complexities:**
- Third system (AS/400) involvement with critical credit data
- Customer correlation challenges across three systems
- Asynchronous NetSuite API requiring polling
- D&B rate limiting (100 calls/hour)
- Multi-subsidiary logic in Excel/tribal knowledge
- Existing Lambda function dependencies
- SOAP API with German documentation
- Certificate renewal requiring deprecated browser
- Product mastering inconsistencies
- Price book synchronization issues
- Undocumented change order process
- Non-functioning existing integration

**Agreed Approach:**
- Phase 1: Core order flow (6 weeks)
- Phase 2: Credit and inventory (6 weeks)
- Phase 3: Advanced features (6 weeks)
- AWS RDS PostgreSQL for staging/correlation database
- Smart caching for credit checks
- Provisional order ID strategy
- Boomi orchestration with cloud database persistence

**Next Steps:**
1. Document true current state
2. Translate AS/400 documentation
3. Design correlation strategy
4. Map subsidiary decision logic
5. Create phased implementation plan