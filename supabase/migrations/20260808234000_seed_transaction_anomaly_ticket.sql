-- Seed a Tier 2 transaction_anomaly ticket on the GRC track.
-- Students analyze a 51-row AP CSV for objective anomalies:
--   duplicate invoice_id, round-dollar amounts, weekend dates.
-- Paths: (A) PI-04 WebContainer CodeSandbox with CSV + analyze stubs,
--        (B) spreadsheet filter/sort documented in the brief.
-- Scoring is deterministic exact-set match on anomalyTransactionIds (no LLM).
--
-- ticket_type: transaction_anomaly
-- aliases: csv_anomaly_detection, anomaly_detection
-- Dataset is distinct from sampling_methodology (APT-* / May 2026).
--
-- Idempotent: skips insert when the same scenario_brief exists on grc.

INSERT INTO public.tickets (
  tenant_id,
  track_id,
  tier,
  ticket_type,
  difficulty,
  sla_minutes,
  scenario_brief,
  initial_state,
  expected_state,
  dcwf_code,
  sort_order
)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  t.id,
  2,
  'transaction_anomaly',
  'medium',
  45,
  'Anomaly detection: Flag duplicate, round-dollar, and weekend AP transactions from the May 2026 extract.',
  jsonb_build_object(
    'ticketCode', 'GRC-ANOMALY',
    'title', 'Identify anomalous AP transactions',
    'prompt', $prompt$Review the May 2026 accounts-payable extract (51 transactions). Using only the stated rules — duplicate invoice_id, round-dollar amounts (no cents), and weekend dates — identify every anomalous transaction_id. Analyze via the WebContainer sandbox (Node/Python stubs) or a spreadsheet, then select the matching IDs in the form.$prompt$,
    'spreadsheetApproach', $sheet$Spreadsheet approach (when the sandbox is unavailable):
1. Download the CSV and open it in Excel / Google Sheets / LibreOffice.
2. Duplicate payments — sort by invoice_id; highlight every row in a group that appears more than once.
3. Round-dollar amounts — filter or helper column where amount equals INT(amount) (no cents).
4. Weekend transactions — add a weekday column and keep Saturday/Sunday rows.
5. Union the three result sets (unique transaction_id), then check those IDs in the ticket form.$sheet$,
    'rules', $rules$[{"id": "duplicate_payment", "label": "Duplicate payment (same invoice_id on more than one transaction)", "detail": "If the same invoice_id appears on two or more rows, flag every transaction_id in that group."}, {"id": "round_dollar", "label": "Round-dollar amount (exact whole dollars, no cents)", "detail": "Flag any transaction whose amount is an exact whole number of dollars (for example 1000.00). Amounts with cents (for example 412.37) are not round-dollar anomalies."}, {"id": "weekend", "label": "Weekend transaction (Saturday or Sunday)", "detail": "Flag any transaction whose date (YYYY-MM-DD) falls on Saturday or Sunday."}]$rules$::jsonb,
    'transactions', $txns$[{"id": "APT-0001", "date": "2026-05-01", "vendor": "Brightleaf Office", "invoiceId": "INV-9001", "amount": 412.37, "currency": "USD", "description": "Printer toner restock", "department": "Facilities"}, {"id": "APT-0002", "date": "2026-05-04", "vendor": "Cascade Networks", "invoiceId": "INV-9002", "amount": 1288.64, "currency": "USD", "description": "Switch stack maintenance", "department": "IT"}, {"id": "APT-0003", "date": "2026-05-05", "vendor": "HarborForge Consulting", "invoiceId": "INV-9003", "amount": 755.19, "currency": "USD", "description": "Quarterly advisory retainer", "department": "Finance"}, {"id": "APT-0004", "date": "2026-05-06", "vendor": "Summit Hardware Co", "invoiceId": "INV-9004", "amount": 2399.45, "currency": "USD", "description": "Laptop refresh batch", "department": "IT"}, {"id": "APT-0005", "date": "2026-05-07", "vendor": "Northwind Catering", "invoiceId": "INV-9005", "amount": 186.22, "currency": "USD", "description": "Team lunch catering", "department": "HR"}, {"id": "APT-0006", "date": "2026-05-08", "vendor": "Pinecrest Legal LLP", "invoiceId": "INV-9006", "amount": 3400.88, "currency": "USD", "description": "Contract review hours", "department": "Legal"}, {"id": "APT-0007", "date": "2026-05-11", "vendor": "Riverstone Cloud", "invoiceId": "INV-9007", "amount": 919.53, "currency": "USD", "description": "SaaS seat expansion", "department": "IT"}, {"id": "APT-0008", "date": "2026-05-12", "vendor": "Oakmont Travel Desk", "invoiceId": "INV-9008", "amount": 642.17, "currency": "USD", "description": "Conference travel booking", "department": "Finance"}, {"id": "APT-0009", "date": "2026-05-13", "vendor": "Brightleaf Office", "invoiceId": "INV-9009", "amount": 1544.61, "currency": "USD", "description": "Desk chairs replacement", "department": "Facilities"}, {"id": "APT-0010", "date": "2026-05-14", "vendor": "Cascade Networks", "invoiceId": "INV-9010", "amount": 277.4, "currency": "USD", "description": "Network cable plant", "department": "IT"}, {"id": "APT-0011", "date": "2026-05-15", "vendor": "HarborForge Consulting", "invoiceId": "INV-9011", "amount": 1102.93, "currency": "USD", "description": "SOC workshop facilitation", "department": "Finance"}, {"id": "APT-0012", "date": "2026-05-18", "vendor": "Summit Hardware Co", "invoiceId": "INV-9012", "amount": 488.76, "currency": "USD", "description": "Badge printer supplies", "department": "IT"}, {"id": "APT-0013", "date": "2026-05-19", "vendor": "Northwind Catering", "invoiceId": "INV-9013", "amount": 3210.55, "currency": "USD", "description": "Firewall appliance support", "department": "HR"}, {"id": "APT-0014", "date": "2026-05-20", "vendor": "Pinecrest Legal LLP", "invoiceId": "INV-9014", "amount": 167.89, "currency": "USD", "description": "Executive offsite meals", "department": "Legal"}, {"id": "APT-0015", "date": "2026-05-21", "vendor": "Riverstone Cloud", "invoiceId": "INV-9015", "amount": 2899.12, "currency": "USD", "description": "Outside counsel memo", "department": "IT"}, {"id": "APT-0016", "date": "2026-05-22", "vendor": "Oakmont Travel Desk", "invoiceId": "INV-9016", "amount": 733.48, "currency": "USD", "description": "Object storage overage", "department": "Finance"}, {"id": "APT-0017", "date": "2026-05-25", "vendor": "Brightleaf Office", "invoiceId": "INV-9017", "amount": 1455.3, "currency": "USD", "description": "Staff relocation flights", "department": "Facilities"}, {"id": "APT-0018", "date": "2026-05-26", "vendor": "Cascade Networks", "invoiceId": "INV-9018", "amount": 521.06, "currency": "USD", "description": "Cleaning contract add-on", "department": "IT"}, {"id": "APT-0019", "date": "2026-05-27", "vendor": "HarborForge Consulting", "invoiceId": "INV-9019", "amount": 1988.71, "currency": "USD", "description": "APAC circuit upgrade", "department": "Finance"}, {"id": "APT-0020", "date": "2026-05-28", "vendor": "Summit Hardware Co", "invoiceId": "INV-9020", "amount": 864.25, "currency": "USD", "description": "Board packet printing", "department": "IT"}, {"id": "APT-0021", "date": "2026-05-29", "vendor": "Northwind Catering", "invoiceId": "INV-9021", "amount": 1333.58, "currency": "USD", "description": "ERP connector license", "department": "HR"}, {"id": "APT-0022", "date": "2026-05-01", "vendor": "Pinecrest Legal LLP", "invoiceId": "INV-9022", "amount": 249.91, "currency": "USD", "description": "Wellness stipend batch", "department": "Legal"}, {"id": "APT-0023", "date": "2026-05-04", "vendor": "Riverstone Cloud", "invoiceId": "INV-9023", "amount": 1766.04, "currency": "USD", "description": "Penetration test follow-up", "department": "IT"}, {"id": "APT-0024", "date": "2026-05-05", "vendor": "Oakmont Travel Desk", "invoiceId": "INV-9024", "amount": 390.67, "currency": "USD", "description": "Courier overnight fees", "department": "Finance"}, {"id": "APT-0025", "date": "2026-05-06", "vendor": "Brightleaf Office", "invoiceId": "INV-9025", "amount": 2111.39, "currency": "USD", "description": "Backup appliance parts", "department": "Facilities"}, {"id": "APT-0026", "date": "2026-05-07", "vendor": "Cascade Networks", "invoiceId": "INV-9026", "amount": 678.14, "currency": "USD", "description": "Interview panel catering", "department": "IT"}, {"id": "APT-0027", "date": "2026-05-08", "vendor": "HarborForge Consulting", "invoiceId": "INV-9027", "amount": 4555.82, "currency": "USD", "description": "M&A diligence support", "department": "Finance"}, {"id": "APT-0028", "date": "2026-05-11", "vendor": "Summit Hardware Co", "invoiceId": "INV-9028", "amount": 812.46, "currency": "USD", "description": "CDN burst traffic", "department": "IT"}, {"id": "APT-0029", "date": "2026-05-12", "vendor": "Northwind Catering", "invoiceId": "INV-9029", "amount": 1204.73, "currency": "USD", "description": "Sales kickoff lodging", "department": "HR"}, {"id": "APT-0030", "date": "2026-05-13", "vendor": "Pinecrest Legal LLP", "invoiceId": "INV-9030", "amount": 333.28, "currency": "USD", "description": "Ergonomic keyboard set", "department": "Legal"}, {"id": "APT-0031", "date": "2026-05-14", "vendor": "Riverstone Cloud", "invoiceId": "INV-9031", "amount": 967.51, "currency": "USD", "description": "Identity broker renewal", "department": "IT"}, {"id": "APT-0032", "date": "2026-05-15", "vendor": "Oakmont Travel Desk", "invoiceId": "INV-9032", "amount": 141.7, "currency": "USD", "description": "New-hire welcome kits", "department": "Finance"}, {"id": "APT-0033", "date": "2026-05-18", "vendor": "Brightleaf Office", "invoiceId": "INV-9033", "amount": 2588.96, "currency": "USD", "description": "SIEM content pack", "department": "Facilities"}, {"id": "APT-0034", "date": "2026-05-19", "vendor": "Cascade Networks", "invoiceId": "INV-9034", "amount": 704.33, "currency": "USD", "description": "Notary and filing fees", "department": "IT"}, {"id": "APT-0035", "date": "2026-05-20", "vendor": "HarborForge Consulting", "invoiceId": "INV-9035", "amount": 1822.07, "currency": "USD", "description": "Multi-region failover test", "department": "Finance"}, {"id": "APT-0036", "date": "2026-05-21", "vendor": "Summit Hardware Co", "invoiceId": "INV-9036", "amount": 459.62, "currency": "USD", "description": "Airport transfers", "department": "IT"}, {"id": "APT-0037", "date": "2026-05-05", "vendor": "Cascade Networks", "invoiceId": "INV-9101", "amount": 1000.0, "currency": "USD", "description": "Emergency network cutover fee", "department": "IT"}, {"id": "APT-0038", "date": "2026-05-12", "vendor": "HarborForge Consulting", "invoiceId": "INV-9102", "amount": 5000.0, "currency": "USD", "description": "Executive advisory lump sum", "department": "Finance"}, {"id": "APT-0039", "date": "2026-05-19", "vendor": "Riverstone Cloud", "invoiceId": "INV-9103", "amount": 2500.0, "currency": "USD", "description": "Cloud credits true-up", "department": "IT"}, {"id": "APT-0040", "date": "2026-05-26", "vendor": "Summit Hardware Co", "invoiceId": "INV-9104", "amount": 750.0, "currency": "USD", "description": "Spare hardware contingency", "department": "IT"}, {"id": "APT-0041", "date": "2026-05-02", "vendor": "Brightleaf Office", "invoiceId": "INV-9201", "amount": 388.44, "currency": "USD", "description": "Weekend facilities unlock", "department": "Facilities"}, {"id": "APT-0042", "date": "2026-05-03", "vendor": "Oakmont Travel Desk", "invoiceId": "INV-9202", "amount": 1299.18, "currency": "USD", "description": "Sunday travel rebook", "department": "Finance"}, {"id": "APT-0043", "date": "2026-05-09", "vendor": "Cascade Networks", "invoiceId": "INV-9203", "amount": 622.75, "currency": "USD", "description": "Saturday NOC coverage", "department": "IT"}, {"id": "APT-0044", "date": "2026-05-16", "vendor": "Northwind Catering", "invoiceId": "INV-9204", "amount": 210.56, "currency": "USD", "description": "Weekend event catering", "department": "HR"}, {"id": "APT-0045", "date": "2026-05-24", "vendor": "HarborForge Consulting", "invoiceId": "INV-9205", "amount": 1744.89, "currency": "USD", "description": "Sunday incident retainer", "department": "Finance"}, {"id": "APT-0046", "date": "2026-05-08", "vendor": "HarborForge Consulting", "invoiceId": "INV-DUP-01", "amount": 1840.5, "currency": "USD", "description": "Controls walkthrough hours", "department": "Finance"}, {"id": "APT-0047", "date": "2026-05-15", "vendor": "HarborForge Consulting", "invoiceId": "INV-DUP-01", "amount": 1840.5, "currency": "USD", "description": "Controls walkthrough hours", "department": "Finance"}, {"id": "APT-0048", "date": "2026-05-20", "vendor": "Riverstone Cloud", "invoiceId": "INV-DUP-02", "amount": 960.25, "currency": "USD", "description": "Object storage expansion", "department": "IT"}, {"id": "APT-0049", "date": "2026-05-27", "vendor": "Riverstone Cloud", "invoiceId": "INV-DUP-02", "amount": 960.25, "currency": "USD", "description": "Object storage expansion", "department": "IT"}, {"id": "APT-0050", "date": "2026-05-28", "vendor": "Pinecrest Legal LLP", "invoiceId": "INV-9037", "amount": 1188.42, "currency": "USD", "description": "Policy redline package", "department": "Legal"}, {"id": "APT-0051", "date": "2026-05-10", "vendor": "Summit Hardware Co", "invoiceId": "INV-9105", "amount": 3000.0, "currency": "USD", "description": "Weekend emergency hardware buy", "department": "IT"}]$txns$::jsonb,
    'csv', $csv$transaction_id,date,vendor,invoice_id,amount,currency,description,department
APT-0001,2026-05-01,Brightleaf Office,INV-9001,412.37,USD,Printer toner restock,Facilities
APT-0002,2026-05-04,Cascade Networks,INV-9002,1288.64,USD,Switch stack maintenance,IT
APT-0003,2026-05-05,HarborForge Consulting,INV-9003,755.19,USD,Quarterly advisory retainer,Finance
APT-0004,2026-05-06,Summit Hardware Co,INV-9004,2399.45,USD,Laptop refresh batch,IT
APT-0005,2026-05-07,Northwind Catering,INV-9005,186.22,USD,Team lunch catering,HR
APT-0006,2026-05-08,Pinecrest Legal LLP,INV-9006,3400.88,USD,Contract review hours,Legal
APT-0007,2026-05-11,Riverstone Cloud,INV-9007,919.53,USD,SaaS seat expansion,IT
APT-0008,2026-05-12,Oakmont Travel Desk,INV-9008,642.17,USD,Conference travel booking,Finance
APT-0009,2026-05-13,Brightleaf Office,INV-9009,1544.61,USD,Desk chairs replacement,Facilities
APT-0010,2026-05-14,Cascade Networks,INV-9010,277.40,USD,Network cable plant,IT
APT-0011,2026-05-15,HarborForge Consulting,INV-9011,1102.93,USD,SOC workshop facilitation,Finance
APT-0012,2026-05-18,Summit Hardware Co,INV-9012,488.76,USD,Badge printer supplies,IT
APT-0013,2026-05-19,Northwind Catering,INV-9013,3210.55,USD,Firewall appliance support,HR
APT-0014,2026-05-20,Pinecrest Legal LLP,INV-9014,167.89,USD,Executive offsite meals,Legal
APT-0015,2026-05-21,Riverstone Cloud,INV-9015,2899.12,USD,Outside counsel memo,IT
APT-0016,2026-05-22,Oakmont Travel Desk,INV-9016,733.48,USD,Object storage overage,Finance
APT-0017,2026-05-25,Brightleaf Office,INV-9017,1455.30,USD,Staff relocation flights,Facilities
APT-0018,2026-05-26,Cascade Networks,INV-9018,521.06,USD,Cleaning contract add-on,IT
APT-0019,2026-05-27,HarborForge Consulting,INV-9019,1988.71,USD,APAC circuit upgrade,Finance
APT-0020,2026-05-28,Summit Hardware Co,INV-9020,864.25,USD,Board packet printing,IT
APT-0021,2026-05-29,Northwind Catering,INV-9021,1333.58,USD,ERP connector license,HR
APT-0022,2026-05-01,Pinecrest Legal LLP,INV-9022,249.91,USD,Wellness stipend batch,Legal
APT-0023,2026-05-04,Riverstone Cloud,INV-9023,1766.04,USD,Penetration test follow-up,IT
APT-0024,2026-05-05,Oakmont Travel Desk,INV-9024,390.67,USD,Courier overnight fees,Finance
APT-0025,2026-05-06,Brightleaf Office,INV-9025,2111.39,USD,Backup appliance parts,Facilities
APT-0026,2026-05-07,Cascade Networks,INV-9026,678.14,USD,Interview panel catering,IT
APT-0027,2026-05-08,HarborForge Consulting,INV-9027,4555.82,USD,M&A diligence support,Finance
APT-0028,2026-05-11,Summit Hardware Co,INV-9028,812.46,USD,CDN burst traffic,IT
APT-0029,2026-05-12,Northwind Catering,INV-9029,1204.73,USD,Sales kickoff lodging,HR
APT-0030,2026-05-13,Pinecrest Legal LLP,INV-9030,333.28,USD,Ergonomic keyboard set,Legal
APT-0031,2026-05-14,Riverstone Cloud,INV-9031,967.51,USD,Identity broker renewal,IT
APT-0032,2026-05-15,Oakmont Travel Desk,INV-9032,141.70,USD,New-hire welcome kits,Finance
APT-0033,2026-05-18,Brightleaf Office,INV-9033,2588.96,USD,SIEM content pack,Facilities
APT-0034,2026-05-19,Cascade Networks,INV-9034,704.33,USD,Notary and filing fees,IT
APT-0035,2026-05-20,HarborForge Consulting,INV-9035,1822.07,USD,Multi-region failover test,Finance
APT-0036,2026-05-21,Summit Hardware Co,INV-9036,459.62,USD,Airport transfers,IT
APT-0037,2026-05-05,Cascade Networks,INV-9101,1000.00,USD,Emergency network cutover fee,IT
APT-0038,2026-05-12,HarborForge Consulting,INV-9102,5000.00,USD,Executive advisory lump sum,Finance
APT-0039,2026-05-19,Riverstone Cloud,INV-9103,2500.00,USD,Cloud credits true-up,IT
APT-0040,2026-05-26,Summit Hardware Co,INV-9104,750.00,USD,Spare hardware contingency,IT
APT-0041,2026-05-02,Brightleaf Office,INV-9201,388.44,USD,Weekend facilities unlock,Facilities
APT-0042,2026-05-03,Oakmont Travel Desk,INV-9202,1299.18,USD,Sunday travel rebook,Finance
APT-0043,2026-05-09,Cascade Networks,INV-9203,622.75,USD,Saturday NOC coverage,IT
APT-0044,2026-05-16,Northwind Catering,INV-9204,210.56,USD,Weekend event catering,HR
APT-0045,2026-05-24,HarborForge Consulting,INV-9205,1744.89,USD,Sunday incident retainer,Finance
APT-0046,2026-05-08,HarborForge Consulting,INV-DUP-01,1840.50,USD,Controls walkthrough hours,Finance
APT-0047,2026-05-15,HarborForge Consulting,INV-DUP-01,1840.50,USD,Controls walkthrough hours,Finance
APT-0048,2026-05-20,Riverstone Cloud,INV-DUP-02,960.25,USD,Object storage expansion,IT
APT-0049,2026-05-27,Riverstone Cloud,INV-DUP-02,960.25,USD,Object storage expansion,IT
APT-0050,2026-05-28,Pinecrest Legal LLP,INV-9037,1188.42,USD,Policy redline package,Legal
APT-0051,2026-05-10,Summit Hardware Co,INV-9105,3000.00,USD,Weekend emergency hardware buy,IT
$csv$,
    'files', jsonb_build_object(
      'data/ap_transactions.csv', $csv$transaction_id,date,vendor,invoice_id,amount,currency,description,department
APT-0001,2026-05-01,Brightleaf Office,INV-9001,412.37,USD,Printer toner restock,Facilities
APT-0002,2026-05-04,Cascade Networks,INV-9002,1288.64,USD,Switch stack maintenance,IT
APT-0003,2026-05-05,HarborForge Consulting,INV-9003,755.19,USD,Quarterly advisory retainer,Finance
APT-0004,2026-05-06,Summit Hardware Co,INV-9004,2399.45,USD,Laptop refresh batch,IT
APT-0005,2026-05-07,Northwind Catering,INV-9005,186.22,USD,Team lunch catering,HR
APT-0006,2026-05-08,Pinecrest Legal LLP,INV-9006,3400.88,USD,Contract review hours,Legal
APT-0007,2026-05-11,Riverstone Cloud,INV-9007,919.53,USD,SaaS seat expansion,IT
APT-0008,2026-05-12,Oakmont Travel Desk,INV-9008,642.17,USD,Conference travel booking,Finance
APT-0009,2026-05-13,Brightleaf Office,INV-9009,1544.61,USD,Desk chairs replacement,Facilities
APT-0010,2026-05-14,Cascade Networks,INV-9010,277.40,USD,Network cable plant,IT
APT-0011,2026-05-15,HarborForge Consulting,INV-9011,1102.93,USD,SOC workshop facilitation,Finance
APT-0012,2026-05-18,Summit Hardware Co,INV-9012,488.76,USD,Badge printer supplies,IT
APT-0013,2026-05-19,Northwind Catering,INV-9013,3210.55,USD,Firewall appliance support,HR
APT-0014,2026-05-20,Pinecrest Legal LLP,INV-9014,167.89,USD,Executive offsite meals,Legal
APT-0015,2026-05-21,Riverstone Cloud,INV-9015,2899.12,USD,Outside counsel memo,IT
APT-0016,2026-05-22,Oakmont Travel Desk,INV-9016,733.48,USD,Object storage overage,Finance
APT-0017,2026-05-25,Brightleaf Office,INV-9017,1455.30,USD,Staff relocation flights,Facilities
APT-0018,2026-05-26,Cascade Networks,INV-9018,521.06,USD,Cleaning contract add-on,IT
APT-0019,2026-05-27,HarborForge Consulting,INV-9019,1988.71,USD,APAC circuit upgrade,Finance
APT-0020,2026-05-28,Summit Hardware Co,INV-9020,864.25,USD,Board packet printing,IT
APT-0021,2026-05-29,Northwind Catering,INV-9021,1333.58,USD,ERP connector license,HR
APT-0022,2026-05-01,Pinecrest Legal LLP,INV-9022,249.91,USD,Wellness stipend batch,Legal
APT-0023,2026-05-04,Riverstone Cloud,INV-9023,1766.04,USD,Penetration test follow-up,IT
APT-0024,2026-05-05,Oakmont Travel Desk,INV-9024,390.67,USD,Courier overnight fees,Finance
APT-0025,2026-05-06,Brightleaf Office,INV-9025,2111.39,USD,Backup appliance parts,Facilities
APT-0026,2026-05-07,Cascade Networks,INV-9026,678.14,USD,Interview panel catering,IT
APT-0027,2026-05-08,HarborForge Consulting,INV-9027,4555.82,USD,M&A diligence support,Finance
APT-0028,2026-05-11,Summit Hardware Co,INV-9028,812.46,USD,CDN burst traffic,IT
APT-0029,2026-05-12,Northwind Catering,INV-9029,1204.73,USD,Sales kickoff lodging,HR
APT-0030,2026-05-13,Pinecrest Legal LLP,INV-9030,333.28,USD,Ergonomic keyboard set,Legal
APT-0031,2026-05-14,Riverstone Cloud,INV-9031,967.51,USD,Identity broker renewal,IT
APT-0032,2026-05-15,Oakmont Travel Desk,INV-9032,141.70,USD,New-hire welcome kits,Finance
APT-0033,2026-05-18,Brightleaf Office,INV-9033,2588.96,USD,SIEM content pack,Facilities
APT-0034,2026-05-19,Cascade Networks,INV-9034,704.33,USD,Notary and filing fees,IT
APT-0035,2026-05-20,HarborForge Consulting,INV-9035,1822.07,USD,Multi-region failover test,Finance
APT-0036,2026-05-21,Summit Hardware Co,INV-9036,459.62,USD,Airport transfers,IT
APT-0037,2026-05-05,Cascade Networks,INV-9101,1000.00,USD,Emergency network cutover fee,IT
APT-0038,2026-05-12,HarborForge Consulting,INV-9102,5000.00,USD,Executive advisory lump sum,Finance
APT-0039,2026-05-19,Riverstone Cloud,INV-9103,2500.00,USD,Cloud credits true-up,IT
APT-0040,2026-05-26,Summit Hardware Co,INV-9104,750.00,USD,Spare hardware contingency,IT
APT-0041,2026-05-02,Brightleaf Office,INV-9201,388.44,USD,Weekend facilities unlock,Facilities
APT-0042,2026-05-03,Oakmont Travel Desk,INV-9202,1299.18,USD,Sunday travel rebook,Finance
APT-0043,2026-05-09,Cascade Networks,INV-9203,622.75,USD,Saturday NOC coverage,IT
APT-0044,2026-05-16,Northwind Catering,INV-9204,210.56,USD,Weekend event catering,HR
APT-0045,2026-05-24,HarborForge Consulting,INV-9205,1744.89,USD,Sunday incident retainer,Finance
APT-0046,2026-05-08,HarborForge Consulting,INV-DUP-01,1840.50,USD,Controls walkthrough hours,Finance
APT-0047,2026-05-15,HarborForge Consulting,INV-DUP-01,1840.50,USD,Controls walkthrough hours,Finance
APT-0048,2026-05-20,Riverstone Cloud,INV-DUP-02,960.25,USD,Object storage expansion,IT
APT-0049,2026-05-27,Riverstone Cloud,INV-DUP-02,960.25,USD,Object storage expansion,IT
APT-0050,2026-05-28,Pinecrest Legal LLP,INV-9037,1188.42,USD,Policy redline package,Legal
APT-0051,2026-05-10,Summit Hardware Co,INV-9105,3000.00,USD,Weekend emergency hardware buy,IT
$csv$,
      'README.md', $readme$# AP anomaly detection lab

Analyze `data/ap_transactions.csv` using the stated rules, then select the anomalous transaction IDs in the ticket form.

## Rules
1. Duplicate payment — same invoice_id on more than one row (flag every copy)
2. Round-dollar — amount is an exact whole number of dollars (no cents)
3. Weekend — date is Saturday or Sunday

## Path A — WebContainer (PI-04)
```bash
node analyze_anomalies.mjs
# or, if Python is available:
python3 analyze_anomalies.py
```

## Path B — Spreadsheet
Download the CSV, then filter/sort by invoice_id / whole-dollar amounts / weekend dates.
$readme$,
      'analyze_anomalies.mjs', $mjs$/**
 * Starter: detect AP anomalies in data/ap_transactions.csv
 * Run: node analyze_anomalies.mjs
 */
import fs from 'node:fs';

const csv = fs.readFileSync('data/ap_transactions.csv', 'utf8').trim();
const [header, ...lines] = csv.split(/\r?\n/);
const cols = header.split(',');
const idx = Object.fromEntries(cols.map((c, i) => [c, i]));

const rows = lines.filter(Boolean).map((line) => {
  const cells = line.split(',');
  return {
    id: cells[idx.transaction_id],
    date: cells[idx.date],
    invoiceId: cells[idx.invoice_id],
    amount: Number(cells[idx.amount]),
  };
});

// TODO: implement the three rules, then print sorted anomaly IDs.
console.log('Loaded', rows.length, 'transactions. Implement detection rules.');
$mjs$,
      'analyze_anomalies.py', $py$"""Starter: detect AP anomalies in data/ap_transactions.csv

Run (when Python is available): python3 analyze_anomalies.py
In the browser WebContainer, prefer: node analyze_anomalies.mjs
"""

from __future__ import annotations

import csv
from pathlib import Path

rows = list(csv.DictReader(Path("data/ap_transactions.csv").open()))

# TODO: implement duplicate invoice_id, round-dollar, and weekend rules.
print(f"Loaded {len(rows)} transactions. Implement detection rules.")
$py$
    )
  ),
  $expected${
  "anomalyTransactionIds": [
    "APT-0037",
    "APT-0038",
    "APT-0039",
    "APT-0040",
    "APT-0041",
    "APT-0042",
    "APT-0043",
    "APT-0044",
    "APT-0045",
    "APT-0046",
    "APT-0047",
    "APT-0048",
    "APT-0049",
    "APT-0051"
  ],
  "anomalyCount": 14,
  "byRule": {
    "duplicate_payment": [
      "APT-0046",
      "APT-0047",
      "APT-0048",
      "APT-0049"
    ],
    "round_dollar": [
      "APT-0037",
      "APT-0038",
      "APT-0039",
      "APT-0040",
      "APT-0051"
    ],
    "weekend": [
      "APT-0041",
      "APT-0042",
      "APT-0043",
      "APT-0044",
      "APT-0045",
      "APT-0051"
    ]
  }
}$expected$::jsonb,
  '612',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = t.id
    ),
    0
  )
FROM public.tracks AS t
WHERE t.slug = 'grc'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.track_id = t.id
      AND existing.ticket_type IN (
        'transaction_anomaly',
        'csv_anomaly_detection',
        'anomaly_detection'
      )
      AND existing.scenario_brief LIKE 'Anomaly detection: Flag duplicate, round-dollar%'
  );
