-- ============================================================
-- SOPS SEED  (the starting knowledge base)
--
-- Every procedure below was read out of the code rather than written from
-- memory, so each one says what the software actually does today — including
-- where that differs from what its own buttons promise. A procedure that
-- describes an intention the system does not carry out is worse than no
-- procedure, because someone follows it and believes the step happened.
--
-- Where behaviour is known to be wrong, the SOP says so in the body and the
-- 'known-issue' tag marks it. Those are listed in database/SOP-GAPS.md.
--
-- Run database/sops.sql first.
--
-- SAFE TO RE-RUN — upserts on slug, so editing a body here and re-running
-- updates the procedure in place instead of adding a second copy.
-- ============================================================

insert into public.sops (slug, title, body, audience, category, tags, services) values

-- ══════════════════════════════════════════════════════════════
-- CLIENT-FACING
-- ══════════════════════════════════════════════════════════════

('client-required-documents-bk',
 'What documents do I need to send each month? (Bookkeeping)',
 E'Bookkeeping clients send four things each month:\n\n'
 '1. **Bank Statements (all accounts)**\n'
 '2. **Credit Card Statements**\n'
 '3. **Loan Statements**\n'
 '4. **Payroll Reports**\n\n'
 'Your dashboard shows these as a checklist under **Required Documents**, with a progress bar reading "N of 4 required items accepted".\n\n'
 'If you have told us about your individual bank accounts, the first line is replaced by one line per account — for example "Bank Statements — BDO ••••4821". Each account is then ticked off separately, so the total goes up accordingly. If we have no account details on file, you will see the single combined line instead.',
 'client', 'requirements', array['required documents','what do i send','monthly documents','checklist','bookkeeping'], array['BK']),

('client-required-documents-cfo',
 'What documents do I need to send each month? (CFO)',
 E'CFO clients send six things each month:\n\n'
 '1. **Bank Statements (all accounts)**\n'
 '2. **Credit Card Statements**\n'
 '3. **Loan Statements**\n'
 '4. **Payroll Reports**\n'
 '5. **Prior Month Bookkeeping / QBO Access**\n'
 '6. **AR / AP Aging**\n\n'
 'Item 5 disappears from your list if we already have QBO access — there is nothing to send, and your progress bar counts out of five instead of six.\n\n'
 'As with bookkeeping, if we hold your individual bank account details, the bank line is replaced by one line per account.',
 'client', 'requirements', array['required documents','what do i send','monthly documents','checklist','cfo','qbo'], array['CFO']),

('client-required-documents-tax',
 'What documents do I need to send? (Tax)',
 E'Tax clients have **no monthly required-document checklist**. Nothing is tracked against a month and there is no progress bar to complete.\n\n'
 'Instead you upload into whichever folder fits what you are sending:\n\n'
 '- Tax Contracts\n'
 '- Tax Invoices\n'
 '- Client Uploads\n'
 '- Additional Tax Docs\n'
 '- Tax Returns\n'
 '- Previous Tax Returns\n'
 '- Previous Year Transcripts\n\n'
 'Send what your accountant has asked for. If you are unsure which folder, use **Client Uploads** and we will file it correctly.',
 'client', 'requirements', array['tax','required documents','what do i send','tax folders'], array['TAX']),

('client-upload-a-document',
 'How do I upload a document?',
 E'1. Press **Upload** in the sidebar (or the upload button inside any folder).\n'
 '2. Choose **what the document is** from the list. Items marked with a gold dot count toward your monthly progress.\n'
 '3. Pick the **month the documents cover** — not today''s date. A January statement you send in March should be marked January.\n'
 '4. Drag your files in, or press to browse. You can send several files, and several different document types, in one go.\n'
 '5. Add a note if there is something we should know about the file.\n'
 '6. Press **Upload**.\n\n'
 'Files are sent one at a time, so if one fails the rest still arrive. You will see a confirmation listing anything that did not go through.\n\n'
 'Once uploaded, the item turns **yellow (Pending)** on your dashboard until a member of our team reviews it.',
 'client', 'uploads', array['upload','send a file','how to upload','attach document','submit documents'], array[]::text[]),

