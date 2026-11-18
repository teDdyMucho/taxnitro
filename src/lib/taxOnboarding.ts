// The tax onboarding: the season it is for, the questions it asks, and the
// documents those answers call for.
//
// Camaree wants every tax client in the 2027 season to go through the same
// onboarding, new or returning, "to ensure all information is current". FTG's
// Operations Handbook (Taxes) sends it today as separate links by SMS and
// email: a General Intake Form, a Welcome Packet, the Intake Agreement, a
// Business Tax Kit, then a Document Upload Form, and a Docs Checklist Belly
// builds by hand from a template. Here it is one page in the portal, in
// steps, with a progress bar, and the checklist builds itself from the
// answers.
//
// No database in this file, as in lib/questionnaire.ts: the client answering,
// the dashboard card and the staff side all need these rules, and a rule with
// no database attached can be checked on its own.
//
// THE QUESTIONS ARE A DRAFT. Camaree is updating FTG's intake forms; these are
// to be replaced with hers. Doing so touches nothing but the lists below. Keys
// are stored against answers and documents, so a key, once used, is never
// renamed: retire it and add a new one.

// ── The season ───────────────────────────────────────────────────────────────

/**
 * The season being onboarded. '2027' is filed in 2027, for the 2026 tax year.
 * Moving this on starts every tax client again at step one, which is what
 * Camaree asked of a new season; last season's answers and documents stay as
 * they were.
 */
export const TAX_SEASON = '2027';

/** The tax year a season files: '2027' → '2026'. */
export const taxYearOf = (season: string) => String(Number(season) - 1);

/**
 * Whether tax clients see it yet. Off until Camaree has been through the draft
 * questions, so the code can go live without one client meeting a draft. The
 * sign-ins in TAX_ONBOARDING_PREVIEW see it anyway, to try it on.
 */
export const TAX_ONBOARDING_OPEN = false;
export const TAX_ONBOARDING_PREVIEW: string[] = [];

export function seesTaxOnboarding(
  user: { email?: string | null; services?: readonly string[] | null } | null | undefined,
): boolean {
  if (!user?.services?.includes('TAX')) return false;
  if (TAX_ONBOARDING_OPEN) return true;
  return TAX_ONBOARDING_PREVIEW.includes((user.email ?? '').trim().toLowerCase());
}

// ── The documents ────────────────────────────────────────────────────────────

export interface TaxDoc {
  /** Stable: the item's slot in document_requirements is stored against it. */
  key: string;
  /** What the client is asked for. {year} is the tax year, {prior} the one before. */
  label: string;
  /** One line on what it is, or where to find it. */
  hint: string;
  /** The folder table an upload for it lands in. */
  folder: string;
}

// Tax forms go to Client Uploads; the four kinds with a folder of their own
// go to it, so they sit where staff already look for them.
const CLIENT_UPLOADS = 'tax_client_uploads';

