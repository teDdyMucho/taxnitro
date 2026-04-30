export type DocStatus = 'viewed' | 'not_viewed' | 'new';
export type DocType = 'folder' | 'file';

export interface DocItem {
  id: string;
  name: string;
  type: DocType;
  status: DocStatus;
  date: string;
  size?: string;
  fileType?: string;
  children?: DocItem[];
  count?: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'upload' | 'viewed' | 'new' | 'reminder';
  read: boolean;
}

export interface ActivityItem {
  id: string;
  action: string;
  document: string;
  time: string;
  type: 'upload' | 'viewed' | 'shared';
}

export const mockUser = {
  id: 'usr_001',
  name: 'Marcus Johnson',
  email: 'marcus.johnson@email.com',
  phone: '+1 (555) 234-5678',
  clientId: 'CLT-2024-0042',
  avatar: null,
  plan: 'Premium',
  memberSince: 'January 2024',
};

export const mockStats = {
  totalDocuments: 48,
  viewed: 32,
  pending: 11,
  recentUploads: 5,
};

export const mockFolders: DocItem[] = [
  {
    id: 'fld_001',
    name: 'Tax Returns 2024',
    type: 'folder',
    status: 'new',
    date: '2024-03-15',
    count: 12,
    children: [
      {
        id: 'file_001',
        name: 'Federal_Return_2024.pdf',
        type: 'file',
        status: 'new',
        date: '2024-03-15',
        size: '2.4 MB',
        fileType: 'pdf',
      },
      {
        id: 'file_002',
        name: 'State_Return_2024.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-03-14',
        size: '1.8 MB',
        fileType: 'pdf',
      },
      {
        id: 'file_003',
        name: 'Schedule_C_Expenses.xlsx',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-13',
        size: '856 KB',
        fileType: 'xlsx',
      },
      {
        id: 'file_004',
        name: 'W2_Forms_2024.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-03-10',
        size: '1.1 MB',
        fileType: 'pdf',
      },
      {
        id: 'file_005',
        name: '1099_Forms_Compilation.pdf',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-08',
        size: '3.2 MB',
        fileType: 'pdf',
      },
    ],
  },
  {
    id: 'fld_002',
    name: 'Tax Returns 2023',
    type: 'folder',
    status: 'viewed',
    date: '2024-02-20',
    count: 9,
    children: [
      {
        id: 'file_006',
        name: 'Federal_Return_2023.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-02-20',
        size: '2.1 MB',
        fileType: 'pdf',
      },
      {
        id: 'file_007',
        name: 'State_Return_2023.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-02-20',
        size: '1.6 MB',
        fileType: 'pdf',
      },
      {
        id: 'file_008',
        name: 'Amended_Return_2023.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-01-15',
        size: '1.9 MB',
        fileType: 'pdf',
      },
    ],
  },
  {
    id: 'fld_003',
    name: 'Business Documents',
    type: 'folder',
    status: 'not_viewed',
    date: '2024-03-10',
    count: 15,
    children: [
      {
        id: 'file_009',
        name: 'Business_License_2024.pdf',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-10',
        size: '450 KB',
        fileType: 'pdf',
      },
      {
        id: 'file_010',
        name: 'Profit_Loss_Statement.xlsx',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-09',
        size: '1.2 MB',
        fileType: 'xlsx',
      },
      {
        id: 'file_011',
        name: 'Balance_Sheet_Q4_2023.xlsx',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-08',
        size: '980 KB',
        fileType: 'xlsx',
      },
      {
        id: 'file_012',
        name: 'Articles_of_Incorporation.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-02-01',
        size: '760 KB',
        fileType: 'pdf',
      },
    ],
  },
  {
    id: 'fld_004',
    name: 'Receipts & Expenses',
    type: 'folder',
    status: 'not_viewed',
    date: '2024-03-12',
    count: 7,
    children: [
      {
        id: 'file_013',
        name: 'Office_Expenses_Q1.pdf',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-12',
        size: '2.8 MB',
        fileType: 'pdf',
      },
      {
        id: 'file_014',
        name: 'Vehicle_Mileage_Log.xlsx',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-11',
        size: '340 KB',
        fileType: 'xlsx',
      },
      {
        id: 'file_015',
        name: 'Travel_Receipts_2024.pdf',
        type: 'file',
        status: 'not_viewed',
        date: '2024-03-05',
        size: '5.1 MB',
        fileType: 'pdf',
      },
    ],
  },
  {
    id: 'fld_005',
    name: 'Investment Statements',
    type: 'folder',
    status: 'viewed',
    date: '2024-02-28',
    count: 5,
    children: [
      {
        id: 'file_016',
        name: 'Brokerage_Statement_2023.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-02-28',
        size: '1.5 MB',
        fileType: 'pdf',
      },
      {
        id: 'file_017',
        name: 'Dividend_Report_2023.pdf',
        type: 'file',
        status: 'viewed',
        date: '2024-02-27',
        size: '890 KB',
        fileType: 'pdf',
      },
    ],
  },
  {
    id: 'fld_006',
    name: 'Correspondence',
    type: 'folder',
    status: 'new',
    date: '2024-03-16',
    count: 3,
    children: [
      {
        id: 'file_018',
        name: 'IRS_Notice_CP2000.pdf',
        type: 'file',
        status: 'new',
        date: '2024-03-16',
        size: '620 KB',
        fileType: 'pdf',
      },
      {
        id: 'file_019',
        name: 'Response_Letter_Draft.docx',
        type: 'file',
        status: 'new',
        date: '2024-03-16',
        size: '245 KB',
        fileType: 'docx',
      },
    ],
  },
];