('client-upload-status-meaning',
 'What do the colours on my checklist mean?',
 E'Each required item shows one of four states:\n\n'
 '- **Grey, no badge** — nothing uploaded yet.\n'
 '- **Yellow, "Pending"** — you have uploaded a file and it is waiting for our team to review.\n'
 '- **Green, "Accepted"** — we have reviewed and accepted it. Only accepted items count toward your progress bar.\n'
 '- **Red, "Declined"** — we could not use the file. Open the document to read why, then upload a replacement.\n\n'
 'Your progress bar counts **accepted items only**, so it does not move when you upload — it moves when we accept.\n\n'
 'The dashboard updates by itself as we review. You do not need to refresh.',
 'client', 'requirements', array['pending','accepted','declined','colours','status','progress bar','green','red','yellow'], array[]::text[]),

('client-upload-declined',
 'My upload was declined — what do I do?',
 E'A red **Declined** badge means we could not use the file. The most common reasons are a missing page, an unreadable scan, or the wrong month.\n\n'
 'Open the document from your Documents page to read the reason our team left.\n\n'
 'Then simply upload a corrected file against the same item. **The item stays red until we accept the new file** — uploading alone does not clear it. Once we accept the replacement it turns green.\n\n'
 'You do not need to delete the declined file first.',
 'client', 'requirements', array['declined','rejected','red','failed','re-upload','fix upload'], array[]::text[]),

('client-monthly-questionnaire',
 'What is the monthly questionnaire?',
 E'Bookkeeping and CFO clients answer ten short yes/no questions before uploading each month. They tell us what to look for in your books so nothing is miscoded. **Tax-only clients are not asked.**\n\n'
 'The questions cover: new accounts, closed accounts, unusual or large transactions, new loans or financing, income outside normal operations, compliance issues, assets bought, assets disposed of, anything you want reviewed, and anything else affecting the month.\n\n'
 'Answering **No** to a question is always enough on its own. Answering **Yes** asks one follow-up — an explanation, account details, or a document.\n\n'
 'You can press **Save for later** and return; a saved draft does not count as submitted. The questionnaire opens automatically when you press Upload from the sidebar and have not yet submitted it for the month.\n\n'
 'One thing worth knowing: if you tick an account as **closed**, we stop asking for its statements from the following month. That only happens when you submit, not when you save a draft.',
 'client', 'account', array['questionnaire','monthly questions','ten questions','survey','before upload'], array['BK','CFO']),

('client-late-upload-month',
 'I uploaded a statement for an earlier month — why did it not count?',
 E'**Please tell us when you do this, so we can credit the right month by hand.**\n\n'
 'Right now the checklist credits the month you *send* a document, not the month the document *covers*. So a January statement uploaded in March ticks off March''s checklist rather than January''s — even though you correctly marked it as January on the upload screen.\n\n'
 'The month you pick is still recorded on the document itself, so your accountant sees the correct period and your books are unaffected. It is only the dashboard progress bar that counts it against the wrong month.\n\n'
 'This is a known problem and we are fixing it. Until then, if you are catching up on an earlier month, let us know and we will correct the checklist for you.',
 'client', 'requirements', array['wrong month','late upload','january','previous month','did not count','catch up','known-issue'], array[]::text[]),

('client-cannot-upload',
 'I can''t upload — the button does nothing, or I can''t add files',
 E'Work through these in order. Most cases are one of the first three.\n\n'
 '1. **Did you choose a document type first?** The file area stays locked until you pick what the document is — it reads "Pick a document type first". Choose the item from the list, then add your files.\n\n'
 '2. **Is a file actually attached?** The **Upload** button stays greyed out until at least one file is in the list. After choosing files you should see "N files ready".\n\n'
 '3. **Did the questionnaire open instead?** Bookkeeping and CFO clients answer ten short questions before uploading each month. If that appeared, finish and submit it — the upload screen opens by itself afterwards.\n\n'
 '4. **Try a different way in.** If you pressed Upload in the sidebar, open **Documents**, go into the folder you want, and use the upload button there instead.\n\n'
 '5. **Refresh the page and sign in again.** A session that has been open a long time can stop accepting uploads.\n\n'
 'If none of these work, tell us and we will raise it with our team. It helps if you say what happens when you press the button, and whether you got as far as attaching a file.',
 'client', 'uploads', array['cannot upload','can not upload','upload not working','button does nothing','stuck','broken','error','troubleshoot','file won''t attach'], array[]::text[]),

