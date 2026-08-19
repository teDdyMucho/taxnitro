import { supabase } from '../lib/supabase';
import {
  QUESTIONS, Answers, Questionnaire, QuestionnaireStatus,
} from '../lib/questionnaire';

// Reading and writing the monthly questionnaire. The questions themselves, and
// the rule for when an answer counts as finished, are in lib/questionnaire.ts.
//
// Re-exported here so a screen can take everything from one import.
export * from '../lib/questionnaire';

// ── Reading and writing ──────────────────────────────────────────────────────

/** This month's questionnaire for a client, or null if not started. */
export async function getQuestionnaire(
  clientEmail: string,
  month: string,
): Promise<Questionnaire | null> {
  if (!clientEmail) return null;
  const { data, error } = await supabase
    .from('monthly_questionnaires')
    .select('*')
    .eq('client_email', clientEmail)
    .eq('month', month)
    .maybeSingle();
  if (error) { console.error('getQuestionnaire:', error.message); return null; }
  return data ? (data as Questionnaire) : null;
}

/** Every month a client has answered, newest first — the staff view. */
export async function listQuestionnaires(clientEmail: string): Promise<Questionnaire[]> {
  if (!clientEmail) return [];
  const { data, error } = await supabase
    .from('monthly_questionnaires')
    .select('*')
    .eq('client_email', clientEmail)
    .order('month', { ascending: false });
  if (error) { console.error('listQuestionnaires:', error.message); return []; }
  return (data ?? []) as Questionnaire[];
}

/**
 * Write the answers so far. Saving and submitting are the same call with a
 * different status, so a half-finished questionnaire is never lost — Camaree
 * asked for exactly that on the financing question.
 */
export async function saveQuestionnaire(
  clientEmail: string,
  month: string,
  answers: Answers,
  status: QuestionnaireStatus,
): Promise<Questionnaire | null> {
  if (!clientEmail) return null;
  const { data, error } = await supabase
    .from('monthly_questionnaires')
    .upsert(
      {
        client_email: clientEmail,
        month,
        answers,
        status,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      },
      { onConflict: 'client_email,month' },
    )
    .select('*')
    .single();
  if (error) { console.error('saveQuestionnaire:', error.message); return null; }
  return data as Questionnaire;
}

/** Has this client finished the questionnaire for this month? */
export async function isQuestionnaireDone(clientEmail: string, month: string): Promise<boolean> {
  const q = await getQuestionnaire(clientEmail, month);
  return q?.status === 'submitted';
}
