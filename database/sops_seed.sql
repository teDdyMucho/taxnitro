-- ============================================================
-- SOPS SEED  (the knowledge base the help chat answers from)
--
-- Camaree: "can we have Ai generate how to text and videos for SOPs for the
-- team" and "once SOP and knowledge base are done, chat bots are able to rely
-- on those for how to answer questions, then we can actually invite clients".
--
-- Rewritten 2026-10-22 from the app as it is now, screen by screen, with the
-- button names exactly as they appear. Where the app does not do what a button
-- says, the procedure says so and is tagged 'known-issue'; those are listed in
-- database/SOP-GAPS.md. A procedure that describes an intention the app does
-- not carry out is worse than none, because someone follows it and believes
-- the step happened.
--
-- Updated 2026-10-26 for invites and Forgot Password, which now email from
-- info@ (supabase/functions/auth-email, and admin-users' invite_client).
--
-- Updated 2026-10-29 for the activity emails (src/lib/activityEmail.ts): what
-- clients, Team One and staff are emailed about, listed in internal-emails.
--
-- 28 for clients, 10 for Team One, 26 internal. The audience is a security
-- boundary, enforced by RLS (sops.sql, sops_team_one.sql), not a label.
--
-- Run database/sops.sql and database/sops_team_one.sql first.
--
-- SAFE TO RE-RUN: upserts on slug, so editing a body here and re-running
-- updates the procedure in place instead of adding a second copy.
-- ============================================================

insert into public.sops (slug, title, body, audience, category, tags, services, is_active) values

-- ══════════════════════════════════════════════════════════════
-- CLIENT-FACING: what the assistant may tell a client
-- ══════════════════════════════════════════════════════════════
('client-sign-in',
 $t$How do I sign in?$t$,
 $b$Press **Sign In** on the Finance Therapy Group portal, enter your **Email Address** and **Password**, then press **Sign In**.

- Our team sets up your account; there is no sign-up page. We either email you an invite, "Your Finance Therapy Group portal is ready" from info@financetherapygroup.com, or give you your email and a starting password.
- In the invite, press **Set your password**. The portal opens on "Welcome to Finance Therapy Group": type a password of at least 8 characters twice and press **Save password**. From then on you sign in with your email and that password.
- The invite link works once and lasts 24 hours. If it has expired, use **Forgot Password?** on the sign-in page, or ask us to send it again.
- "Incorrect email or password." means one of the two does not match. Check you are using the email we set up for you.
- You stay signed in on that browser until you sign out, or until you are signed out for being away (see "Why was I signed out?").

To sign out, press the sign-out icon beside your name at the bottom of the menu, or go to **Profile** and press **Sign Out**.$b$,
 'client', 'account', array['sign in', 'log in', 'login', 'password', 'cannot log in', 'sign out', 'log out', 'account', 'invite', 'set password', 'welcome email', 'first time'], array[]::text[], true),
('client-forgot-password',
 $t$I forgot my password$t$,
 $b$1. On the sign-in page, press **Forgot Password?**.
2. Enter your email and press **Send Link**.
3. Open "Reset your Finance Therapy Group password" from info@financetherapygroup.com and press **Choose a new password**. If it has not arrived within a few minutes, check your spam folder.
4. The portal opens on "Choose a new password": type a new password of at least 8 characters twice and press **Save new password**. You are signed in.

The link works once and lasts 24 hours. If it has expired, or the portal says "That reset link didn't work", ask for a new one the same way.

Once you are signed in you can change your password yourself: **Profile → Change Password**, enter your current password, then the new one twice (at least 8 characters).$b$,
 'client', 'account', array['forgot password', 'reset password', 'new password', 'locked out', 'cannot sign in', 'password reset email'], array[]::text[], true),
('client-menu',
 $t$What's in the menu?$t$,
 $b$On a computer the menu is down the left side; on a phone it is the bar along the bottom.

- **Dashboard**: what is new, what is missing and what is next this month.
- **Documents**: all your folders, by service.
- **Notifications**: notes and new documents from us. A red number shows how many are unread.
- **How-to**: step-by-step guides like this one, with short videos. On a phone, open it from **Profile → How-to guides and videos**.
- **Profile**: your name, photo, password and account details.
- **Upload** (the gold button): send us documents.

The gold chat bubble at the bottom right is the assistant. Ask it how anything works.$b$,
 'client', 'account', array['menu', 'navigation', 'where is', 'sidebar', 'pages', 'find'], array[]::text[], true),
('client-dashboard',
 $t$What does my dashboard show?$t$,
 $b$Your dashboard has three columns.

**What's New**: files we added for you in the last 30 days (marked NEW until you open them), our replies on your files, and uploads we accepted recently.

**What's Missing**: what still needs you this month:
- your monthly questionnaire (Bookkeeping and CFO only),
- files we sent back ("Sent back by FTG. Please upload it again"),
- files waiting for your approval ("From FTG. Please review and approve"),
- each document still to upload this month ("To upload this month"),
- anything we asked you for ("Requested by FTG").

Above the list, "X of Y sent this month · Z accepted" counts your monthly documents. The bar turns green once every one is accepted.

**What's Next**: notes from your accountant, uploads we are still reviewing, and what is due next month.

Press a row under What's Missing to deal with it. Upload rows open the upload window; the others take you to your Documents. The dashboard always shows the current month.$b$,
 'client', 'dashboard', array['dashboard', 'home', 'what''s missing', 'what''s new', 'what''s next', 'progress', 'checklist', 'to do'], array[]::text[], true),
('client-required-documents-bk',
 $t$What documents do I need to send each month? (Bookkeeping)$t$,
 $b$Bookkeeping clients send four things each month:

1. **Bank Statements**: one line for each bank account we have on file (for example "Bank Statements — Chase ••••1234"), or a single "Bank Statements (all accounts)" line if we have none on file.
2. **Credit Card Statements**
3. **Loan Statements**
4. **Payroll Reports**

They are listed on your dashboard under **What's Missing** as "To upload this month". Send each one with the gold **Upload** button, choosing it as the document type. It counts as sent straight away, and as done once we accept it.$b$,
 'client', 'requirements', array['required documents', 'what do i send', 'monthly documents', 'checklist', 'bookkeeping', 'bank statements'], array['BK'], true),
('client-required-documents-cfo',
 $t$What documents do I need to send each month? (CFO)$t$,
 $b$CFO clients send these each month:

1. **Bank Statements**: one line per bank account we have on file, or "Bank Statements (all accounts)".
2. **Credit Card Statements**
3. **Loan Statements**
4. **Payroll Reports**
5. **Prior Month Bookkeeping / QBO Access**: not on your list if we already have access to your QuickBooks.
6. **AR / AP Aging**

If you have both Bookkeeping and CFO with us, you see both lists, labelled "Bookkeeping ·" and "CFO ·". Send each one with the gold **Upload** button, choosing it as the document type.$b$,
 'client', 'requirements', array['required documents', 'what do i send', 'monthly documents', 'checklist', 'cfo', 'qbo', 'ar ap aging'], array['CFO'], true),
('client-required-documents-tax',
 $t$What documents do I need to send? (Tax)$t$,
 $b$Tax clients have **no monthly checklist**. Send what your accountant asks for, when they ask.

When you press **Upload**, choose the document type that fits:
- **Identification**: driver's license, passport or other ID
- **IRS Notices**: letters from the IRS
- **IP Pins**
- **Tax Returns**
- **Transcripts**
- **Unsure**: W-2s, 1099s and anything else, or whenever you are not sure. It goes to **Unsorted Uploads** and we file it for you.$b$,
 'client', 'requirements', array['tax', 'required documents', 'what do i send', 'w-2', '1099', 'tax documents'], array['TAX'], true),
('client-find-documents',
 $t$Where are my documents?$t$,
 $b$Press **Documents** in the menu.

- **The tabs at the top** switch between your services: **TAX**, **BK** (bookkeeping) and **CFO**. You only see the ones you have.
- **Each folder** shows how many documents it holds. A gold number means new files.
- **Unsorted Uploads** appears under every tab. Files land there until we file them.
- Monthly reports are grouped under **Monthly Reporting**, and older tax years under **Prior Years**.

Open a folder to see its files, grouped by the month they cover. **Search files…** finds a file by name, and **All / New / Viewed** filters the list. Some folders have folders inside them; open those the same way.

To save copies, use the download icon on a folder (everything in it), or **Download all** and **Select** inside a folder.$b$,
 'client', 'documents', array['documents', 'folders', 'find a file', 'where is my', 'tabs', 'search', 'download'], array[]::text[], true),
('client-folders-explained',
 $t$What goes in each folder?$t$,
 $b$**Every tab**
- **Unsorted Uploads**: files we have not filed yet, including what you send through Tax Nitro.

**TAX**
- **Identification**, **IRS Notices**, **IP Pins**, **Tax Returns**: what the names say.
- **Tax Contracts** and **Tax Invoices**: your agreements and paid invoices.
- **Client Uploads**: documents from you that our team filed here.
- **Other Tax Docs**: everything else, including **P&L Statement** and **Balance Sheet** folders.
- **Prior Years**: **Previous Tax Returns** and **Transcripts**.

**BK (bookkeeping)**
- **BK Contracts**, **BK Invoices**, **Bank Accounts**, **Additional BK Docs**.
- **Monthly Reporting**: **Required Info** (the monthly documents you sent us), **For Client Review** (reports we need you to check) and **Final Statements** (your finished reports).

**CFO**
- **CFO Contracts**, **CFO Invoices**, **Additional CFO Docs**.
- **Monthly Reporting**: **Required Info**, **For Client Review**, **Final Statements & Insights**.$b$,
 'client', 'documents', array['folders', 'folder names', 'unsorted uploads', 'required info', 'for client review', 'final statements', 'other tax docs'], array[]::text[], true),
('client-open-file',
 $t$How do I open a file, and what can I do with it?$t$,
 $b$Open a folder, then press the file. Its page shows the month it covers, when it was uploaded, its folder and its status, with these buttons:

- **View Document**: opens it full screen and marks it as viewed.
- **Mark as Viewed**: shown until you have viewed it.
- **Message FTG about this file**: ask us anything about it.

The download icon on the file's card in the folder saves a copy.

**You cannot delete a file once it is sent.** If something went up by mistake, message us about it and we will take care of it.$b$,
 'client', 'documents', array['open file', 'view document', 'preview', 'mark as viewed', 'download file', 'delete file', 'rename'], array[]::text[], true),
('client-upload-a-document',
 $t$How do I upload a document?$t$,
 $b$1. Press the gold **Upload** button in the menu. (Bookkeeping and CFO clients answer the monthly questionnaire first if this month's is not submitted. The upload window opens by itself when you submit.)
2. Under **Document type**, choose what you are sending. Types with a gold dot count toward this month's list.
3. Drag your files into the box, or click to browse (on a phone, **Choose files…**). You can add several files, and switch type to add more.
4. Choose the **month the documents cover**: **This month**, or an earlier month such as **Sep 2026**. One month applies to everything in that upload.
5. Add a note if there is something we should know (optional).
6. Press **Upload**.

You will see "Your document has been sent for review." Your files show **Pending Approval** until our team reviews them. Folders do not have their own upload button; always use the gold one.$b$,
 'client', 'uploads', array['upload', 'send a file', 'how to upload', 'attach document', 'submit documents', 'send documents'], array[]::text[], true),
('client-upload-status-meaning',
 $t$What do the labels on my files mean?$t$,
 $b$- **Pending Approval** (amber): on a file you uploaded, it is waiting for our team to review it. On a file we sent you, it is waiting for you to approve it.
- **Rejected** (red): the file could not be used. The reason is shown underneath. See "My upload was sent back".
- **New**: not opened yet. **Viewed**: it has been opened.

On your dashboard a monthly document counts as sent as soon as you upload it, and as accepted once we approve it. We email you when we accept or send back something you uploaded.$b$,
 'client', 'uploads', array['pending', 'pending approval', 'rejected', 'new', 'viewed', 'status', 'labels', 'badge'], array[]::text[], true),
('client-upload-declined',
 $t$My upload was sent back. What do I do?$t$,
 $b$A **Rejected** label, or "Sent back by FTG. Please upload it again" on your dashboard, means we could not use the file. We email you when it happens, too. Usually a page is missing, the scan is unreadable, or it is the wrong month.

1. Open the file and read our note under **Admin Feedback**. Press **Reply to Feedback** if you want to ask us about it.
2. Send a corrected file with the gold **Upload** button, choosing the same document type and month.

It stays listed as sent back until we accept the new file.$b$,
 'client', 'uploads', array['declined', 'rejected', 'sent back', 'red', 're-upload', 'fix upload', 'wrong file'], array[]::text[], true),
('client-review-ftg-file',
 $t$How do I approve or reject a file FTG sent me?$t$,
 $b$When we send you something to check, usually a monthly report in **For Client Review**, it appears on your dashboard as "From FTG. Please review and approve".

1. Open the file and press **View Document** to read it.
2. Under **Review This File**, press **Approve** if it looks right, or **Reject** if something is wrong.
3. Rejecting asks why. Tell us what is wrong, for example "The March statement is missing". We see your reason straight away.

Neither choice can be undone, so read the document first. To ask a question without deciding, use **Message FTG about this file**.$b$,
 'client', 'documents', array['approve', 'reject', 'review', 'for client review', 'please review', 'sign off', 'report to check'], array[]::text[], true),
('client-message-ftg',
 $t$How do I message FTG about a file?$t$,
 $b$Open the file and press **Message FTG about this file**. Type your message (up to 500 characters) and send it. One check means sent; two gold checks mean we have read it.

Our replies appear in the same conversation, and on your dashboard under **What's New** as "FTG replied on …". We also email you that we replied; sign in to read it. A note you add when uploading becomes the first message on each file in that upload.

For anything not about a particular file, use the gold chat bubble at the bottom right.$b$,
 'client', 'messages', array['message', 'question about a file', 'contact', 'reply', 'conversation', 'chat with accountant', 'comment'], array[]::text[], true),
('client-monthly-questionnaire',
 $t$What is the monthly questionnaire?$t$,
 $b$Bookkeeping and CFO clients answer ten short Yes/No questions each month before uploading. They tell us what to look for in your books. Tax-only clients are not asked.

It opens when you press **Upload**, or from the questionnaire row under **What's Missing**.

- **No** is enough on its own. **Yes** asks for a little more: an explanation, account details, or a document.
- **Save for later** keeps your answers, but you cannot upload until you **Submit**.
- **Submit** checks that every question is answered (it marks any you missed), then opens the upload window.
- Closing with the X does not save.

Once submitted it cannot be changed. Message us if something needs correcting.$b$,
 'client', 'account', array['questionnaire', 'monthly questions', 'ten questions', 'survey', 'before upload', 'save for later'], array['BK', 'CFO'], true),
('client-earlier-month',
 $t$I'm sending documents for an earlier month$t$,
 $b$Choose that month when you upload. After picking the document type, press the month chip (for example **Sep 2026**) instead of **This month**. The document is filed and counted for the month you chose.

Your dashboard only shows the current month, so an earlier month's documents will not change this month's list. If you are catching up on several months, upload each month separately.$b$,
 'client', 'uploads', array['earlier month', 'previous month', 'late upload', 'catch up', 'back months', 'wrong month', 'last month'], array[]::text[], true),
('client-cannot-upload',
 $t$I can't upload. What should I check?$t$,
 $b$Work through these in order:

1. **Choose a document type first.** The file box says "Pick a document type first" until you do.
2. **Did the questionnaire open instead?** Bookkeeping and CFO clients submit it before uploading each month. Finish it and press **Submit**; the upload window opens by itself.
3. **Saved the questionnaire for later?** It still needs to be submitted before you can upload.
4. **Is a file in the list?** The **Upload** button stays grey until at least one file is added.
5. **Use the gold Upload button in the menu.** Folders do not have their own.
6. **Refresh the page**, sign in again if asked, and try once more.

If it still fails, tell us through the chat bubble what happens when you press the button, and what the message said.$b$,
 'client', 'uploads', array['cannot upload', 'upload not working', 'button does nothing', 'stuck', 'error', 'troubleshoot', 'file won''t attach', 'upload greyed out'], array[]::text[], true),
('client-who-sees-my-documents',
 $t$Who can see what I upload?$t$,
 $b$Only you and the Finance Therapy Group team working on your account. Other clients can never see your files: the database checks this on every request, not just the app.

Messages you write on a file are read by our team and answered on the same file.$b$,
 'client', 'account', array['privacy', 'who can see', 'security', 'confidential', 'other clients', 'safe'], array[]::text[], true),
('client-notifications',
 $t$What are notifications?$t$,
 $b$**Notifications** lists notes from us ("A note from FTG") and documents we filed for you ("New document from FTG"). The red number in the menu counts the unread ones.

- Press a notification to mark it read, or **Mark all read** for all of them.
- The trash icon deletes one.

Replies on your files show on your dashboard under **What's New**, not here.

We also email you, a few minutes later, when we accept or send back a file you uploaded, reply on one of your files, or leave you a note. The email says only what happened; sign in to see the rest.$b$,
 'client', 'messages', array['notifications', 'alerts', 'bell', 'unread', 'note from ftg', 'new document', 'email', 'email notification'], array[]::text[], true),
('client-invoices',
 $t$Where are my invoices?$t$,
 $b$Invoices you have **paid in full** appear in your **Invoices** folder for that service (**Tax Invoices**, **BK Invoices** or **CFO Invoices**) as a PDF marked **PAID IN FULL**. They are added automatically within the hour after you pay.

Unpaid or partly paid invoices are not shown in the app; those come to you by email.$b$,
 'client', 'billing', array['invoice', 'invoices', 'bill', 'receipt', 'payment', 'paid', 'tax nitro invoice'], array[]::text[], true),
('client-contracts',
 $t$Where are my contracts?$t$,
 $b$Your agreements with us are in the **Contracts** folder for that service: **Tax Contracts**, **BK Contracts** or **CFO Contracts**.

A contract you just signed online can take a while to appear. If one is missing, message us and we will add it.$b$,
 'client', 'documents', array['contract', 'contracts', 'agreement', 'engagement letter', 'signed', 'terms'], array[]::text[], true),
('client-tax-nitro-uploads',
 $t$I uploaded a document through Tax Nitro. Where is it?$t$,
 $b$Documents you send through Tax Nitro forms come into the app automatically. They land in **Unsorted Uploads** (under every tab of your Documents), marked **Pending Approval** until our team files and reviews them.$b$,
 'client', 'uploads', array['tax nitro', 'form', 'uploaded on the website', 'link', 'missing upload', 'where did my file go'], array[]::text[], true),
('client-idle-signout',
 $t$Why was I signed out?$t$,
 $b$For your security, after 5 minutes with no activity we ask **Still there?**. Press **Yes, keep me signed in** to carry on. If nobody answers within a minute you are signed out and see "Signed out for your security". Press **Sign in again**.

Anything you already uploaded is saved. A message or upload you had not sent yet is lost. Using the portal in any of your browser tabs counts as activity, and so does reading a document preview, for up to 15 minutes. Being signed out for this ends that browser only, not your other devices.$b$,
 'client', 'account', array['signed out', 'logged out', 'still there', 'timeout', 'session expired', 'kicked out', 'idle'], array[]::text[], true),
('client-profile',
 $t$How do I change my name, photo or password?$t$,
 $b$Go to **Profile**.

- **Photo**: press your photo to change it.
- **Edit Profile**: change your name. Your email cannot be changed here; message us to update it.
- **Change Password**: enter your current password, then the new one twice (at least 8 characters).

Your profile also shows how many documents you have, how many you have viewed and how many are pending.$b$,
 'client', 'account', array['profile', 'change name', 'photo', 'avatar', 'change password', 'email change', 'account details'], array[]::text[], true),
('client-financial-dashboard',
 $t$Where is my financial dashboard?$t$,
 $b$If we have built a financial dashboard for you, open **Profile → Financial Dashboard**. Its tabs include the dashboard itself, **Profit & Loss**, **Balance Sheet** and **Financial Roadmap**. Press **Back to Profile** to return.

If you do not see it, we have not set one up for you yet. Ask your accountant.$b$,
 'client', 'reports', array['financial dashboard', 'financials', 'p&l', 'profit and loss', 'balance sheet', 'roadmap', 'reports'], array[]::text[], true),
('client-requested-by-ftg',
 $t$FTG asked me for a document$t$,
 $b$Our requests appear on your dashboard under **What's Missing** as **Requested by FTG**, with what we need.

Send it with the gold **Upload** button. Choose the closest document type; for anything that does not fit, use **Unsure** (tax), **Additional BK Docs** or **Additional CFO Docs**. Add a note saying which request it answers.

The request stays on the list until the end of the month, even after you send it. That is expected.$b$,
 'client', 'requirements', array['requested', 'requested by ftg', 'asked for', 'document request', 'need from me'], array[]::text[], true),
('client-help',
 $t$How do I get help?$t$,
 $b$Press the gold chat bubble at the bottom right of any page and ask your question. For step-by-step guides with short videos, open **How-to** in the menu (on a phone, **Profile → How-to guides and videos**).

For something about a particular file, open the file and use **Message FTG about this file**, so the conversation stays with it.$b$,
 'client', 'help', array['help', 'support', 'contact', 'question', 'talk to someone', 'assistant', 'chat'], array[]::text[], true),

-- ══════════════════════════════════════════════════════════════
-- TEAM ONE: assigned clients only, view and download
-- ══════════════════════════════════════════════════════════════
('teamone-getting-started',
 $t$Getting started: signing in and the menu (Team One)$t$,
 $b$Sign in on the Finance Therapy Group portal with the **Email Address** and **Password** FTG set up for you.

Your menu has four items:
- **Clients**: the clients FTG has assigned to Team One.
- **My Updates**: what you sent FTG, and what FTG decided.
- **How-to**: step-by-step guides with short videos. On a phone, open it from **Profile**.
- **Profile**: your name, photo and password.

The gold chat bubble at the bottom right answers how-to questions and takes bug reports. To sign out, use the icon beside your name, or **Profile → Sign Out**. If you forget your password, press **Forgot Password?** on the sign-in page and we email you a link to choose a new one.$b$,
 'team_one', 'account', array['sign in', 'log in', 'menu', 'getting started', 'password', 'sign out', 'team one'], array[]::text[], true),
('teamone-which-clients',
 $t$Which clients can I see?$t$,
 $b$You see a client once FTG ticks at least one service for them under **Team One Access**. Every Team One login sees the same clients.

On **Clients**, search by name, business name or email, filter by **Active / Paused / Closed** or by service, and sort by **Name** or **Progress**. Tap a card to open the client.

If a client you work on is missing, ask FTG to give Team One access. If FTG removes access, the client, its updates and its chat disappear for you at once.$b$,
 'team_one', 'clients', array['clients', 'assigned', 'missing client', 'cannot see client', 'access', 'which clients'], array[]::text[], true),
('teamone-open-files',
 $t$Opening and downloading a client's files$t$,
 $b$Open a client from **Clients**. The tabs show the services assigned to Team One; tap a folder to open it.

- The eye icon on a file opens a preview; the arrow downloads it.
- **Download all** downloads every file in the folder. **Select** lets you tick files, then **Download**.
- The download icon on a folder tile downloads the whole folder.
- The back arrow leaves the folder first, then the client.

Your access is **view and download only**: you cannot upload into the client's folders, rename, move or delete. To send FTG something, use **Add Update**.$b$,
 'team_one', 'documents', array['files', 'folders', 'download', 'view', 'documents', 'open file', 'zip'], array[]::text[], true),
('teamone-send-update',
 $t$Sending FTG an update for review$t$,
 $b$1. **Clients** → open the client → **Add Update** (shown when no folder is open).
2. Tick the services it is for: **TAX**, **Bookkeeping** and/or **CFO**.
3. For each ticked service, fill in the **Estimated completion date** (required).
4. For Bookkeeping or CFO you can also add:
   - **Query Sheet (link)**: a web link starting with http:// or https://,
   - **P&L**: upload the P&L file,
   - **Balance Sheet**: upload the balance sheet.
5. Press **Send for Review**. You will see "Sent for review", and FTG gets an email with what you sent.

Each link and file is reviewed separately. Your files are kept apart from the client's folders until FTG approves them. Tapping outside the form throws the draft away, and if a send fails partway, check **My Updates** before sending again so nothing goes twice.$b$,
 'team_one', 'updates', array['add update', 'send for review', 'query sheet', 'p&l', 'balance sheet', 'completion date', 'submit work', 'report'], array[]::text[], true),
('teamone-my-updates',
 $t$Where do I see what FTG decided? (My Updates)$t$,
 $b$**My Updates** shows what was sent for your assigned clients and what FTG decided, in three tabs:

- **Needs fixing**: Denied or Revise, with FTG's note.
- **Waiting**: waiting for review, or escalated to Daja.
- **Done**: Approved (with "Filed as …"), or a note sent to the client.

Each card shows the item (Query Sheet, P&L or Balance Sheet), the service, its status, the due date, when it was sent, and FTG's note. Above the cards, "New messages from FTG" lists clients with unread chat; below them, "Estimated completion" lists the latest date per client and service.

We also email you a few minutes after FTG decides: approved, sent back to fix, passed to Daja, or answered with a note to the client. The email names the client; the details are here.$b$,
 'team_one', 'updates', array['my updates', 'status', 'approved', 'denied', 'needs fixing', 'waiting', 'done', 'escalated', 'decision'], array[]::text[], true),
('teamone-fix-sent-back',
 $t$Fixing something FTG sent back$t$,
 $b$Read FTG's note on the card under **Needs fixing**. There is no resubmit button: make the correction, then send it as a new update (**Clients** → client → **Add Update**).

The old item stays under Needs fixing; that is expected. If something is unclear, ask in the client's **Chat with FTG**.$b$,
 'team_one', 'updates', array['denied', 'revise', 'needs fixing', 'resubmit', 'send again', 'fix', 'sent back'], array[]::text[], true),
('teamone-chat',
 $t$Messaging FTG about a client$t$,
 $b$Open the client. At the top of their folders is **Chat with FTG** ("Only FTG and Team One see this"). Type in "Message FTG…" and press the send arrow; Enter only starts a new line.

Messages are labelled "You", "FTG · name" or "Team One · name", and new ones appear as they arrive. There is one thread per client, shared by all FTG staff and all Team One logins. **The client never sees it.** The chat does not show inside a folder.

FTG gets your messages by email too, and we email you when FTG writes.$b$,
 'team_one', 'messages', array['chat', 'message ftg', 'question', 'communicate', 'chat with ftg', 'contact ftg'], array[]::text[], true),
('teamone-alerts',
 $t$What the red number on My Updates means$t$,
 $b$The red number on **My Updates** counts items FTG sent back (Denied or Revise) plus unread chat messages from FTG. It refreshes about every minute, or when you change menu item.

There is no Notifications page. You get an email when FTG writes in a client's chat, decides on what you sent, or gives you a new client. The email names the client; this number, the tab counts and "New messages from FTG" show the rest.$b$,
 'team_one', 'updates', array['badge', 'red number', 'notification', 'alerts', 'unread', 'count', 'email'], array[]::text[], true),
('teamone-signed-out',
 $t$Why was I signed out?$t$,
 $b$After 5 minutes with no activity the app asks **Still there?**. Press **Yes, keep me signed in**. With no answer within a minute you are signed out for security; press **Sign in again**.

Working in any tab of the app counts as activity, and so does reading a document preview, for up to 15 minutes.

Anything already sent is saved. An update or chat message you had not sent yet is lost.$b$,
 'team_one', 'account', array['signed out', 'logged out', 'still there', 'timeout', 'idle', 'session'], array[]::text[], true),
('teamone-help',
 $t$Getting help or reporting a problem (Team One)$t$,
 $b$Open **How-to** for step-by-step guides with short videos. Or press the gold chat bubble and ask how something works, or describe the problem: what you pressed, what you expected, and what happened. For anything about a particular client, use that client's **Chat with FTG** instead.$b$,
 'team_one', 'help', array['help', 'bug', 'problem', 'not working', 'support', 'ticket'], array[]::text[], true),

-- ══════════════════════════════════════════════════════════════
-- INTERNAL: FTG staff and admin only
-- ══════════════════════════════════════════════════════════════
('internal-menu',
 $t$The staff menu: what each page is for$t$,
 $b$- **Dashboard**: work progress by service, documents waiting on us or on clients, recent uploads.
- **Documents**: every client's files. Approve or reject uploads here, answer file messages from the reply bell, and use **Browse** to move files.
- **Clients**: find, add and update clients, and open a client's profile.
- **Team One**: review what Team One sends for a decision.
- **Staff** (admins only): add staff, admins and Team One logins, change roles, deactivate.
- **Financial Reports**: the client financial dashboards.
- **How-to**: every procedure with its video, for staff, clients and Team One. On a phone, open it from **Profile**.
- **Profile**: your own account.

The red number on **Team One** counts items waiting for review plus unread Team One chat messages; admins and Daja also count escalated items. The gold chat bubble answers how-to questions and raises bug tickets. The app reopens the client and folder you last had open.$b$,
 'internal', 'account', array['menu', 'pages', 'navigation', 'where is', 'sidebar', 'badge'], array[]::text[], true),
('internal-dashboard',
 $t$Reading the staff dashboard$t$,
 $b$**Work Progress** cards (TAX, YER, BK, CFO) count clients by the **Work Progress** set on each client in **Update Profile**: Not Started, In Progress, Completed (TAX and YER) or Current (BK and CFO). BK and CFO **Current** goes back to Not Started on the 1st of each month.

Click a line (for example "In Progress") to list those clients; tap one to open their profile, and **Back** returns to the dashboard. Lines at 0 cannot be clicked.

Two tiles count pending files: **Documents pending FTG approval** (client uploads waiting on us) and **Documents for client review** (our uploads waiting on the client). They are not clickable.

**Recent uploads** splits into Sorted (filed in a subfolder) and Unsorted, five a page. **View All** opens Documents.$b$,
 'internal', 'dashboard', array['dashboard', 'work progress', 'in progress', 'not started', 'completed', 'current', 'pending approval', 'recent uploads'], array[]::text[], true),
('internal-add-client',
 $t$Adding a new client$t$,
 $b$1. **Clients → + Add Client**.
2. Fill in **First Name**, **Last Name**, **Email Address** and a **Password** of 8 or more characters (**Generate** makes one).
3. Tick the **Client Type**: TAX, YER, Bookkeeping and/or CFO. **Company Name** is required for Bookkeeping, CFO and YER.
4. Pick the **Plan**.
5. Add each bank account under **Bank Accounts** (bank name and exactly 4 digits). Each one becomes its own monthly "Bank Statements" item.
6. For CFO, answer **Do we already have QBO access?**
7. Press **Create Client**. If something is missing, a red line says what.

Afterwards:
- **Client Created!** offers **Email them an invite**: the client gets an email from info@ with a link to set their own password. Or share the email and password it shows yourself. You can also invite them later from their profile (see "Inviting a client to the portal").
- The app pulls the client's files and paid invoices from Tax Nitro straight away, matching on the email.
- Bookkeeping and CFO clients get **Query Sheet**, **P&L Statement** and **Balance Sheet** folders under For Client Review; TAX clients get **P&L Statement** and **Balance Sheet** under Other Tax Docs.$b$,
 'internal', 'clients', array['add client', 'new client', 'create client', 'onboard client', 'client account', 'password', 'welcome email'], array[]::text[], true),
('internal-invite-client',
 $t$Inviting a client to the portal$t$,
 $b$1. Open the client from **Clients**.
2. Press **Invite**, beside **Upload File** and **Request Doc**.
3. The box asks "Invite {first name} to the portal?" and shows their email. Check it, then press **Send invite**. "Invite sent" confirms it, and the button now reads **Invite again**.

The client gets a welcome email, "Your Finance Therapy Group portal is ready", from info@financetherapygroup.com. **Set your password** signs them in and asks them to choose a password; from then on they sign in with their email and that password.

- Right after **Create Client**, **Email them an invite** on "Client Created!" sends the same email.
- The link works once and lasts 24 hours. If it expires, press **Invite again**: it sends a new link and the old one stops working. The client can also use **Forgot Password?** themselves.
- The email goes to the address on their profile, so check it is right first. Only client logins can be invited.$b$,
 'internal', 'clients', array['invite', 'invite client', 'invite again', 'welcome email', 'send login', 'set password', 'onboarding', 'portal access'], array[]::text[], true),
('internal-find-client',
 $t$Finding a client$t$,
 $b$On **Clients**:
- Type in **Search by client name, business name or email…**
- Tap **Total / Active / Paused / Closed** to filter, and tap again to clear.
- **TAX / YER / BK / CFO** filter by service.
- Sort by **Name** (last name, then company) or **Progress** (least advanced first).

Tap a card to open the profile. On each card, the checklist icon shows that client's **Required Documents** for the month, and the gear opens **Update Profile**.$b$,
 'internal', 'clients', array['find client', 'search', 'client list', 'filter', 'sort', 'active', 'paused', 'closed'], array[]::text[], true),
('internal-client-profile',
 $t$What's on a client's profile$t$,
 $b$The header has **Update Profile**, **Upload File**, **Request Doc**, and **Dashboard** (only when a financial dashboard exists).

- **Service tabs** (TAX, YER, BK, CFO) show that service's folders. A service the client no longer takes still shows, marked archived, while it holds files.
- CFO clients have two tabs: **CFO** (panels, **CFO DOCUMENTS** and **ENTER CFO SUITE**) and **CFO DOCS** (their folders).
- Panels above the folders: **Business details** (internal only), **Notes for the client** (the client sees these), the **Team One chat**, and the **Monthly questionnaire**.
- Inside a folder, each file has view (marks it viewed), download, rename and delete. **Download all** saves everything.

Approving or rejecting a client's upload is done on the **Documents** page, not here.$b$,
 'internal', 'clients', array['client profile', 'client page', 'folders', 'tabs', 'business details', 'notes', 'cfo suite'], array[]::text[], true),
('internal-update-profile',
 $t$The Update Profile tray$t$,
 $b$Open it from the client's profile (**Update Profile**) or the gear on their card.

- **Name, Company Name, Plan, Client Type** (services).
- **Work Progress** per service. BK and CFO go back to Not Started on the 1st of each month.
- **Team One Access**: the services whose folders Team One may see.
- **Bank Accounts**: one monthly Bank Statements item per account.
- **Pull their files from Tax Nitro**: brings over their Tax Nitro uploads and paid invoices.
- **QBO Access** (CFO): "We have it" removes the QBO item from their list.
- **Account Status**: Active, Paused or Closed.
- **Change Password** → **Update Password** (client logins only).

**The Tax Nitro pull and the password change happen immediately.** Everything else is kept only when you press **Save Changes**. Saving is blocked if no service is ticked or a bank account is half filled.$b$,
 'internal', 'clients', array['update profile', 'edit client', 'services', 'work progress', 'bank accounts', 'qbo', 'account status', 'change password'], array[]::text[], true),
('internal-upload-for-client',
 $t$Uploading a file for a client, or sending one for review$t$,
 $b$1. On the client's profile press **Upload File** (or **Documents → Upload** and pick the client).
2. Pick the **Folder**. Only the client's services are offered.
3. In delivery folders, answer **What is this document?** (for example Query Sheet, P&L Statement, Balance Sheet; FINAL P&L Statement in Final Statements). The label goes in front of the file name, and the file goes in the client's folder of that name when they have one; every BK and CFO client has Query Sheet, P&L Statement and Balance Sheet.
4. Pick the **Month**, and a **Subfolder** if you want one ("Folder root", an existing one, or a new name).
5. Drag in the files or click to browse, then press **Upload**.

**To have the client check something, upload it to Monthly Reporting (For Client Review).** It appears on their dashboard as "From FTG. Please review and approve", and they approve or reject it. A rejection reason reaches you as a message on the file.

Every file staff upload starts as pending on the client, in any folder, so clients also see Approve and Reject on contracts and final statements. On **Documents** they show as **Pending client**.$b$,
 'internal', 'documents', array['upload for client', 'send to client', 'for client review', 'deliver report', 'p&l', 'balance sheet', 'query sheet', 'final statements'], array[]::text[], true),
('internal-approve-reject-upload',
 $t$Approving or rejecting a client's upload$t$,
 $b$Use the **Documents** page; the client profile has no approve or reject.

1. Find the client's file: search, then open the client's card, or switch to the list view, which opens on **Pending FTG**: client uploads waiting on us.
2. Press **Accept**. The **Approve Upload** window shows the client's note.
   - If the client chose a monthly item when uploading, press **Approve**.
   - If not, pick the item it answers and press **Approve & Tag**, or **Approve only**.
   The item turns green on the client's dashboard.
3. Or press **Reject**, write the reason, then **Reject**. The client sees "Sent back by FTG. Please upload it again" and your reason on the file. The reason is optional, but always write one; it is all the client gets.

A few minutes later the client gets one email for what you did, such as "We accepted 2 of your files" or that a file was sent back. It never holds your reason; they sign in to read it.

Our own files waiting for the client are under **Pending client**, marked "Pending client", with no Accept or Reject: the client approves those on their side.$b$,
 'internal', 'documents', array['approve', 'accept', 'reject', 'decline', 'review upload', 'pending', 'pending ftg', 'pending client', 'checklist', 'tag'], array[]::text[], true),
('internal-file-messages',
 $t$Answering a client's message on a file (the reply bell)$t$,
 $b$The bell in the **Documents** header lists unread client messages and new client uploads. **Mark all read** clears it, and the ✓✓ on a row marks one. Read state is shared by all staff, and the rows do not open the file.

Each client message also emails accounting@: "{client} sent a message about {file}", with their words. A rejection arrives as "{client} rejected {file}", with the reason, and a note on an upload is in the "uploaded a file" email.

To reply, find the file in **Documents** and press its chat icon. Type in "Type your reply…" (500 characters) and send. The client sees "FTG replied on {file}" on their dashboard, and a few minutes later an email that we sent them a message, without your words.

When a client rejects a file we sent, their reason arrives here as "Rejected this file: …".$b$,
 'internal', 'messages', array['reply', 'message', 'client message', 'conversation', 'bell', 'notifications', 'unread', 'rejected this file', 'email', 'accounting'], array[]::text[], true),
('internal-emails',
 $t$Which emails the app sends$t$,
 $b$Every email notification the app sends comes from info@.

**To the client**
- When we upload files for them: "New documents in your Finance Therapy Group portal", with the number of files.
- When we accept or send back their upload, reply on one of their files, or leave them a note: one email a few minutes later for everything done together. It says only what happened, never our words; they sign in to read the rest. Only clients who have signed in, or were sent an invite, get these.
- Their invite, and the link when they press **Forgot Password?**.

**To Team One**, about a client they have: FTG wrote in its Team One chat, decided on what they sent, or gave them the client. One email a few minutes later, naming the client.

**To FTG, at accounting@**
- A client uploaded files (with their note), wrote on a file, or rejected one (with the reason).
- Team One sent an update (each service, its date and what came with it), or wrote in a client's Team One chat (with their words).

Not emailed: files and paid invoices that come in from Tax Nitro, and escalations to Daja, who sees them under **Team One → Escalated**.$b$,
 'internal', 'messages', array['email', 'emails', 'email notification', 'who gets an email', 'notifications', 'accounting', 'info@'], array[]::text[], true),
('internal-move-rename-delete',
 $t$Moving, renaming and deleting files and folders$t$,
 $b$**Moving files** is done in **Documents → Browse** (the folder icon): category → folder → client → file → **Move to Subfolder** or **Move to Another Folder**. For several files, **Select**, then **Move** or **Delete**. A moved file lands at the top of its new folder.

**Subfolders in Browse**: **New Subfolder**; tap a chip to filter and again to step in; **Rename**, **Move to another folder**, **Delete** (the files inside stay and become unfiled).

**On a client's profile**: **Add New Folder**. On a folder tile, the pencil renames, the arrow moves it into another folder (**Move Here**), and the trash deletes it (its files go back to the folder above).

Deleting a file also deletes its messages and its checklist credit. Careful with older shared folders: deleting one from a profile deletes it for every client.$b$,
 'internal', 'documents', array['move file', 'rename', 'delete', 'subfolder', 'new folder', 'browse', 'organize', 'file away'], array[]::text[], true),
('internal-request-doc',
 $t$Asking a client for a document (Request Doc)$t$,
 $b$On the client's profile press **Request Doc**, fill in **What do you need?** and an optional **Note**, then **Send Request**.

The client sees it on their dashboard under **What's Missing** as "Requested by FTG", for the current month only.

**Known limits:** the request is never marked done, even after the client uploads; it disappears at the end of the month; and there is no list of requests on our side. Keep track of what you asked for yourself.$b$,
 'internal', 'requirements', array['request document', 'request doc', 'ask client', 'missing document', 'need from client'], array[]::text[], true),
('internal-client-notes',
 $t$Writing a note for a client$t$,
 $b$On the client's profile, use the **Notes for the client** panel. The client sees the note on their dashboard under **What's Next** ("Note from {your name}") and gets the notification "A note from FTG", and an email that there is a note (not what it says).

Editing a note does not notify them again. **Business details**, the panel beside it, is internal and never shown to the client.$b$,
 'internal', 'messages', array['note', 'note for client', 'shared note', 'message client', 'announcement'], array[]::text[], true),
('internal-team-one-access',
 $t$Giving Team One a client$t$,
 $b$Open the client's **Update Profile**, tick the services under **Team One Access**, then press **Save Changes**. The hint reads "Team One sees this client and only the folders ticked here."

- Team One sees the folders of the ticked services, plus Unsorted Uploads and our subfolders. They can view and download only: no uploads, renames, moves or deletes.
- Access is per client: every Team One login sees the same clients.
- Untick to take a client away; their updates and chat disappear for Team One at once.
- Team One gets an email when you give them a client, or more of its services; not when you take it away.$b$,
 'internal', 'team-one', array['team one', 'assign', 'team one access', 'share client', 'outsource', 'give access'], array[]::text[], true),
('internal-team-one-review',
 $t$Reviewing what Team One sends$t$,
 $b$Go to **Team One → Waiting**. Each item is a link (Query Sheet) or a file (P&L, Balance Sheet) for one client and service.

- **Approve**: pick the folder (it suggests Required Info for a query sheet, For Client Review for a P&L or balance sheet), then **Approve & File**. It is filed as our upload, pending on the client, and the client gets "New document from FTG".
- **Deny**: write a note (required), then **Send back to Team One**. They see it under Needs fixing.
- **Escalate**: send it to Daja, with an optional note.

**Escalated** items: Daja and admins decide with **Revise** (back to Team One with a note) or **Note to client** (the note goes on the client's dashboard). Everyone else sees "Waiting on Daja."

A few minutes later Team One gets one email for what was decided (approved, denied or revised, escalated, or a note to the client), naming the client but not your note.$b$,
 'internal', 'team-one', array['team one', 'review', 'approve', 'deny', 'escalate', 'daja', 'waiting', 'query sheet', 'p&l', 'balance sheet'], array[]::text[], true),
('internal-team-one-chat',
 $t$Chatting with Team One about a client$t$,
 $b$On the client's profile, use the **Team One chat** panel ("Only FTG and Team One see this"). Type in "Message Team One…" and send. It shows when the client is assigned to Team One or already has messages.

There is one thread per client, shared by all FTG staff and all Team One logins. The client never sees it. New Team One messages are listed on the **Team One** page under "New messages from Team One" and counted on its menu badge.

Team One's messages also email accounting@, with their words, and Team One gets an email when we write, without ours.$b$,
 'internal', 'team-one', array['team one chat', 'message team one', 'chat', 'internal chat', 'communicate'], array[]::text[], true),
('internal-staff-onboarding',
 $t$Adding a staff member, admin or Team One login$t$,
 $b$**Staff → Add Staff**, type the email, pick **Staff**, **Admin** or **Team One**, then:
- **Assign Role** if they already have an account. The role applies at once.
- **Send Invite** if they do not. The invite waits under "Waiting to sign up".

**Known issues:**
- **Send Invite sends no email, and the app has no sign-up page**, so an invited person cannot create their own account. Ask Angelo to set up the login.
- The email must match exactly, including capital letters.
- The suggestions include clients. Check you are not turning a client into staff.$b$,
 'internal', 'staff', array['staff', 'onboarding', 'invite', 'new hire', 'add staff', 'role', 'admin', 'team one login'], array[]::text[], true),
('internal-staff-manage',
 $t$Changing a role, deactivating or deleting a member$t$,
 $b$On **Staff**, use the **Admins / Staff / Team One** tabs.

- **Role**: tap the role pill to switch Staff and Admin. You cannot change your own role or the last admin's. To change a Team One login's role, assign it again through **Add Staff**.
- **Deactivate** (not admins): "Deactivate this member?" → **Yes, deactivate**. Reactivating is one tap.
- **Delete** (not admins, not yourself): blocked if they have old Workflow records; deactivate them instead.

A deactivated staff, admin or Team One login is signed straight out with "This account is switched off", and loses all staff access at once. Reactivate them to let them back in.$b$,
 'internal', 'staff', array['change role', 'promote', 'demote', 'deactivate', 'delete staff', 'remove access', 'offboard', 'switched off'], array[]::text[], true),
('internal-roles',
 $t$What admins, staff and Team One can do$t$,
 $b$- **Admins** can do everything, including the **Staff** page (people and roles). Admins and Daja decide escalated Team One items.
- **Staff** can do everything except the Staff page.
- **Team One** see only **Clients** (the ones assigned to them, view and download only), **My Updates** and **Profile**. They send query sheets, P&Ls and balance sheets for our review and chat with us on each client.
- **Clients** see only their own files and data. The database enforces this on every request.$b$,
 'internal', 'staff', array['roles', 'permissions', 'admin', 'staff', 'team one', 'who can', 'access'], array[]::text[], true),
('internal-financial-reports',
 $t$Financial Reports and client dashboards$t$,
 $b$**Financial Reports** lists the client financial dashboards. Inside one, the tabs are Dashboard, Profit & Loss, Balance Sheet, Financial Roadmap, Assumptions, FS-A and FS-R, plus **Findings for Review** and **TL;DR**, which only staff see.

The client opens theirs from **Profile → Financial Dashboard**. The list is built into the app, so adding a client's dashboard needs Angelo.$b$,
 'internal', 'reports', array['financial reports', 'dashboard', 'client dashboard', 'p&l', 'balance sheet', 'roadmap', 'tldr'], array[]::text[], true),
('internal-tax-nitro',
 $t$How Tax Nitro files, contracts and invoices reach the app$t$,
 $b$Everything is matched on email: the client's email in Tax Nitro must be the same as in the app.

- **Client uploads** through Tax Nitro forms → **Unsorted Uploads**, pending our review.
- **Our own uploads** in Tax Nitro → contracts and agreements go to that service's **Contracts** folder, everything else to **Unsorted Uploads**, both already approved.
- **Paid invoices** → a PDF marked PAID IN FULL in the **Tax**, **BK** or **CFO Invoices** folder, checked every hour. The folder follows the invoice's wording, among the services the client has. Unpaid invoices never come over.
- **New clients**: the pull runs when you create them. To pull again, **Update Profile → Pull their files from Tax Nitro**. Anything already in the app is skipped.
- **Signed contracts** from Tax Nitro's signing do not come over automatically yet.

If a file is missing, check the emails match, then pull again.$b$,
 'internal', 'tax-nitro', array['tax nitro', 'ghl', 'sync', 'uploads', 'contracts', 'invoices', 'pull', 'automation', 'missing file'], array[]::text[], true),
('internal-required-items-reference',
 $t$Monthly required items: the exact list$t$,
 $b$**Bookkeeping (4):** Bank Statements, Credit Card Statements, Loan Statements, Payroll Reports.

**CFO (6):** the same four, plus Prior Month Bookkeeping / QBO Access, and AR / AP Aging. A client with both services sees both lists.

**Tax and YER:** no monthly list.

What changes a client's list:
1. **Bank accounts.** With accounts recorded in Update Profile, "Bank Statements (all accounts)" becomes one item per account, for example "Bank Statements — Chase ••••1234". Credit cards do not split per card.
2. **QBO access.** "We have it" removes Prior Month Bookkeeping / QBO Access.
3. **Closed accounts.** A client marking an account closed in the questionnaire removes it from their list.

An item counts as sent when uploaded, and as done when we accept it. Uploads count for the month the client picks.$b$,
 'internal', 'requirements', array['required items', 'checklist', 'list', 'qbo', 'bank accounts', 'what clients send'], array['BK', 'CFO', 'TAX'], true),
('internal-account-status',
 $t$Pausing or closing a client$t$,
 $b$**Update Profile → Account Status → Active, Paused or Closed**, then **Save Changes**. Paused means coming back; Closed means the service has ended. The status shows on the client's card and profile, and the Clients filters use it.

The status does not by itself stop the client signing in to the app.$b$,
 'internal', 'clients', array['pause', 'paused', 'close', 'closed', 'cancel', 'account status', 'inactive', 'active'], array[]::text[], true),
('internal-client-password',
 $t$A client can't sign in or forgot their password$t$,
 $b$Quickest first:

1. **They reset it themselves.** On the sign-in page they press **Forgot Password?**, enter their email and press **Send Link**. An email from info@ lets them choose a new password.
2. **Send them a link.** Open the client and press **Invite** (or **Invite again**). The email reads as a welcome, but it works the same for someone who has signed in before.
3. **Set one yourself.** In the client's **Update Profile**, under **Change Password**, type a new password (8 or more characters) and press **Update Password**. It changes straight away. Send it to the client, and suggest they change it in **Profile → Change Password**.

Option 3 works for client logins only. Staff and Team One reset theirs with **Forgot Password?**.$b$,
 'internal', 'clients', array['client password', 'reset password', 'forgot password', 'cannot sign in', 'locked out', 'login help'], array[]::text[], true),
('internal-help-and-bugs',
 $t$Getting help or reporting a bug$t$,
 $b$Open **How-to** for every procedure with its video, including what clients and Team One are told. Or press the gold chat bubble and ask how something works, or describe the problem: what you pressed, what you expected, and what happened. It raises a ticket (numbered TKT-…) for the team.

A conversation is not saved when you reload the page. The refresh icon starts a new one.$b$,
 'internal', 'help', array['bug', 'report a bug', 'ticket', 'help', 'broken', 'not working', 'support'], array[]::text[], true)

on conflict (slug) do update set
  title     = excluded.title,
  body      = excluded.body,
  audience  = excluded.audience,
  category  = excluded.category,
  tags      = excluded.tags,
  services  = excluded.services,
  is_active = excluded.is_active;

-- Retired, kept on record. The Workflow page is archived (Camaree: off the
-- menu, kept built), and the late-upload month bug is fixed: uploads now
-- count for the month the client picks.
update public.sops set is_active = false
 where slug in ('internal-workflow-overview', 'internal-workflow-no-rollback', 'internal-reviewer-notes', 'internal-report-sender', 'internal-query-items', 'internal-workflow-assignment', 'internal-upload-month-bug', 'client-late-upload-month');