('client-who-sees-my-documents',
 'Who can see what I upload?',
 E'Your documents are visible to you and to the Finance Therapy Group staff working on your account. Other clients cannot see them — every document is tied to your account and the database enforces that on every single request, not just in the app.\n\n'
 'Notes you add to a file are read by our team and answered on the same file, so the conversation stays attached to the document it is about.',
 'client', 'account', array['privacy','who can see','security','confidential','other clients'], array[]::text[]),

-- ══════════════════════════════════════════════════════════════
-- INTERNAL — staff and admin only
-- ══════════════════════════════════════════════════════════════

('internal-workflow-overview',
 'The monthly bookkeeping workflow: four phases',
 E'One workflow instance covers **one client for one calendar month**. It moves through four phases in a fixed order:\n\n'
 '| Phase | Status | What happens |\n'
 '|---|---|---|\n'
 '| A | `processor` | 16-item checklist. Ends "Submit to Reviewer". |\n'
 '| B | `reviewer` | 14-item checklist. The reviewer raises notes here. |\n'
 '| C | `reprocessor` | 4 items, **plus every reviewer note must be resolved**. |\n'
 '| D | `report_sender` | 5 items. Saves reports to SmartVault, notifies the client. |\n'
 '| — | `complete` | Done. No screen; the card opens nothing. |\n\n'
 'A phase advances only when **every applicable checklist item is ticked**. Phase C additionally requires all reviewer notes resolved — it is the only phase with a second gate.\n\n'
 'Some items are conditional: loan items in Phase A appear only if the workflow is marked as having loans; the fixed-assets item in Phase B only if marked as having fixed assets.\n\n'
 '**There is no way to send a workflow backwards.** Corrections travel forward as reviewer notes for Phase C to resolve. If a problem is found in Phase D there is no route back — see [internal-workflow-no-rollback].',
 'internal', 'workflow', array['workflow','phases','processor','reviewer','reprocessor','report sender','pipeline'], array['BK','CFO']),

('internal-workflow-no-rollback',
 'A workflow cannot be sent backwards',
 E'**Known limitation. Read before starting Phase D.**\n\n'
 'The workflow only moves forward. No screen or action sets a workflow to an earlier phase, and none is planned into the current code.\n\n'
 'This means: if the Report Sender finds a problem in Phase D, there is no supported way to return it to Reprocessing. The only options are to fix it outside the system, or to **delete the workflow and recreate it** — which permanently destroys its checklist, notes, query items, messages and drive links.\n\n'
 '**Practical guidance:** the Reviewer (Phase B) is the last point where a correction can be routed through the system properly. Review thoroughly there. In Phase D, verify the reports before ticking anything.\n\n'
 'If you must delete and recreate, note what was in the notes first — they are not recoverable.',
 'internal', 'workflow', array['rollback','go back','undo','mistake','delete workflow','known-issue'], array['BK','CFO']),

('internal-reviewer-notes',
 'Raising and resolving reviewer notes',
 E'Reviewer notes are how a correction travels from Phase B to Phase C. They are the system''s only rejection mechanism.\n\n'
 '**Raising (Phase B only).** The Add button for notes appears only on the Reviewer screen. Write what needs correcting, specifically enough that the reprocessor can act without asking. An unresolved note does **not** block you from submitting Phase B — it becomes Phase C''s problem, which is the intent.\n\n'
 '**Resolving (Phase C only).** Each note has a Resolve button that asks how it was resolved. **Every note must be resolved before Phase C can advance** — this is the one hard gate in the workflow beyond the checklists.\n\n'
 'Two cautions:\n\n'
 '- The resolution text is **not validated**. An empty resolution is accepted and the note counts as resolved. Write a real one — it is the only record of what was done.\n'
 '- Phase C requires **all** notes on the workflow resolved, from any phase and any author, not just the current reviewer''s.',
 'internal', 'workflow', array['notes','reviewer notes','reject','correction','resolve','query'], array['BK','CFO']),

('internal-report-sender',
 'Phase D: sending reports to the client',
 E'Phase D places three documents in **SmartVault** for the client: the **Balance Sheet**, the **Profit & Loss**, and the **Query Sheet**.\n\n'
 'The five checklist items are: review the Query Sheet for client-readiness, save each of the three documents to SmartVault, and send the client notification.\n\n'
 '**The app does not send anything.** This is the single most important thing to understand about this phase. Item FR-64 ("Send client notification") is a checkbox you tick to record that *you* notified the client by some other means. No email, no in-app notification and no document transfer happens when you tick it, and none happens when you press **Mark Complete & Notify Client** — despite the button''s wording.\n\n'
 '**So: actually send the notification yourself, then tick the box.**\n\n'
 'Two further notes:\n\n'
 '- The SmartVault link slots are **optional** — the phase completes with none saved — and **cannot be edited once saved**. Paste carefully; a wrong URL cannot be corrected from this screen.\n'
 '- A saved link does not appear as saved until you reopen the screen. It did save.',
 'internal', 'workflow', array['report sender','smartvault','send reports','notify client','phase d','complete','known-issue'], array['BK','CFO']),

