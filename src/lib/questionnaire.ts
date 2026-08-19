import { cleanBankAccounts, type BankAccount } from './bankAccounts';

// The monthly questionnaire for bookkeeping and CFO clients, asked before they
// start uploading for the month.
//
// The questions and the rule for when an answer is finished live here, apart
// from the queries, because three places need them — the client answering, the
// staff reading, and the gate that decides whether uploading may begin — and
// because a rule with no database attached can be checked on its own.

/** What a YES opens up. NO never asks for anything. */
export type FollowUp =
  | 'none'
  | 'bank_accounts'   // add the new account(s) they opened
  | 'closed_accounts' // pick which of their existing accounts closed
  | 'short_text'
  | 'long_text'
  | 'upload';         // documents, and the answer is not finished without them

export interface Question {
  /** Stable key — answers are stored against it, so never renumber. */
  key: string;
  text: string;
  followUp: FollowUp;
  /** Shown above the follow-up field. */
  prompt?: string;
}

export const QUESTIONS: Question[] = [
  {
    key: 'new_accounts',
    text: 'Were there any new bank or credit card accounts opened?',
    followUp: 'bank_accounts',
    prompt: 'Add the account details.',
  },
  {
    key: 'closed_accounts',
    text: 'Were any existing accounts closed?',
    followUp: 'closed_accounts',
    prompt: 'Which ones were closed?',
  },
  {
    key: 'unusual_transactions',
    text: 'Were there any unusual or large transactions that require explanation?',
    followUp: 'long_text',
    prompt: 'Please explain.',
  },
  {
    key: 'new_financing',
    text: 'Were there any new loans, financing agreements, or credit facilities obtained?',
    followUp: 'upload',
    prompt: 'Upload the agreement or statement.',
  },
  {
    key: 'outside_income',
    text: 'Did you receive any income outside your normal business operations?',
    followUp: 'long_text',
    prompt: 'Please describe.',
  },
  {
    key: 'major_purchases',
    text: 'Were there any major asset purchases (equipment, vehicles, computers, furniture)?',
    followUp: 'short_text',
    prompt: 'Please describe.',
  },
  {
    key: 'compliance',
    text: 'Were there any compliance issues we should be aware of?',
    followUp: 'long_text',
    prompt: 'Please explain.',
  },
  {
    key: 'assets_bought',
    text: 'Did the business purchase any assets?',
    followUp: 'short_text',
    prompt: 'Please describe.',
  },
  {
    key: 'assets_disposed',
    text: 'Did the business dispose of any assets?',
    followUp: 'short_text',
    prompt: 'Please describe.',
  },
  {
    key: 'review_requests',
    text: 'Are there any transactions you would like us to review?',
    followUp: 'long_text',
    prompt: 'List the transactions.',
  },
  {
    key: 'anything_else',
    text: "Is there anything else that may affect this month's bookkeeping?",
    followUp: 'long_text',
    prompt: 'Please add the details.',
  },
];

/** A document attached to an answer. */
export interface AnswerFile {
  name: string;
  url: string;
}

export interface Answer {
  /** null = not answered yet. */
  value: 'yes' | 'no' | null;
  text?: string;
  /** New accounts they opened, for the first question. */
  accounts?: BankAccount[];
  /** Ids of their existing accounts that closed, for the second. */
  closed?: string[];
  /**
   * Those same accounts as they read at the time. Closing one takes it off the
   * profile, so the ids alone would leave the record unreadable a month later.
   */
  closedAccounts?: BankAccount[];
  files?: AnswerFile[];
}

export type Answers = Record<string, Answer>;

export type QuestionnaireStatus = 'in_progress' | 'submitted';

export interface Questionnaire {
  id: string;
  client_email: string;
  /** 'YYYY-MM', matching document_requirements. */
  month: string;
  status: QuestionnaireStatus;
  answers: Answers;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const emptyAnswers = (): Answers =>
  Object.fromEntries(QUESTIONS.map(q => [q.key, { value: null } as Answer]));

/**
 * Is this answer finished?
 *
 * NO is always finished. YES needs whatever it opened up — and for the
 * financing question that means an actual document, so hitting YES by accident
 * cannot be submitted until they either upload or change the answer to NO.
 */
export function isAnswerComplete(q: Question, a: Answer | undefined): boolean {
  if (!a || a.value == null) return false;
  if (a.value === 'no') return true;
  switch (q.followUp) {
    case 'none':            return true;
    case 'short_text':
    case 'long_text':       return !!a.text?.trim();
    // A card that has been added but not filled in is not an answer.
    case 'bank_accounts':   return cleanBankAccounts(a.accounts ?? []).length > 0;
    case 'closed_accounts': return (a.closed ?? []).length > 0;
    case 'upload':          return (a.files ?? []).length > 0;
  }
}

/** Which questions still need something before it can be submitted. */
export function unfinishedQuestions(answers: Answers): Question[] {
  return QUESTIONS.filter(q => !isAnswerComplete(q, answers[q.key]));
}
