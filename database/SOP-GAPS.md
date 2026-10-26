# Gaps found while writing the SOPs

Rewritten 2026-10-22, when the SOPs were rewritten for the app as it is now
(`sops_seed.sql`). First written 2026-09-17.

These are places where the app does not do what its own buttons say, or where
something breaks. The SOPs describe the behaviour as it actually is, and a
procedure affected by one of these carries the `known-issue` tag so it can be
found and rewritten once the fix ships.

Items marked **checked** were confirmed against the code and, where possible,
run. The rest come from reading the code screen by screen and have not been
tried in the live app. Fixing any of them is a separate decision.

---

## Most urgent

### 1. Deactivated staff and admins kept full access (fixed)

**Staff → Deactivate** only sets `profiles.is_active = false`
(`src/db/profiles.ts:198-200`). Sign-in never reads it
(`src/context/AuthContext.tsx`), and `is_staff_or_admin()`, which the folder
policies use, checks the role alone (`database/sops.sql:28-31`). So a
deactivated staff member can still sign in and read every client's files. The
dialog promises they "won't be able to sign in". A deactivated **Team One**
login does lose its clients, because `is_team_one()` checks `is_active`.

Fixed 2026-10-23: `is_staff_or_admin()` requires `is_active`, in every copy
(`database/staff_active_only.sql`), so every policy built on it shuts at once;
and the app signs a switched-off staff, admin or Team One login straight out
with "This account is switched off" (`src/context/AuthContext.tsx`). Clients
are not affected.

SOP: `internal-staff-manage`.

### 2. Team One could not send an update east of UTC (checked, fixed in this change)

`isIsoDate()` read the date as local midnight and compared it in UTC
(`src/components/DateField.tsx`), so from Manila every date failed and **Send for
Review** stayed off. The earliest allowed day was also the UTC day
(`TeamOneUpdateModal.tsx`). Both now work on the calendar day in any time zone.

### 3. Forgot Password was a dead end (fixed)

`resetPasswordForEmail` sends people to `financetherapygroup://reset-password`
(`src/context/AuthContext.tsx:276-278`), an app link that nothing handles: the
web app has no such scheme and no screen to choose a new password. **Change
Password** needs the current one. Today the only way is staff setting one in
**Update Profile → Change Password** (client logins only).

Fixed in the app 2026-10-23: the link now comes back to the web app, which
shows "Choose a new password" (`src/screens/auth/SetPasswordScreen.tsx`), and a
link that expired says so. Two settings in Supabase decide whether it reaches
people: **Authentication → URL Configuration** must list the app's address
under Redirect URLs (or as the Site URL), and **Authentication → Emails** needs
custom SMTP, since Supabase's own sender only mails the project's team. The
SOPs keep saying "ask FTG" until a real reset email has been seen to arrive.

Fixed 2026-10-26: Supabase's Send Email hook hands every sign-in email to
`supabase/functions/auth-email`, which sends it from info@ through n8n
(`automation/n8n/ftg-account-email.json`), so no other mail service is needed.
A real reset went out to info+test@ the same day, and the SOPs now describe it.

SOPs: `client-forgot-password`, `internal-client-password`, `teamone-getting-started`.

### 4. Staff and Team One logins cannot be created in the app (checked)

**Send Invite** writes a `pending_staff` row and nothing else
(`src/db/pendingStaff.ts:32-46`), yet says "Invite Sent!". The sign-in page has
no sign-up link (`LoginScreen.tsx:40` never uses its register handler), and the
`admin-users` function makes client logins only (`create_client` sets role
`client`). So an invited person has no way to make their account.

Fix: an `admin-users` action that creates a staff or Team One login with a
password, the way **Add Client** does, used by **Add Staff**.

SOP: `internal-staff-onboarding`.

### 5. Errors and confirmations did not show on the web (fixed)

Fixed 2026-10-23: `src/lib/webAlert.ts` shows the browser's own box for every
`Alert.alert` on the web, loaded first in `App.tsx`. What it was:

`Alert.alert` does nothing in react-native-web, and the web is where everyone
uses the app. So these fail or succeed without a word:
- Change Password and Edit Profile (`ProfileScreen.tsx:116,137,206-214`)
- upload failures (`ClientUploadModal.tsx:439,477,485`)
- approve, reject and rename errors (`DocumentsScreen.tsx:867,896,1410`)
- a file message or Team One chat message that did not send (`FileConversationPanel.tsx:147`, `TeamOneChatPanel.tsx:82`)
- Add New Folder, Rename Folder, Rename Document (`ClientDocumentsScreen.tsx:514-518,1188-1190,1241-1244`)
- forgot-password errors (`LoginScreen.tsx:188,197`)
- any confirmation built on `Alert.alert`, which never runs its button

Fix: one small web version of `Alert.alert` (the browser's alert and confirm),
installed once at start-up.

SOPs: `client-cannot-upload`, `client-forgot-password`.

### 6. The help chat trusts the role the browser sends (app and database done; n8n to switch)

Done 2026-10-23 on this side: the widget sends the person's session as
`accessToken`, and `search_my_sops()` (`database/sops_search_mine.sql`) reads the
procedures as that person, videos included. Left: point the n8n flow at it.
What it was:

`ChatWidget.tsx:150-161` posts `role`, `userId` and `email` in the request body
to the n8n `chatbot` webhook. The flow is not in this repository. If it picks
which SOPs to read from that `role`, anyone can ask as `staff` and get internal
answers, around the boundary `sops.sql` sets out to enforce. The flow also needs
to read the new `team_one` audience for Team One (`sops_team_one.sql`).

Fix: send the signed-in session token; have the flow check it with Supabase
and take the role from the profile.

---

## Documents and files

7. **"Requested by FTG" never completes.** `fulfillCustomRequest` is never
   called (`src/db/customRequests.ts:51`). The request vanishes at the end of
   the month, staff have no list of requests, and the dialog says it "appears in
   their Required Documents list" (`ClientDocumentsScreen.tsx:268`). SOPs:
   `client-requested-by-ftg`, `internal-request-doc`.
8. **Every staff upload starts pending on the client** (`src/db/documents.ts:334-345`),
   so contracts and final statements get Approve and Reject on the client's side,
   not just For Client Review. SOP: `internal-upload-for-client`.
9. **Accept and Reject show on our own files waiting for the client**
   (`AdminDocumentsScreen.tsx:787-808`), and the Approve window shows the
   current month rather than the file's (`:292,319`). SOP: `internal-approve-reject-upload`.
10. **Clients can rename FTG's files.** The pencil always shows and the "update
    own" policy allows it (`DocumentsScreen.tsx:928`; `client_profile_folders.sql:93-97`).
    Renaming can strip the "{item} —" prefix that ties an upload to its monthly item.
11. **Deleting an older shared folder from one profile deletes it for every
    client** (`ClientDocumentsScreen.tsx:1253-1256`). SOP: `internal-move-rename-delete`.
12. **The reply bell's rows cannot be opened**, only marked read
    (`AdminReplyBell.tsx:300-346`). In Browse, the Approve/Decline code has no
    button (`AdminFileBrowser.tsx:334-367,1327-1343`), the header pencil opens the
    viewer instead of renaming (`:1225-1227`), and an empty folder says "Create
    subfolders above." where there is no subfolder bar (`:834-843`).
13. **Viewed is shared by staff and client.** When staff open a file it shows as
    Viewed to the client (`ClientDocumentsScreen.tsx:520-525`).
14. **"Pending Approval" means opposite things**: your upload waiting on FTG, or
    FTG's file waiting on you. Profile's "Pending" count mixes both (`ProfileScreen.tsx:444`).
15. **The Tax Nitro pull message** says files go "into Unsorted Uploads"
    (`src/lib/taxNitro.ts:31`); contracts go to the Contracts folders.

## Team One

16. **Needs fixing, and the red number, never go down.** Team One cannot change
    an item (`team_one_updates.sql:95-96`) and FTG has no action on denied items
    (`TeamOneReviewScreen.tsx:179-205`). SOP: `teamone-fix-sent-back`.
17. **Sending again after a partial failure sends everything twice**
    (`TeamOneUpdateModal.tsx:94-97`; `teamOne.ts:144-176`). SOP: `teamone-send-update`.
18. **The escalation note meant for Daja is shown to Team One** (`TeamOneReviewScreen.tsx:74,174`).
19. **"FTG staff will check it and let you know"** (`TeamOneUpdateModal.tsx:124`):
    nothing lets them know except the badge.
20. **A TAX or date-only update shows "Nothing here." in every tab** (`TeamOneReviewScreen.tsx:268-269`).
21. **Client cards and the service filter use all of a client's services**, not
    the ones assigned to Team One (`ClientListScreen.tsx:965,1011-1025,1161`), and
    the empty list says "Add your first client using the button above." to
    people who have no such button (`:1208-1212`).
22. **Folder unread counts never clear for Team One**; the app cannot record their views.
23. **FTG-made subfolders show on every tab**, so a TAX+BK client has two "P&L
    Statement" and two "Balance Sheet" folders, one looking empty
    (`ClientDocumentsScreen.tsx:397-407,609-619,702-703`).

## Accounts and staff

24. **Paused and Closed do not affect sign-in.** `profiles_account_status.sql:14`
    says sign-in checks `is_active`; the app does not. SOP: `internal-account-status`.
25. **Assign Role matches the email case-sensitively** (`StaffManagementScreen.tsx:159-163`),
    and its suggestions include clients, so a client can be made staff by mistake (`:135-139`).
26. **"Client Created!" shows even if the profile details failed to save** (`ClientListScreen.tsx:217-239`).
27. **No welcome email** for a new client (fixed 2026-10-26). **Invite** on the client's profile, and
    **Email them an invite** on "Client Created!", email a link from info@ to set their own password.
    SOPs: `internal-add-client`, `internal-invite-client`.

## Questionnaire and dashboard

28. **New accounts entered in the questionnaire are never added to the profile**,
    and the field's help text talks about "the client" (`BankAccountsField.tsx:73,85`).
29. **Closed accounts are removed at once**, though the screen says from next month
    (`MonthlyQuestionnaireModal.tsx:110-118,162`). Save failures are silent (`:105`).
30. **Save for later blocks uploading** for BK and CFO until the questionnaire is
    submitted (`AppNavigator.tsx:82-85`). SOPs: `client-monthly-questionnaire`, `client-cannot-upload`.
31. **The dashboard shows only the current month.** Uploads now count for the
    month the client picks, which fixed the old wrong-month bug, but an earlier
    month's progress is shown nowhere. A policy decision. SOP: `client-earlier-month`.

## Smaller things

- A YER-only client has no service root on the Documents page (`DocumentsScreen.tsx:309,1351`)
  and no upload folders (`AdminUploadModal.tsx:113-116`).
- Buttons that do nothing: "Remember me" (`LoginScreen.tsx:43,257`), "Learn More"
  (`LandingScreen.tsx:390`), the Push Notifications, Biometric and Auto-Sync toggles
  (`ProfileScreen.tsx:740-764`), the dashboard avatar (`DashboardScreen.tsx:493`).
- Reading a long PDF in the preview may not count as activity, so "Still there?"
  can appear mid-read (the preview is a cross-origin frame).
- `notifications.sql:10` allows only the types new/upload/viewed/reminder; check
  the live table before relying on "Approved"/"Declined" notifications.
- The phone app build (MobileTabs) has no Upload, chat or questionnaire
  (`AppNavigator.tsx:329-396`). Clients use the web app.
- Bank account `last4` is validated differently by `normalizeBankAccounts` and
  `isCompleteBankAccount`, so an account can exist with no digits (not rechecked).

---

## Fixed or retired since 2026-09-17

- **Late uploads credited the wrong month**: fixed. The monthly item now counts
  for the month the client picks (`ClientUploadModal.tsx:432`).
- **The questionnaire could be bypassed from a folder's upload button**: folders
  no longer have one.
- **The Workflow page** (phases A to D) is archived: off the menu, kept built
  (`AdminNavigator.tsx:60-63`). Its gaps stand if it ever comes back: query items
  raised in Phase C or D are discarded, `client_notified_at` is never written,
  "Mark Complete & Notify Client" notifies nobody, workflows cannot go backwards,
  empty note resolutions are accepted, message dots never clear, SmartVault links
  cannot be edited, staff can delete workflows, and deactivated staff appear in
  its assignment picker. Its SOPs are retired, not deleted.

## Do not run

- `reconcile_requirements.sql` targets old table names and would delete live
  monthly-item rows.
- `move_document.sql`, `tax_prior_year_folders.sql` and `client_profile_folders.sql`
  carry older copies of `is_folder_table` that leave out newer folders; re-running
  them breaks moves into Unsorted Uploads, Identification, IRS Notices and IP Pins.