('internal-query-items',
 'Query Sheet items: raise them in Phase A or B only',
 E'**Raise query items in Phase A or B. A query item raised in Phase C or D is silently thrown away.**\n\n'
 'The panel appears in all four phases and looks identical everywhere, but the database only accepts items tagged to phases A or B. An item added from Phase C or D is rejected by the database, no error is shown, and the dialog closes as though it worked. The item does not exist.\n\n'
 'This is a known bug. Until it is fixed, if something needs querying during Phase C or D, raise it as a team message on the workflow or handle it outside the system.\n\n'
 'Other things worth knowing about query items:\n\n'
 '- Unresolved query items **never block** a phase from advancing. Only reviewer notes do that.\n'
 '- Resolving one takes a single tap with no confirmation and no note. There is no undo.\n'
 '- The "Needs client input" toggle is **staff-visible only**. There is no client-facing screen for query items, so ticking it does not ask the client anything. Contact them directly.',
 'internal', 'workflow', array['query sheet','query items','needs client input','phase c','known-issue'], array['BK','CFO']),

('internal-workflow-assignment',
 'Assignment is a label, not a lock',
 E'Assigning a Processor and a Reviewer is **informational only**. Nothing in the app or the database restricts who can act on a workflow: any staff or admin can open any workflow in any phase and tick any item, assigned or not.\n\n'
 'Consequences worth knowing:\n\n'
 '- There is **no "my work" view**. Everyone sees every client''s workflow for the selected month.\n'
 '- Assignment is **optional** — a workflow can be created with nobody assigned, and nothing flags or queues it.\n'
 '- **Phases C and D have no assignee field at all.** Who reprocesses and who sends reports is not recorded on the workflow.\n'
 '- Assignment can be changed at any time, including after completion. Tapping the currently-assigned person clears it.\n'
 '- The staff list offered for assignment includes **deactivated** members.\n\n'
 'The client on a workflow **cannot** be changed after creation — deliberately, since changing it would move a month of checklist and notes to the wrong client.\n\n'
 'Because none of this is enforced by software, coordinate by agreement. Check the assignment before starting work on a workflow that is not yours.',
 'internal', 'workflow', array['assignment','assign','my work','who does what','reassign','claim'], array['BK','CFO']),

('internal-approve-reject-upload',
 'Approving and declining a client upload',
 E'A client upload arrives as a document in the service''s Required Info collector folder, with the required item''s name prefixed to the filename — for example "Bank Statements — BDO ••••4821 — january.pdf". That prefix is how the system knows which checklist slot the file answers.\n\n'
 '**Approving** flips the client''s checklist item to green **Accepted** and moves their progress bar. It also clears a previous Declined state if the client has re-uploaded.\n\n'
 '**Declining** turns the item red **Declined** on the client''s dashboard. Write the reason on the file — the client reads it there, and it is the only explanation they get.\n\n'
 'Rules that matter:\n\n'
 '- The client''s progress bar counts **accepted items only**. Their upload alone never moves it.\n'
 '- A declined item **stays red** if the client re-uploads. Only your approval of the new file clears it. Re-check declined items when a client says they have fixed something.\n'
 '- One slot per item per month, no matter how many files the client sends for it.\n'
 '- **Deleting the fulfilling file deletes the credit** — the item reverts to grey, as if never uploaded.',
 'internal', 'documents', array['approve','decline','reject','review upload','accept document','progress'], array['BK','CFO']),

