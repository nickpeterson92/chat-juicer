# Emergency Subsidiary Mapping Session
**Date:** September 8, 2025  
**Attendees:** Sarah Chen (CTO), Rachel Torres (NetSuite Admin), Marcus Williams (IT Director), Janet Foster (CFO), Carlos Martinez (Tax Director), Alex Rodriguez (Lead Consultant), Jordan Kim (Integration Architect)
**Context:** Called after discovering subsidiary logic lives in Excel file on Rachel's laptop

---

## Meeting Transcript

**Sarah Chen:** [visibly frustrated] Can someone explain why our multi-million dollar ERP system is routing orders based on an Excel file on Rachel's laptop?

**Rachel Torres:** It's not just on my laptop. I email it to finance monthly.

**Janet Foster:** We've never received that email.

**Rachel Torres:** I send it to Tom in tax.

**Carlos Martinez:** Tom retired six months ago.

**Rachel Torres:** [pause] That explains why no one's been complaining about updates.

**Sarah Chen:** Rachel, walk us through this Excel file.

**Rachel Torres:** [sharing screen] It's pretty straightforward. Column A is billing country, Column B is state if applicable, Column C is customer type, Column D is tax ID prefix, Column E is whether revenue exceeds $1 million, and Column F tells you which subsidiary.

**Jordan Kim:** [counting] That's... 35 different routing rules?

**Rachel Torres:** 37 actually. Two hidden rows for exceptions.

**Marcus Williams:** Why isn't this logic in NetSuite?

**Rachel Torres:** NetSuite's subsidiary assignment is basic. It can't handle our complex rules.

**Carlos Martinez:** Complex is underselling it. We have 17 subsidiaries across 12 countries.

**Alex Rodriguez:** Let's understand the logic. What drives subsidiary assignment?

### The US Complexity

**Rachel Torres:** Starting with the US - seems simple but it's not. California B2B goes to US West Corp, subsidiary 1.

**Carlos Martinez:** Unless they're B2C, then it's US Consumer LLC, subsidiary 3.

**Rachel Torres:** Right. But New York B2B goes to US East Corp, subsidiary 2.

**Jordan Kim:** What's the geographic dividing line?

**Rachel Torres:** [laughs] There isn't one. Texas goes to West, Florida goes to East. It's based on where we have nexus and tax registrations.

**Carlos Martinez:** And Delaware is special. Large B2B goes to US Holdings Inc for tax optimization.

**Janet Foster:** Define "large."

**Rachel Torres:** Revenue over $1 million annually.

**Marcus Williams:** How do we know their revenue?

**Rachel Torres:** I manually check in the AS400 before month-end close.

**Sarah Chen:** Manually?

**Rachel Torres:** The integration can't make that decision in real-time.

### The Canadian Exception

**Jordan Kim:** What about Canada?

**Carlos Martinez:** Canada is actually five different tax scenarios. Ontario and general Canada go to subsidiary 5, Canada Corp.

**Rachel Torres:** Except Quebec. They require subsidiary 6, Quebec Inc, because of different tax laws.

**Carlos Martinez:** And BC has PST on top of GST, Alberta has no PST. Same subsidiary but different tax treatment.

**Janet Foster:** How does the system know which taxes to apply?

**Rachel Torres:** It doesn't. I have formulas in cells G through J that calculate it.

**Jordan Kim:** The tax calculation is also in Excel?

**Rachel Torres:** Just the rules. NetSuite applies them... usually.

### The European Maze

**Alex Rodriguez:** Let's talk about Europe.

**Carlos Martinez:** [sighs deeply] Europe is why I drink.

**Rachel Torres:** Large German customers go to Germany GmbH, subsidiary 10.

**Carlos Martinez:** But small German customers go through Netherlands, subsidiary 11, EU Operations BV.

**Jordan Kim:** Why?

**Carlos Martinez:** VAT optimization. Netherlands has favorable tax treaties.

**Janet Foster:** What's the threshold for "large"?

**Rachel Torres:** Same, $1 million revenue. But it's €1 million for European customers.

**Marcus Williams:** So we need currency conversion in the logic?

**Rachel Torres:** I use the exchange rate from the first day of the quarter.

**Sarah Chen:** Which is stored where?

**Rachel Torres:** Column M in the Excel.

**Jordan Kim:** [taking notes frantically] What about the UK?

**Rachel Torres:** Post-Brexit, UK is special. Large customers to UK Limited, subsidiary 8. Small B2B to UK Services Ltd, subsidiary 9.

**Carlos Martinez:** All UK B2C goes to UK Services regardless of size.

**Alex Rodriguez:** How do you determine B2B vs B2C?

**Rachel Torres:** In Salesforce there's a Customer_Type__c field.

**Marcus Williams:** [checking] That field has 15 different values including "Business", "Company", "B2B", "b-to-b", "Commercial"...

**Rachel Torres:** I treat anything with "B" and "2" as B2B.

### The APAC Problem

**Jordan Kim:** What about Asia-Pacific?

**Rachel Torres:** Australia and New Zealand go through Australia Pty Ltd, subsidiary 12.

**Carlos Martinez:** Japan is separate - subsidiary 13, Japan KK. They have consumption tax requirements.

**Rachel Torres:** Singapore is our APAC hub, subsidiary 14. Hong Kong goes through Singapore.

**Janet Foster:** What about China?

**Carlos Martinez:** China Trading Co, subsidiary 15. Special entity for regulatory reasons.

**Rachel Torres:** But only for mainland China. Hong Kong is through Singapore.

**Jordan Kim:** How do you distinguish?

**Rachel Torres:** By the tax ID prefix. Mainland China starts with USCC, Hong Kong with BR.

**Marcus Williams:** What if they don't provide a tax ID?

