import type { ClientNotes } from './clientSheets';

// STEER LLC — FTG's working notes.
//
// Kept apart from the statements deliberately. These are drafts about the
// client's own bookkeeping, and this module is imported only when a staff
// member is viewing, so none of it reaches the client at all.

export const STEER_NOTES: ClientNotes = {
  'TL;DR': [
    [null, "STEER LLC", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "Monthly / YTD Financial TL;DR  ·  prepared by Finance Therapy Group (FTG)", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Industry", "Sustain focus (growing)", "Rebuild focus (declining)", "Staffing driver"],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Jan 2026", null, "Behavioral / Mental Health", "keeping the clinician schedule full, driving client rebooking and retention, and optimizing the payer mix", "client rebooking and retention, filling open session slots, and clinician utilization", "clinician schedules to session volume"],
    [null, "Period From:", "Jan 2026", "Period To:", "Aug 2026", null, null, null, null, null, null, null, null, null, null, "Feb 2026", null, "Childcare / Early Education", "enrollment and attendance, filling open classroom slots, and add-on program revenue", "enrollment, waitlist conversion, and classroom utilization / staff-to-child ratios", "staffing to enrollment and required staff-to-child ratios"],
    [null, "Industry:", "Education / Tutoring", null, null, null, null, null, null, null, null, null, null, null, null, "Mar 2026", null, "Healthcare / Medical Clinic", "patient visit volume, payer mix, and procedures per visit", "appointment fill rate, no-shows, and reimbursement/coding capture", "clinical staffing to patient visit volume"],
    [null, "TL;DR - KEY HIGHLIGHTS  (Jan-Aug 2026)", null, null, null, null, null, null, null, null, null, null, null, null, null, "Apr 2026", null, "Wellness / Therapy / Spa", "keeping the calendar full, rebooking and memberships, and higher-value add-ons", "client rebooking, filling open slots, and the treatment/service mix", "practitioner hours to booking volume"],
    [null, "Metric", "This Period", null, "% of Revenue / Note", null, null, null, null, null, null, null, null, null, null, "May 2026", null, "Education / Tutoring", "student enrollment, session attendance, and program mix", "enrollment, attendance, and instructor utilization", "instructor hours to enrolled sessions"],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Jun 2026", null, "Professional Services", "billable utilization, new engagements, and rate realization", "the sales pipeline, billing cadence, and utilization", "team capacity to billable demand"],
    [null, "Revenue", 632880.26, null, "-", null, null, null, null, null, null, null, null, null, null, "Jul 2026", null, "Other", "protecting revenue, controlling costs, and improving margin", "the top revenue drivers and largest cost lines", "staffing to activity volume"],
    [null, "Gross Profit", 632880.26, null, 1, null, null, null, null, null, null, null, null, null, null, "Aug 2026", null, null, null, null, null],
    [null, "Operating Expense", 569749.44, null, 0.900248, null, null, null, null, null, null, null, null, null, null, "Sep 2026", null, null, null, null, null],
    [null, "Net Income (Loss)", 63130.82, null, 0.099752, null, null, null, null, null, null, null, null, null, null, "Oct 2026", null, null, null, null, null],
    [null, "Ending Cash", 9753.57, null, "-", null, null, null, null, null, null, null, null, null, null, "Nov 2026", null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Dec 2026", null, null, null, null, null],
    [null, "KEY RATIOS", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "Ratio", "This Period", null, "Rationale", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "Net Margin (%)", 0.099752, null, "Profit kept per $1 of revenue; solid.", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "Cash to Expense Ratio", 0.136952, null, "Months of operating expense covered by cash on hand; under one month.", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "Employee Expense Ratio", 0.478174, null, "Payroll-related cost as a share of sales; typical for a service business.", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "HELPER BLOCK - do not edit", null, null, null, null, null],
    [null, "KEY DRIVERS", null, null, null, null, null, null, null, null, null, null, null, null, null, "Start col index", 13, null, null, null, null],
    [null, "Revenue", "Revenue totaled $632,880 for the period.", null, null, null, null, null, null, null, null, null, null, null, null, "End col index", 20, null, null, null, null],
    [null, "Labor", "Payroll was 47.8% of revenue; contract labor $12,739.", null, null, null, null, null, null, null, null, null, null, null, null, "Months in period", 8, null, null, null, null],
    [null, "Cost base", "Total operating expense $569,749 (90.0% of revenue).", null, null, null, null, null, null, null, null, null, null, null, null, "Prior start index", 5, null, null, null, null],
    [null, "Fixed costs", "Rent & utilities ≈ $103,566 over the period, largely fixed regardless of volume.", null, null, null, null, null, null, null, null, null, null, null, null, "Prior end index", 12, null, null, null, null],
    [null, "Discretionary", "Charitable contributions ≈ $67,622 (10.7% of revenue) - abnormally high for a service business and the largest discretionary line after payroll.", null, null, null, null, null, null, null, null, null, null, null, null, "Prior period exists (2026 only - 2025 has no comparable data)", 0, null, null, null, null],
    [null, "SUMMARY", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "For Jan-Aug 2026, revenue was $632,880 and net income was $63,131 (10.0% margin). The period was profitable. Cash covers 0.1x of monthly OpEx and payroll is 47.8% of sales. Sustain momentum by student enrollment, session attendance, and program mix. Payroll is the dominant cost lever; align instructor hours to enrolled sessions to protect margin.", null, null, null, null, null, null, null, null, null, null, null, null, null, "Line item", "Current", "Prior", null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Revenue (STEER PL r9)", 632880.26, 0, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Gross Profit (r10)", 632880.26, 0, null, null, null],
    [null, "Basis note: Dec 2025 is a catch-up period (all pre-Dec-2025 activity booked in one month) and 2025 carries no comparable monthly data, so prior-period comparisons are suppressed. Monthly revenue swings 6.4x between the highest and lowest month of Jan-Jul 2026, so single-month reads are unreliable - use the trailing 3-month average on the Dashboard.", null, null, null, null, null, null, null, null, null, null, null, null, null, "Total Expenses (r41)", 569749.44, 0, null, null, null],
    [null, "RECOMMENDATIONS & ACTION PLAN", null, null, null, null, null, null, null, null, null, null, null, null, null, "Net Income (r43)", 63130.82, 0, null, null, null],
    [null, "Area", "Finding", "Recommended Action", "Next-Period Target", "Forecast Impact", null, null, null, null, null, null, null, null, null, "Ending Cash (STEER BS r10)", 9753.57, 0, null, null, null],
    [null, "Revenue", "Revenue totaled $632,880 for the period.", "Sustain: student enrollment, session attendance, and program mix.", "Sep 2026 onward: sustain the monthly run-rate", "Each 5% revenue lift ≈ $31,644 of additional gross profit.", null, null, null, null, null, null, null, null, null, "Payroll block + contractor", 302626.89, 0, null, null, null],
    [null, "Profitability / Net Margin", "Net margin 10.0%; profitable.", "Protect margin; reinvest selectively.", "Sep 2026 onward: net margin > 0%", "Sustaining margin builds cash reserve.", null, null, null, null, null, null, null, null, null, "Contractor expenses (r20)", 12739.03, null, null, null, null],
    [null, "Operating Costs", "OpEx $569,749 (90.0% of revenue); payroll is the largest line.", "Hold OpEx growth below revenue growth.", "Sep 2026 onward: OpEx < revenue", "Payroll is the biggest line; align instructor hours to enrolled sessions.", null, null, null, null, null, null, null, null, null, "Rent + Utilities (r35+r40)", 103565.54, null, null, null, null],
    [null, "Liquidity (Cash / Expense)", "Cash covers 0.1x of monthly operating expense.", "Build cash reserve: time large outflows and tighten collections.", "Sep 2026 onward: keep > 1.5x monthly OpEx", "At the current run-rate, cash covers about 0.1 months of OpEx.", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "Employee Cost Ratio", "Payroll-related cost is 47.8% of sales.", "Labor cost is within a healthy range; hold staffing to demand.", "Sep 2026 onward: hold payroll near 47.8% of sales", "Each 1 pp reduction ≈ $6,329 saved per period.", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, "Live-linked to the STEER PL and STEER BS tabs. Set Period From / Period To above to change the reporting window. Dec 2025 is a catch-up period and 2025 carries no comparable monthly data, so prior-period comparisons are suppressed.", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ],
};

export default STEER_NOTES;
