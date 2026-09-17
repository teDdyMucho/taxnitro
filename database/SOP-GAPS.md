# Gaps found while writing the SOPs

Written 2026-09-17, from reading the code rather than running it.

These are places where the software does not do what its own buttons say. The
SOPs in `sops_seed.sql` document the behaviour as it actually is today, and each
of the procedures below carries a `known-issue` tag so they can be found and
rewritten once a fix ships.

Nothing here has been changed. Fixing any of it is a separate decision.

---

## 1. Late uploads credit the wrong month

**Confirmed as a bug by the product owner. Not yet fixed.**

`src/components/ClientUploadModal.tsx:410` writes the requirement slot with
`monthOf()` — today's month — while the same upload stores the client's chosen
month on the document itself (`:378`). The comment three lines above the picker
(`:175-176`) states the intent plainly: "a January statement can arrive in
March." The requirement write ignores it.

So a January statement uploaded in March credits March's checklist. January's
stays incomplete no matter what the client sends.

The fix is to pass `period` instead of `monthOf()` at `:410`. It looks like a
one-line change, with two consequences worth thinking about first:

- Past months' progress figures will change the moment it ships, because
  existing rows keep the month they were stamped with. A backfill would need to
  re-derive each slot's month from its document's `period`.
- A client could then complete a month that has already been closed and
  reported, which nothing currently guards against.

SOPs affected: `client-late-upload-month`, `internal-upload-month-bug`.

---

## 2. "Send Invite" sends no email

`src/db/pendingStaff.ts:32-46` writes a row to `pending_staff` and does nothing
else. The UI reports "Invite Sent!" (`StaffManagementScreen.tsx:202`).

Nobody is contacted. Unless an admin separately tells the person to sign up, the
invite sits unused indefinitely.

Either wire it to an email, or change the button and confirmation to say what it
does — something like "Save invite" and "Role will be applied when they sign
up. Tell them to create an account."

SOP affected: `internal-staff-onboarding`.

---

## 3. Query items raised in Phase C or D are silently discarded

`supabase_workflow_schema.sql:72` constrains `phase_added` to `('A','B')`, but
`WorkflowPhaseBase.tsx:167` passes the current phase, and the panel renders in
all four. `addQueryItem` only `console.error`s on failure
(`src/db/workflow.ts:356`) and the caller ignores the return value, so the
dialog closes as though it saved.

A staff member in Phase C can raise a query item, see it accepted, and have it
not exist.

Either widen the constraint to `('A','B','C','D')`, or hide the panel outside
A and B. Either way the error should surface — the silent failure is the worst
part of this.

SOP affected: `internal-query-items`.

---

## 4. `client_notified_at` is never written

`markClientNotified()` (`src/db/workflow.ts:249-256`) sets both
`client_notified_at` and `status: 'complete'`, but is never called. Completion
goes through the generic `updateWorkflowStatus`, which writes `status` only.

The column is therefore NULL on every completed workflow and cannot be used for
reporting or audit. The only evidence a client was notified is the FR-64
checkbox row, which records who ticked it and when — but ticking it does not
send anything (see below).

---

## 5. "Mark Complete & Notify Client" notifies nobody

No notification code exists in Phase D. The button sets status to `complete`.
FR-64 is an assertion by the staff member that they notified the client
elsewhere.

This is defensible as a manual process, but the button wording promises
otherwise, and combined with #4 there is no record of the notification beyond a
checkbox. Worth either automating or renaming.

SOP affected: `internal-report-sender`.

---

## 6. No way to send a workflow backwards

`NEXT_STATUS` (`src/db/workflow.ts:442-448`) is forward-only and nothing sets an
earlier status. A problem found in Phase D can only be resolved outside the
system or by deleting and recreating the workflow, which cascades away its
checklist, notes, query items, messages and drive links.

Not a bug exactly — but a real operational gap, and the reason the SOP tells
reviewers that Phase B is the last safe point for corrections.

SOP affected: `internal-workflow-no-rollback`.

---

## 7. Smaller things

- **Empty note resolutions are accepted.** `handleResolve`
  (`WorkflowPhaseBase.tsx:156-162`) has no guard on the resolution text, unlike
  `handleAddNote` which checks `!newNote.trim()`. The resolution is the only
  record of what was done about a reviewer's objection.
- **Message unread dots never clear.** `is_read` defaults false
  (`supabase_workflow_schema.sql:82`) and nothing ever sets it true.
- **SmartVault links cannot be edited or removed** once saved
  (`ReportSenderScreen.tsx:57-58`), and a wrong URL has no correction path.
- **`reconcile_requirements.sql` targets stale table names.** It checks
  `tax_required_documents`, `bk_required_documents` and `tax_client_uploads`,
  not the live collectors `bk_mr_required_info` / `cfo_mr_required_info`.
  Running it as written would delete live requirement slots. Its own NOTE
  acknowledges the list needs extending. **Do not run it.**
- **Staff can delete workflows.** The workflow dashboard computes `isAdmin`
  (`WorkflowDashboardScreen.tsx:50`) but never uses it; the cascading delete is
  available to any staff member.
- **Deactivated staff still appear** in the assignment picker
  (`src/db/profiles.ts:130-140` does not filter on `is_active`).
- **Bank account `last4` validation is inconsistent** between
  `normalizeBankAccounts` (id + bank only) and `isCompleteBankAccount` (bank +
  exactly 4 digits). Which applies depends on the write path, so an account can
  exist with a blank `last4` and produce a requirement labelled
  "Bank Statements — BDO" with no digits.
- **The questionnaire gate is bypassable.** The Documents-screen upload button
  (`DocumentsScreen.tsx:559`) opens the upload modal directly with no
  questionnaire check, and nothing enforces it at the database level.
