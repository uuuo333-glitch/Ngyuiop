export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export async function listDriveFiles(
  accessToken: string,
  options?: {
    searchQuery?: string;
    mimePrefix?: 'image/' | 'application/pdf' | 'application/json' | 'all';
    pageSize?: number;
  }
): Promise<DriveFileItem[]> {
  const clauses: string[] = ['trashed = false'];

  if (options?.searchQuery?.trim()) {
    const escaped = options.searchQuery.trim().replace(/'/g, "\\'");
    clauses.push(`name contains '${escaped}'`);
  }
  if (options?.mimePrefix === 'image/') {
    clauses.push(`mimeType contains 'image/'`);
  } else if (options?.mimePrefix === 'application/pdf') {
    clauses.push(`mimeType = 'application/pdf'`);
  } else if (options?.mimePrefix === 'application/json') {
    clauses.push(`mimeType = 'application/json'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    pageSize: String(options?.pageSize ?? 24),
    orderBy: 'modifiedTime desc',
    fields:
      'files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,thumbnailLink,iconLink)',
  });

  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'فشل استعراض ملفات Google Drive.');
  }
  return Array.isArray(data.files) ? data.files : [];
}

export async function ensureDriveFolder(
  accessToken: string,
  folderName: string
): Promise<string> {
  const escaped = folderName.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escaped}'`,
    pageSize: '1',
    fields: 'files(id,name)',
  });
  const searchRes = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchJson = await searchRes.json();
  if (searchRes.ok && Array.isArray(searchJson.files) && searchJson.files[0]?.id) {
    return searchJson.files[0].id as string;
  }

  const createRes = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    throw new Error(createJson?.error?.message || 'تعذر إنشاء مجلد النسخ الاحتياطي في Google Drive.');
  }
  return createJson.id as string;
}

export async function uploadFileToDrive(
  accessToken: string,
  input: {
    fileName: string;
    mimeType: string;
    content: Blob | string;
    folderId?: string;
  }
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {
    name: input.fileName,
    mimeType: input.mimeType,
  };
  if (input.folderId) {
    metadata.parents = [input.folderId];
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  const bodyBlob =
    typeof input.content === 'string'
      ? new Blob([input.content], { type: input.mimeType })
      : input.content;
  form.append('file', bodyBlob, input.fileName);

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,thumbnailLink,iconLink`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error(data?.error?.message || 'فشل رفع الملف إلى Google Drive.');
  }
  return data as DriveFileItem;
}

export async function renameDriveFile(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<DriveFileItem> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'فشل تعديل اسم الملف في Google Drive.');
  }
  return data as DriveFileItem;
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message || 'فشل حذف الملف من Google Drive.');
  }
}