/** Every document the checklist can ask for, in the order it lists them. */
export const TAX_DOCS: TaxDoc[] = [
  { key: 'photo_id',           label: 'Photo ID',                              hint: "Driver's license, state ID or passport. Front and back.",        folder: 'tax_identification' },
  { key: 'spouse_photo_id',    label: "Your spouse's photo ID",                hint: "Driver's license, state ID or passport. Front and back.",        folder: 'tax_identification' },
  { key: 'prior_return',       label: 'Your {prior} tax return',               hint: 'The full return you filed last year, federal and state.',         folder: 'tax_prior_returns' },
  { key: 'w2',                 label: 'W-2 from each employer',                hint: 'Your employer sends it by the end of January.',                   folder: CLIENT_UPLOADS },
  { key: '1099_nec',           label: '1099-NEC or 1099-K',                    hint: 'From the clients, apps or payment platforms that paid you.',     folder: CLIENT_UPLOADS },
  { key: 'business_summary',   label: 'Business income and expenses for {year}', hint: 'A profit and loss, or a list of what came in and what went out.', folder: CLIENT_UPLOADS },
  { key: '1099_g',             label: '1099-G (unemployment)',                 hint: 'From your state unemployment office.',                            folder: CLIENT_UPLOADS },
  { key: '1099_investments',   label: '1099-INT, 1099-DIV or 1099-B',          hint: 'From your bank or broker. Include any crypto statements.',        folder: CLIENT_UPLOADS },
  { key: '1099_r',             label: '1099-R or SSA-1099',                    hint: 'For money taken from a retirement account, or Social Security.', folder: CLIENT_UPLOADS },
  { key: 'rental_summary',     label: 'Rental income and expenses for {year}', hint: 'For each property: the rent received, and what you spent on it.', folder: CLIENT_UPLOADS },
  { key: '1098',               label: 'Form 1098 (mortgage interest)',         hint: 'From your mortgage lender.',                                      folder: CLIENT_UPLOADS },
  { key: 'property_tax',       label: 'Property tax statement',                hint: 'From your county, or on your mortgage statement.',                folder: CLIENT_UPLOADS },
  { key: '1098_t',             label: 'Form 1098-T (tuition)',                 hint: "From the school's student portal.",                               folder: CLIENT_UPLOADS },
  { key: '1098_e',             label: 'Form 1098-E (student loan interest)',   hint: 'From your loan servicer.',                                        folder: CLIENT_UPLOADS },
  { key: 'childcare',          label: 'Childcare statement',                   hint: "The provider's name, address, tax ID, and the amount you paid.",  folder: CLIENT_UPLOADS },
  { key: '1095_a',             label: 'Form 1095-A (Marketplace insurance)',   hint: 'From HealthCare.gov or your state exchange.',                     folder: CLIENT_UPLOADS },
  { key: 'donations',          label: 'Donation receipts',                     hint: 'Receipts, or a list of what you gave and to whom.',               folder: CLIENT_UPLOADS },
  { key: 'estimated_payments', label: 'Estimated tax payments for {year}',     hint: 'The dates and amounts, or the IRS payment confirmations.',        folder: CLIENT_UPLOADS },
  { key: 'irs_letters',        label: 'Letters from the IRS or your state',    hint: 'Any notice you received about your taxes.',                       folder: 'tax_irs_notices' },
  { key: 'ip_pin',             label: 'IP PIN letter (CP01A)',                 hint: 'Or a screenshot of your 6-digit PIN from your IRS account.',      folder: 'tax_ip_pins' },
];

/** A document's label for a season: "Your 2025 tax return". */
export function taxDocLabel(doc: TaxDoc, season: string): string {
  const year = taxYearOf(season);
  return doc.label.replace('{year}', year).replace('{prior}', String(Number(year) - 1));
}

// ── The questions ────────────────────────────────────────────────────────────

export type TaxSection = 'household' | 'income' | 'deductions' | 'irs';

export const TAX_SECTIONS: { key: TaxSection; title: string }[] = [
  { key: 'household',  title: 'You and your household' },
  { key: 'income',     title: 'Your income' },
  { key: 'deductions', title: 'Deductions, credits and payments' },
  { key: 'irs',        title: 'The IRS' },
];

export interface TaxChoice { value: string; label: string }

export interface TaxQuestion {
  /** Stable: answers are stored against it. */
  key: string;
  section: TaxSection;
  /** {year} is the tax year. */
  text: string;
  /** Yes or no, or one of `choices`. */
  kind: 'yes_no' | 'choice';
  choices?: TaxChoice[];
  /** A YES also asks for a few words, under this prompt, and is not finished without them. */
  detail?: string;
  /** The documents a YES asks them to upload. */
  docs?: string[];
}

export const FILING_STATUSES: TaxChoice[] = [
  { value: 'single',            label: 'Single' },
  { value: 'married_joint',     label: 'Married, filing jointly' },
  { value: 'married_separate',  label: 'Married, filing separately' },
  { value: 'head_of_household', label: 'Head of household' },
  { value: 'surviving_spouse',  label: 'Qualifying surviving spouse' },
  { value: 'not_sure',          label: "Not sure: we'll work it out together" },
];

