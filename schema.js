// Shared form definitions — single source of truth for both server (task seeding)
// and client (form rendering). Mirrors the content of the two source documents.

const TERMINATION_SECTIONS = [
  { key: 'crm', title: 'CRM', items: [
    { id: 'crm1', label: 'When does the contract end?', extra: 'date' },
    { id: 'crm2', label: 'Are there termination fees?', extra: 'yesno_amount' },
    { id: 'crm3', label: 'Confirmation received from the broker/client on the last day of the file feeds to be transmitted' },
    { id: 'crm4', label: 'Notify any third-party partners (Touchpoints, Paylocity, CXC) of termination' },
    { id: 'crm5', label: 'Request that carrier or TPAs re-direct all invoices and payment notifications back to client' },
    { id: 'crm6', label: 'Get confirmation from all team leads that required tasks were performed by termination date' },
  ]},
  { key: 'edi', title: 'EDI', items: [
    { id: 'edi1', label: 'Communicate to carriers the last date of feed files that will be transmitted' },
    { id: 'edi2', label: 'Turn off all EDI connections' },
    { id: 'edi3', label: 'Stop processing of any manual enrollment changes' },
  ]},
  { key: 'analytics', title: 'Analytics & Reporting', items: [
    { id: 'an1', label: 'Confirm dates of last billing/payroll deduction reports', extra: 'text', extraLabel: 'Dates' },
    { id: 'an2', label: 'Provide list of any unresolved items + retroactive adjustments that are being tracked' },
    { id: 'an3', label: 'Pull census report of all demographic and enrollment data (employees and dependents)', conditional: 'Only if requested by CRM' },
  ]},
  { key: 'systems', title: 'Systems Configuration', items: [
    { id: 'sys1', label: 'De-activate all user access (HR admins, broker, and employees)' },
    { id: 'sys2', label: 'Disable Employee Self-Service access to enrollment portal' },
    { id: 'sys3', label: 'Disable access to Touchpoints portal', extra: 'text', extraLabel: 'Note (e.g. N/A if no Touchpoints for this client)' },
  ]},
  { key: 'benefits', title: 'Benefits Desk', items: [
    { id: 'bd1', label: 'Instruct team to no longer answer calls/e-mails after effective date' },
    { id: 'bd2', label: 'Change any messaging to re-direct employees to HR' },
  ]},
  { key: 'finance', title: 'Accounting and Finance', items: [
    { id: 'fin1', label: 'Invoice client for any outstanding, unpaid fees' },
    { id: 'fin2', label: 'Turn off billing for future services' },
  ]},
  { key: 'sales', title: 'Sales', items: [
    { id: 'sales1', label: 'Contact Broker to address any broker-level concerns' },
  ]},
];

const CRF_SECTIONS = [
  { key: 'request', title: 'Request' },
  { key: 'solution', title: 'Suggested Change / Solution' },
  { key: 'note', title: 'Note' },
  { key: 'approval', title: 'Approval of Solution & Fees' },
  { key: 'finalSolution', title: 'Final Solution' },
  { key: 'sow', title: 'Action Required & Statement of Work' },
  { key: 'tracking', title: 'Tracking & Metrics' },
  { key: 'categories', title: 'Change Category' },
];

const CATEGORY_MATRIX = [
  { group: 'CLDD', items: [
    { id: 'cldd_edi', label: 'EDI Structure', sub: ['files', 'hours', 'amount'] },
    { id: 'cldd_ded', label: 'Deductions' },
    { id: 'cldd_bill', label: 'Billing', note: 'Proposed change in grid must be attached' },
  ]},
  { group: null, items: [
    { id: 'plan_rules', label: 'Plan Rules' },
    { id: 'rates', label: 'Rates' },
    { id: 'data_fix', label: 'Data Fix' },
    { id: 'reports', label: 'Reports' },
    { id: 'setup', label: 'Setup' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'process', label: 'Process' },
    { id: 'edi_noncldd', label: 'EDI (non-CLDD changes)' },
    { id: 'new_feature', label: 'New Feature' },
  ]},
];

// Flat list of category names, used for the single "Category" dropdown on the
// Tracking & Metrics section (matches the client's Master Tracker "Category" column).
const CATEGORY_OPTIONS = CATEGORY_MATRIX.flatMap(g => g.items.map(it => it.label));

// Tracking & Metrics fields — these map directly to the columns in the client's
// "CRF Config Master Tracker" spreadsheet, so the Excel export/import round-trips cleanly.
const TRACKING_FIELDS = [
  { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS },
  { key: 'timeConfig', label: 'Time Spent on Configuration (hrs)', type: 'text' },
  { key: 'timeTesting', label: 'Time Spent on Review/Testing (hrs)', type: 'text' },
  { key: 'errors', label: 'No. of Errors', type: 'text' },
  { key: 'configAnalyst', label: 'Configuration Analyst', type: 'text' },
  { key: 'testingAnalyst', label: 'Review/Testing Analyst', type: 'text' },
  { key: 'implementationManager', label: 'Implementation Manager/CRM', type: 'text' },
  { key: 'rating', label: 'Rating', type: 'select', options: ['1', '2', '3', '4', '5'] },
  { key: 'comments', label: 'Comments', type: 'textarea' },
  { key: 'billable', label: 'Billable/Non Billable', type: 'select', options: ['Billable', 'Non Billable'] },
];

const TEAM_NAMES = [];

// Client Implementation Checklist — modeled on the "Clients Implemented" columns
// from the client's own tracking spreadsheet.
const IMPLEMENTATION_FIELDS = [
  { key: 'designGuideReceived', label: 'Design Guide Received Date', type: 'date' },
  { key: 'implementationCompletion', label: 'Implementation Completion Date', type: 'date' },
  { key: 'clientGoLive', label: 'Client Go Live Date', type: 'date' },
  { key: 'headcount', label: 'Headcount', type: 'text' },
];

// Extra header-level fields for the Termination Checklist, added to match the
// client's "Clients Terminated" tracker columns (Client/Broker/Reason already exist).
const TERMINATION_EXTRA_FIELDS = [
  { key: 'eeHeadcount', label: 'EE Headcount', type: 'text' },
];

if (typeof module !== 'undefined') {
  module.exports = { TERMINATION_SECTIONS, CRF_SECTIONS, CATEGORY_MATRIX, CATEGORY_OPTIONS, TRACKING_FIELDS, TEAM_NAMES, IMPLEMENTATION_FIELDS, TERMINATION_EXTRA_FIELDS };
}