('internal-upload-month-bug',
 'Late uploads credit the wrong month',
 E'**Known bug. Affects any client catching up on an earlier month.**\n\n'
 'The upload screen asks the client which month the documents cover, and correctly stores that on the document. But the **checklist slot is always stamped with the current month**, ignoring what the client picked.\n\n'
 'So a January bank statement uploaded in March: the document carries period January (correct, and what the accountant sees), while the checklist credit lands on **March** (wrong).\n\n'
 'Consequences:\n\n'
 '- A client catching up on old months appears to be completing the *current* month.\n'
 '- The earlier month''s checklist stays incomplete no matter what they send.\n'
 '- Progress percentages for past months are unreliable where late uploads happened.\n\n'
 '**Until this is fixed:** when a client tells you they are uploading for an earlier month, correct the requirement row by hand, and do not read a past month''s progress bar as fact without checking the document periods.\n\n'
 'The books themselves are unaffected — only the dashboard counter is wrong.',
 'internal', 'requirements', array['wrong month','late upload','period','monthOf','bug','known-issue'], array['BK','CFO']),

('internal-staff-onboarding',
 'Adding a new staff member',
 E'From **Staff → Add Staff**, enter their email and pick the role.\n\n'
 '**If they already have an account**, the role is applied immediately. Note the email match is **case-sensitive** — a mismatch silently falls through to the invite path below instead.\n\n'
 '**If they do not have an account yet**, you create a pending invite. The role is applied automatically the moment they sign up, with no approval step afterwards.\n\n'
 '**"Send Invite" does not send an email.** It writes a database row and nothing more, despite the button text and the "Invite Sent!" confirmation. **You must contact the person separately and tell them to sign up.** If you do not, nothing happens and the invite sits unused.\n\n'
 'Other rules:\n\n'
 '- Re-inviting the same address replaces the previous invite, so changing your mind about the role just means inviting again.\n'
 '- Cancelling an invite does not stop them signing up — they simply arrive as a normal client.\n'
 '- You cannot demote yourself, or demote the last remaining admin.\n'
 '- Admins cannot be deactivated from this screen; demote first.\n'
 '- A member who has touched any workflow **cannot be deleted** — deleting them would break that history. Deactivate instead, which preserves everything and only blocks sign-in.',
 'internal', 'account', array['staff','onboarding','invite','new hire','add staff','role','admin','deactivate'], array[]::text[]),

('internal-roles',
 'What admin can do that staff cannot',
 E'Within the bookkeeping workflow, **staff and admin have identical powers**. Both can create, edit, advance and delete any workflow, including the cascading delete that destroys notes and messages.\n\n'
 'The only real difference: **admins can reach the Staff page** and manage people — inviting, promoting, demoting, deactivating, deleting.\n\n'
 'Clients can read only their own data, and the database enforces that on every request rather than relying on the app to ask correctly.\n\n'
 'Do not assume a workflow action is admin-gated. It is not.',
 'internal', 'account', array['roles','permissions','admin','staff','who can','access'], array[]::text[]),

('internal-required-items-reference',
 'Required items: the exact list and when each applies',
 E'**Bookkeeping (4):** Bank Statements (all accounts), Credit Card Statements, Loan Statements, Payroll Reports.\n\n'
 '**CFO (6):** the same four, plus Prior Month Bookkeeping / QBO Access, and AR / AP Aging.\n\n'
 '**Tax: none.** Tax has no required-item list and no monthly tracking; the database rejects any attempt to create one. Tax clients upload into flat folders instead.\n\n'
 'Two conditions change a client''s list:\n\n'
 '1. **QBO access.** Setting "we already have QBO access" on a CFO client''s profile removes *Prior Month Bookkeeping / QBO Access* from their list entirely, and from the denominator — their bar counts out of 5, not 6.\n\n'
 '2. **Bank accounts.** If a client has individual accounts recorded, the single *Bank Statements (all accounts)* line is replaced by **one line per account**, labelled like "Bank Statements — BDO ••••4821". Three accounts means three separate items to accept. With no accounts recorded, the single combined line stays.\n\n'
 'Credit cards do **not** expand per card, only bank accounts do.\n\n'
 'A client with no services recorded is treated as Bookkeeping.\n\n'
 '**Never reuse or renumber a bank account id.** The checklist slot depends on it, and reusing one silently re-points a historical month''s record. When a client closes an account through the questionnaire, its item stops appearing from the next month; historical rows remain and show as "(removed account)".',
 'internal', 'requirements', array['required items','list','qbo','bank accounts','expansion','denominator'], array['BK','CFO','TAX'])

on conflict (slug) do update set
  title    = excluded.title,
  body     = excluded.body,
  audience = excluded.audience,
  category = excluded.category,
  tags     = excluded.tags,
  services = excluded.services;