export const mockNotifications: Notification[] = [
  {
    id: 'notif_001',
    title: 'New Document Available',
    message: 'Your Federal Return 2024 has been uploaded and is ready for review.',
    time: '2 min ago',
    type: 'new',
    read: false,
  },
  {
    id: 'notif_002',
    title: 'IRS Notice Uploaded',
    message: 'Important: IRS Notice CP2000 requires your attention.',
    time: '1 hour ago',
    type: 'upload',
    read: false,
  },
  {
    id: 'notif_003',
    title: 'Document Viewed',
    message: 'Your tax advisor confirmed review of State Return 2023.',
    time: '3 hours ago',
    type: 'viewed',
    read: true,
  },
  {
    id: 'notif_004',
    title: 'New Documents Added',
    message: '3 new documents added to Business Documents folder.',
    time: 'Yesterday',
    type: 'upload',
    read: true,
  },
  {
    id: 'notif_005',
    title: 'Tax Season Reminder',
    message: 'Filing deadline is April 15. Please review all pending documents.',
    time: '2 days ago',
    type: 'reminder',
    read: true,
  },
  {
    id: 'notif_006',
    title: 'Documents Ready',
    message: 'Investment Statements 2023 has been uploaded to your portal.',
    time: '3 days ago',
    type: 'upload',
    read: true,
  },
];

export const mockActivity: ActivityItem[] = [
  {
    id: 'act_001',
    action: 'Uploaded',
    document: 'Federal Return 2024',
    time: '2 min ago',
    type: 'upload',
  },
  {
    id: 'act_002',
    action: 'Uploaded',
    document: 'IRS Notice CP2000',
    time: '1 hour ago',
    type: 'upload',
  },
  {
    id: 'act_003',
    action: 'Viewed',
    document: 'State Return 2023',
    time: '3 hours ago',
    type: 'viewed',
  },
  {
    id: 'act_004',
    action: 'Uploaded',
    document: 'Business License 2024',
    time: 'Yesterday',
    type: 'upload',
  },
  {
    id: 'act_005',
    action: 'Viewed',
    document: 'Investment Statements',
    time: '2 days ago',
    type: 'viewed',
  },
];

export const chartData = [
  { month: 'Oct', docs: 6 },
  { month: 'Nov', docs: 9 },
  { month: 'Dec', docs: 14 },
  { month: 'Jan', docs: 8 },
  { month: 'Feb', docs: 11 },
  { month: 'Mar', docs: 16 },
];