export const TAX_QUESTIONS: TaxQuestion[] = [
  // You and your household
  { key: 'filing_status', section: 'household', kind: 'choice', choices: FILING_STATUSES,
    text: 'How do you expect to file for {year}?' },
  { key: 'first_year',    section: 'household', kind: 'yes_no', docs: ['prior_return'],
    text: 'Is this your first year filing with FTG?' },
  { key: 'dependents',    section: 'household', kind: 'yes_no',
    text: 'Do you have dependents: children, or anyone else you support?',
    detail: 'Their names, dates of birth, and how they are related to you.' },
  { key: 'life_changes',  section: 'household', kind: 'yes_no',
    text: 'Did anything big change in {year}: a marriage, a divorce, a new baby or a move?',
    detail: 'Tell us what changed, and when.' },

  // Your income
  { key: 'w2',            section: 'income', kind: 'yes_no', docs: ['w2'],
    text: 'Did you work a job that gives you a W-2?' },
  { key: 'self_employed', section: 'income', kind: 'yes_no', docs: ['1099_nec', 'business_summary'],
    text: 'Did you earn money freelancing, contracting, doing gig work or running your own business?' },
  { key: 'unemployment',  section: 'income', kind: 'yes_no', docs: ['1099_g'],
    text: 'Did you receive unemployment benefits?' },
  { key: 'investments',   section: 'income', kind: 'yes_no', docs: ['1099_investments'],
    text: 'Did you earn bank interest or dividends, or sell stocks or crypto?' },
  { key: 'retirement',    section: 'income', kind: 'yes_no', docs: ['1099_r'],
    text: 'Did you take money out of a retirement account, or receive Social Security?' },
  { key: 'rental',        section: 'income', kind: 'yes_no', docs: ['rental_summary'],
    text: 'Do you own a rental property?' },
  { key: 'other_income',  section: 'income', kind: 'yes_no',
    text: 'Any other income: alimony, gambling winnings, prizes or cash work?',
    detail: 'What was it, and about how much?' },

  // Deductions, credits and payments
  { key: 'home',          section: 'deductions', kind: 'yes_no', docs: ['1098', 'property_tax'],
    text: 'Do you own your home and pay a mortgage or property taxes?' },
  { key: 'tuition',       section: 'deductions', kind: 'yes_no', docs: ['1098_t'],
    text: 'Did you, your spouse or a dependent pay college tuition?' },
  { key: 'student_loans', section: 'deductions', kind: 'yes_no', docs: ['1098_e'],
    text: 'Did you pay interest on a student loan?' },
  { key: 'childcare',     section: 'deductions', kind: 'yes_no', docs: ['childcare'],
    text: 'Did you pay for childcare or daycare so you could work?' },
  { key: 'marketplace',   section: 'deductions', kind: 'yes_no', docs: ['1095_a'],
    text: 'Did you have health insurance through the Marketplace (HealthCare.gov or a state exchange)?' },
  { key: 'donations',     section: 'deductions', kind: 'yes_no', docs: ['donations'],
    text: 'Did you give to charity?' },
  { key: 'estimated',     section: 'deductions', kind: 'yes_no', docs: ['estimated_payments'],
    text: 'Did you make estimated tax payments for {year}?' },

  // The IRS
  { key: 'irs_letters',   section: 'irs', kind: 'yes_no', docs: ['irs_letters'],
    text: 'Did you get any letters from the IRS or your state tax office?' },
  { key: 'ip_pin',        section: 'irs', kind: 'yes_no', docs: ['ip_pin'],
    text: 'Do you have an Identity Protection PIN (IP PIN) from the IRS?' },
];

/** A question as it reads for a season. */
export const taxQuestionText = (q: TaxQuestion, season: string) =>
  q.text.replace('{year}', taxYearOf(season));

// ── Answers ──────────────────────────────────────────────────────────────────

export interface TaxAnswer {
  /** 'yes' or 'no', or the chosen value of a choice. null: not answered yet. */
  value: string | null;
  /** The few words a YES asked for. */
  text?: string;
}

export type TaxAnswers = Record<string, TaxAnswer>;

/**
 * Is this answer finished? NO always is. YES is, unless it asked for a few
 * words and they have not been written. A choice is, once one of its own
 * values is picked.
 */
