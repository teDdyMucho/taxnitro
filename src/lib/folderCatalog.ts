// The folders a document can live in, named once.
//
// This list was written out twice already — in AdminUploadModal to offer folders
// to upload into, and in AdminReplyBell to name the folder a reply came from —
// and a move needs it a third time. Two copies had already drifted apart in
// shape if not in wording, and a fourth would be worse, so it lives here.

export interface FolderDef {
  /** The table the documents are in. */
  key: string;
  /** What it is called on screen. */
  label: string;
}

export interface FolderGroup {
  title: string;
  folders: FolderDef[];
}

/** Which service a folder belongs to, from its own key. */
export type Service = 'TAX' | 'BK' | 'CFO';

export const FOLDER_GROUPS: FolderGroup[] = [
  { title: 'Tax Documents & Returns', folders: [
    { key: 'tax_contracts',           label: 'Tax Contracts' },
    { key: 'tax_invoices',            label: 'Tax Invoices' },
    { key: 'tax_client_uploads',      label: 'Client Uploads' },
    { key: 'tax_additional_docs',     label: 'Additional Tax Docs' },
    { key: 'tax_return_information',  label: 'Tax Returns' },
  ]},
  { title: 'Bookkeeping & Financials', folders: [
    { key: 'bk_contracts',            label: 'BK Contracts' },
    { key: 'bk_invoices',             label: 'BK Invoices' },
    { key: 'bk_bank_accounts',        label: 'Bank Accounts' },
    { key: 'bk_final_pnl',            label: 'Additional BK Docs' },
    { key: 'bk_mr_required_info',     label: 'Monthly Reporting (Required Info)' },
    { key: 'bk_mr_client_review',     label: 'Monthly Reporting (For Client Review)' },
    { key: 'bk_mr_final_statements',  label: 'Monthly Reporting (Final Statements)' },
  ]},
  { title: 'CFO Advisory', folders: [
    { key: 'cfo_contracts',           label: 'CFO Contracts' },
    { key: 'cfo_invoices',            label: 'CFO Invoices' },
    { key: 'cfo_additional_docs',     label: 'Additional CFO Docs' },
    { key: 'cfo_mr_required_info',    label: 'Monthly Reporting (Required Info)' },
    { key: 'cfo_mr_client_review',    label: 'Monthly Reporting (For Client Review)' },
    { key: 'cfo_mr_final_statements', label: 'Monthly Reporting (Final Statements & Insights)' },
  ]},
];

export const ALL_FOLDERS: FolderDef[] = FOLDER_GROUPS.flatMap(g => g.folders);

/** Folder key → the name people know it by. */
export const FOLDER_LABEL: Record<string, string> = Object.fromEntries(
  ALL_FOLDERS.map(f => [f.key, f.label]),
);

/** What to call a folder, falling back to its key rather than showing nothing. */
export const folderLabel = (key: string): string => FOLDER_LABEL[key] ?? key;

/**
 * Which service a folder belongs to, from its own key.
 *
 * Filing a document into a folder the client does not take would leave it
 * somewhere they never look — their Documents tree is built from their services.
 */
export function serviceOfFolder(key: string): Service {
  if (key.startsWith('tax_')) return 'TAX';
  if (key.startsWith('cfo_')) return 'CFO';
  return 'BK';
}

/**
 * The folders a document could be moved to: the client's own, minus the one it
 * is already in.
 *
 * Given no services, all of them are offered — an older client record may have
 * none recorded, and showing nothing would look like the feature is broken.
 */
export function moveDestinations(
  currentFolder: string,
  services?: string[] | null,
): FolderGroup[] {
  const take = services && services.length ? services : null;
  return FOLDER_GROUPS
    .map(g => ({
      ...g,
      folders: g.folders.filter(
        f => f.key !== currentFolder && (!take || take.includes(serviceOfFolder(f.key))),
      ),
    }))
    .filter(g => g.folders.length > 0);
}

/**
 * Folders that hold what FTG delivers TO a client, rather than what the client
 * sends in. Mirrors STAFF_UPLOAD_ITEMS in src/db/requirements.ts.
 *
 * Named here so a move can leave them alone: these are not the client's to
 * rearrange, and a file put into one would sit among the month's statements as
 * though FTG had issued it.
 */
export const STAFF_DELIVERY_FOLDERS = [
  'bk_mr_client_review',
  'cfo_mr_client_review',
  'bk_mr_final_statements',
  'cfo_mr_final_statements',
];

export const isStaffDeliveryFolder = (key: string): boolean =>
  STAFF_DELIVERY_FOLDERS.includes(key);

/**
 * Where a CLIENT may move their own file: the folders their services cover,
 * less the ones FTG delivers into and the one it is already in.
 */
export function clientMoveDestinations(
  currentFolder: string,
  services?: string[] | null,
): FolderGroup[] {
  return moveDestinations(currentFolder, services)
    .map(g => ({ ...g, folders: g.folders.filter(f => !isStaffDeliveryFolder(f.key)) }))
    .filter(g => g.folders.length > 0);
}