**Rachel Torres:** Default to Singapore and hope for the best.

### The Default Dilemma

**Sarah Chen:** What happens if none of the rules match?

**Rachel Torres:** Row 37 - DEFAULT. Everything goes to US West Corp, subsidiary 1.

**Carlos Martinez:** Which is wrong 50% of the time and causes tax issues.

**Janet Foster:** How often does this happen?

**Rachel Torres:** About 100 orders per month hit the default.

**Alex Rodriguez:** That's 5% of your volume.

**Rachel Torres:** And row 38 is EXCEPTION - subsidiary 99, which doesn't actually exist. It's my flag for manual review.

**Jordan Kim:** How many exceptions?

**Rachel Torres:** 20-30 per day.

**Sarah Chen:** [incredulous] You manually review 30 orders per day?

**Rachel Torres:** It's usually the same customers. I have another Excel sheet with customer-specific overrides.

**Marcus Williams:** Another Excel sheet?

**Rachel Torres:** The subsidiary mapping exception log. It's only 200 rows.

### The Tax ID Circus

**Carlos Martinez:** We haven't even talked about tax ID validation.

**Jordan Kim:** There's validation?

**Carlos Martinez:** Each country has different tax ID formats. 

**Rachel Torres:** [showing Excel] Columns N through P have regex patterns for validation.

**Sam Patel:** Regex. In Excel.

**Rachel Torres:** VBA macros. I wrote them in 2019.

**Marcus Williams:** Do they still work?

**Rachel Torres:** Mostly. The German format changed last year but I haven't updated it.

**Carlos Martinez:** That explains the German tax notices.

### The Revenue Calculation

**Janet Foster:** Let's go back to this revenue threshold. How exactly do you calculate it?

**Rachel Torres:** Annual revenue for the last 12 months.

**Janet Foster:** Rolling 12 months or calendar year?

**Rachel Torres:** Calendar year.

**Janet Foster:** So on January 1st, everyone resets to small customer?

**Rachel Torres:** [pause] I hadn't thought of that.

**Carlos Martinez:** Rachel, we've been misrouting January orders for years.

**Rachel Torres:** I usually catch them in February and fix them.

**Sarah Chen:** "Usually?"

### The Acquisition Mess

**Marcus Williams:** What about customers from the acquisition?

**Rachel Torres:** Which acquisition?

**Marcus Williams:** Any of the three companies we bought last year.

**Rachel Torres:** They're all hardcoded exceptions. Rows 40 through 95 in the hidden section.

**Jordan Kim:** You said there were 37 rows total.

**Rachel Torres:** In the visible section. There are 60 more hidden rows for special cases.

**Alex Rodriguez:** So 97 total routing rules?

**Rachel Torres:** Plus the customer override sheet, so about 300 total decisions.

### The Path Forward

**Sarah Chen:** This is insane. We need this logic in a proper system.

**Jordan Kim:** We can build this into the staging database. Create a proper subsidiary decision engine.

**Carlos Martinez:** It needs to be auditable. Tax authorities don't accept "it's in Rachel's Excel" as documentation.

**Janet Foster:** And we need version control. When did the German tax change?

**Rachel Torres:** Sometime last year?

**Janet Foster:** "Sometime" isn't acceptable for audit.

**Alex Rodriguez:** We'll need to document every rule, test every scenario.

**Rachel Torres:** Some of these rules I created five years ago. I don't remember why.

**Carlos Martinez:** Like what?

**Rachel Torres:** Why does Montana B2B go to Canada Corp?

**Carlos Martinez:** [long pause] That makes no sense.

**Rachel Torres:** But it's been working, so I left it.

**Marcus Williams:** "Working" might be generous.

**Sarah Chen:** Jordan, how long to build this properly?

**Jordan Kim:** We need to extract all rules from Excel, validate them with tax and legal, build the decision engine, test all permutations... 

**Alex Rodriguez:** Three weeks minimum, probably four.

**Janet Foster:** This is quarter-end month. We can't change subsidiary routing during close.

**Rachel Torres:** So I keep using Excel until October?

**Sarah Chen:** [resigned] Yes, but we're making a backup. Marcus, get that Excel file into version control immediately.

**Marcus Williams:** Excel in Git?

**Sarah Chen:** I don't care if you print it and scan it. We need a backup.

**Rachel Torres:** I should mention - the Excel file references another file for holiday calendars.

**Jordan Kim:** Why do you need holiday calendars?

**Rachel Torres:** Some subsidiaries can't process orders on local holidays. Orders get routed to alternate subsidiaries.

**Carlos Martinez:** That's not compliant with tax law.

**Rachel Torres:** It's been working for three years.

**Sarah Chen:** [standing up] I need a break. And a drink. Several drinks.

---

## Meeting Outcome

**Discoveries:**
- 97 explicit routing rules (37 visible, 60 hidden)
- ~300 total decisions including customer overrides
- Rules based on country, state, customer type, tax ID, revenue, and holidays
- Revenue calculation flawed (resets January 1)
- Tax ID validation via VBA macros (outdated)
- Multiple Excel files with interdependencies
- No version control or audit trail
- Manual review of 20-30 orders daily
- Some rules exist without documented reason

**Agreed Actions:**
1. Immediately backup all Excel files
2. Document every rule with business justification
3. Carlos to validate all tax implications
4. Build proper subsidiary decision service in staging DB
5. Create audit trail for all routing decisions
6. Implement version control
7. Plan October cutover (after quarter-end)

**Risk Assessment:**
- **Critical**: Current system has no backup (Rachel single point of failure)
- **High**: Tax compliance issues from incorrect routing
- **High**: No audit trail for tax authorities
- **Medium**: Manual process doesn't scale with growth