export function isTaxAnswerComplete(q: TaxQuestion, a: TaxAnswer | undefined): boolean {
  if (!a?.value) return false;
  if (q.kind === 'choice') return (q.choices ?? []).some(c => c.value === a.value);
  if (a.value === 'no') return true;
  if (a.value !== 'yes') return false;
  return !q.detail || !!a.text?.trim();
}

/** The questions that still need something before the answers can be sent. */
export function unansweredTaxQuestions(answers: TaxAnswers): TaxQuestion[] {
  return TAX_QUESTIONS.filter(q => !isTaxAnswerComplete(q, answers[q.key]));
}

/**
 * The documents these answers call for, in the order of TAX_DOCS: a photo ID
 * always, their spouse's too when they file jointly, and whatever each YES
 * asked for. Nothing is asked for twice.
 */
export function taxChecklist(answers: TaxAnswers): TaxDoc[] {
  const wanted = new Set<string>(['photo_id']);
  if (answers.filing_status?.value === 'married_joint') wanted.add('spouse_photo_id');
  for (const q of TAX_QUESTIONS) {
    if (q.kind === 'yes_no' && answers[q.key]?.value === 'yes') (q.docs ?? []).forEach(k => wanted.add(k));
  }
  return TAX_DOCS.filter(d => wanted.has(d.key));
}

// ── Where each document stands ───────────────────────────────────────────────

/** A slot's status in document_requirements. */
export type TaxSlotStatus = 'pending' | 'approved' | 'rejected';

/**
 * One document, as the client sees it:
 *   needed     nothing sent yet
 *   sent       sent, FTG has not looked yet
 *   accepted   FTG accepted it
 *   sent_back  FTG sent it back, and nothing new has come since
 *   resent     sent back, and a new one is waiting for FTG
 *
 * A declined slot stays declined until FTG accepts a new file
 * (createPendingRequirement points it at the new upload but keeps it red),
 * so "resent" is read from the file it points at being one FTG has not
 * reviewed yet.
 */
export type TaxDocState = 'needed' | 'sent' | 'accepted' | 'sent_back' | 'resent';

export function taxDocState(slot: TaxSlotStatus | undefined, pointsAtUnreviewed: boolean): TaxDocState {
  if (!slot) return 'needed';
  if (slot === 'approved') return 'accepted';
  if (slot === 'rejected') return pointsAtUnreviewed ? 'resent' : 'sent_back';
  return 'sent';
}

/**
 * Can they say everything is in? Only when every document has something sent
 * for it and nothing FTG sent back is still waiting on them.
 */
export function canConfirmTaxDocs(states: TaxDocState[]): boolean {
  return states.length > 0 && states.every(st => st !== 'needed' && st !== 'sent_back');
}

// ── The steps ────────────────────────────────────────────────────────────────

export type TaxStepKey = 'welcome' | 'questions' | 'documents';

export const TAX_STEPS: { key: TaxStepKey; title: string; sub: string }[] = [
  { key: 'welcome',   title: 'Welcome',                 sub: 'What to expect this season' },
  { key: 'questions', title: 'Tell us about your year', sub: 'Your household, income and deductions' },
  { key: 'documents', title: 'Upload your documents',   sub: 'Only what your answers call for' },
];

export type TaxOnboardingStatus = 'in_progress' | 'submitted';

/** One client's onboarding for one season: a row of tax_onboarding. */
export interface TaxOnboarding {
  id: string;
  client_email: string;
  season: string;
  answers: TaxAnswers;
  /** The questionnaire's status. */
  status: TaxOnboardingStatus;
  welcomed_at: string | null;
  submitted_at: string | null;
  docs_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Which steps are done. A step is never done before the one before it. */
export function taxStepsDone(row: TaxOnboarding | null): Record<TaxStepKey, boolean> {
  const welcome   = !!row?.welcomed_at;
  const questions = welcome && row?.status === 'submitted';
  const documents = questions && !!row?.docs_confirmed_at;
  return { welcome, questions, documents };
}

/** The step to work on now, or null when every step is done. */
export function currentTaxStep(row: TaxOnboarding | null): TaxStepKey | null {
  const done = taxStepsDone(row);
  return TAX_STEPS.find(st => !done[st.key])?.key ?? null;
}
