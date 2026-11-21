import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Archive,
  Check,
  Cloud,
  ExternalLink,
  FileImage,
  FileJson,
  FileText,
  FolderSync,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  archiveDriveBackupInFirestore,
  getAccessToken,
  googleDriveSignIn,
  googleLogout,
  initAuth,
  recordDriveBackupInFirestore,
  subscribeDriveBackups,
  type DriveBackupFirestoreRecord,
} from '../firebase';
import {
  deleteDriveFile,
  ensureDriveFolder,
  listDriveFiles,
  renameDriveFile,
  uploadFileToDrive,
  type DriveFileItem,
} from '../services/googleDrive';
import type { Product, PromoBanner, ProductReview, StoreSettings } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GoogleDriveWorkspaceProps {
  storeData?: {
    settings: StoreSettings | null;
    products: Product[];
    banners: PromoBanner[];
    reviews: ProductReview[];
  };
  onPickFile?: (file: DriveFileItem) => void;
  onNotify?: (msg: string) => void;
}

type PendingMutation =
  | {
      kind: 'delete';
      file: DriveFileItem;
    }
  | {
      kind: 'rename';
      file: DriveFileItem;
      nextName: string;
    }
  | {
      kind: 'archive_record';
      record: DriveBackupFirestoreRecord;
    };

export function GoogleDriveWorkspace({
  storeData,
  onPickFile,
  onNotify,
}: GoogleDriveWorkspaceProps) {
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [firestoreRecords, setFirestoreRecords] = useState<DriveBackupFirestoreRecord[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<
    'product_media' | 'install_guide' | 'invoice'
  >('product_media');

  const [searchQuery, setSearchQuery] = useState('');
  const [mimeFilter, setMimeFilter] = useState<
    'all' | 'image/' | 'application/pdf' | 'application/json'
  >('all');
  const [errorMsg, setErrorMsg] = useState('');

  // Inline rename input draft before confirmation dialog
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Mandatory explicit confirmation modal for any mutating/destructive Drive or Firestore op
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [mutating, setMutating] = useState(false);

  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      (user) => {
        setGoogleUser(user);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!googleUser || !googleUser.emailVerified) {
      setFirestoreRecords([]);
      return;
    }
    const unsub = subscribeDriveBackups(
      googleUser,
      (records) => setFirestoreRecords(records),
      (err) => setErrorMsg(err.message)
    );
    return () => unsub();
  }, [googleUser]);

  const loadFiles = useCallback(
    async (tokenOverride?: string) => {
      const tk = tokenOverride || accessToken || (await getAccessToken());
      if (!tk) {
        setNeedsAuth(true);
        return;
      }
      setLoadingFiles(true);
      setErrorMsg('');
      try {
        const list = await listDriveFiles(tk, {
          searchQuery,
          mimePrefix: mimeFilter,
          pageSize: 30,
        });
        setFiles(list);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل ملفات Google Drive.');
      } finally {
        setLoadingFiles(false);
      }
    },
    [accessToken, searchQuery, mimeFilter]
  );

  useEffect(() => {
    if (accessToken) {
      void loadFiles(accessToken);
    }
  }, [accessToken, loadFiles]);

  const handleGoogleSignIn = async () => {
    setLoggingIn(true);
    setErrorMsg('');
    try {
      const res = await googleDriveSignIn();
      if (res) {
        setGoogleUser(res.user);
        setAccessToken(res.accessToken);
        setNeedsAuth(false);
        onNotify?.('تم الربط مع Google Drive و Firebase بنجاح.');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google.'
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await googleLogout();
    setGoogleUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    setFiles([]);
    onNotify?.('تم تسجيل الخروج من حساب Google.');
  };

  const handleBackupStoreToDrive = async () => {
    const tk = accessToken || (await getAccessToken());
    if (!tk || !googleUser) {
      setNeedsAuth(true);
      return;
    }
    setBackingUp(true);
    setErrorMsg('');
    try {
      const folderId = await ensureDriveFolder(tk, 'Taj Al-Thahabi Backups');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `taj-store-backup-${timestamp}.json`;
      const snapshot = {
        exportedAt: new Date().toISOString(),
        storeName: storeData?.settings?.storeName || 'مصنع التاج الذهبي لدبات التلوث',
        products: storeData?.products || [],
        banners: storeData?.banners || [],
        reviews: storeData?.reviews || [],
        settings: storeData?.settings || null,
      };
      const jsonContent = JSON.stringify(snapshot, null, 2);
      const uploaded = await uploadFileToDrive(tk, {
        fileName,
        mimeType: 'application/json',
        content: jsonContent,
        folderId,
      });

      await recordDriveBackupInFirestore(googleUser, {
        driveFileId: uploaded.id,
        fileName: uploaded.name,
        mimeType: uploaded.mimeType,
        category: 'store_backup',
        webViewLink: uploaded.webViewLink,
        sizeBytes: jsonContent.length,
      });

      await loadFiles(tk);
      onNotify?.(`تم حفظ نسخة احتياطية للمتجر في Google Drive (${uploaded.name})`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إنشاء النسخة الاحتياطية.');
    } finally {
      setBackingUp(false);
    }
  };

  const handleUploadDeviceFile = async (file: File) => {
    const tk = accessToken || (await getAccessToken());
    if (!tk || !googleUser) {
      setNeedsAuth(true);
      return;
    }
    setUploadingFile(true);
    setErrorMsg('');
    try {
      const folderId = await ensureDriveFolder(tk, 'Taj Al-Thahabi Assets');
      const uploaded = await uploadFileToDrive(tk, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        content: file,
        folderId,
      });

      await recordDriveBackupInFirestore(googleUser, {
        driveFileId: uploaded.id,
        fileName: uploaded.name,
        mimeType: uploaded.mimeType,
        category: uploadCategory,
        webViewLink: uploaded.webViewLink,
        sizeBytes: file.size,
      });

      await loadFiles(tk);
      onNotify?.(`تم رفع "${uploaded.name}" إلى Google Drive وحفظ رابطه في Firestore.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل رفع الملف إلى Google Drive.');
    } finally {
      setUploadingFile(false);
    }
  };

  const executeConfirmedMutation = async () => {
    if (!pendingMutation) return;
    const tk = accessToken || (await getAccessToken());
    if (!tk || !googleUser) {
      setNeedsAuth(true);
      setPendingMutation(null);
      return;
    }

    setMutating(true);
    setErrorMsg('');
    try {
      if (pendingMutation.kind === 'delete') {
        await deleteDriveFile(tk, pendingMutation.file.id);
        setFiles((prev) => prev.filter((f) => f.id !== pendingMutation.file.id));
        onNotify?.(`تم حذف "${pendingMutation.file.name}" من Google Drive.`);
      } else if (pendingMutation.kind === 'rename') {
        const updated = await renameDriveFile(
          tk,
          pendingMutation.file.id,
          pendingMutation.nextName
        );
        setFiles((prev) =>
          prev.map((f) => (f.id === pendingMutation.file.id ? { ...f, ...updated } : f))
        );
        setRenameTargetId(null);
        setRenameDraft('');
        onNotify?.(`تم تغيير اسم الملف إلى "${updated.name}".`);
      } else if (pendingMutation.kind === 'archive_record') {
        await archiveDriveBackupInFirestore(googleUser, pendingMutation.record.id);
        onNotify?.(`تمت أرشفة السجل "${pendingMutation.record.fileName}" في Firestore.`);
      }
      setPendingMutation(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تنفيذ العملية على Google Drive.');
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Connection Status */}
      <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#121216] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
            <Cloud className="w-6 h-6 text-[#E5C158]" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#F5F2EB]">
              تكامل Google Drive و Firebase السحابي
            </h2>
            <p className="text-xs text-[#9E988C]">
              حفظ نسخ احتياطية للمتجر، استعراض ورفع صور المنتجات وأدلة التركيب PDF مباشرة على Drive
            </p>
          </div>
        </div>

        {needsAuth ? (
          <GoogleSignInButton
            onClick={handleGoogleSignIn}
            disabled={loggingIn}
            label={loggingIn ? 'جاري الربط...' : 'Sign in with Google'}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            {googleUser && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/35 bg-emerald-950/20 text-xs">
                {googleUser.photoURL && (
                  <img
                    src={googleUser.photoURL}
                    alt={googleUser.displayName || 'Google'}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <div className="leading-tight">
                  <div className="font-bold text-emerald-300">
                    {googleUser.displayName || 'Google Connected'}
                  </div>
                  <div className="text-[10px] text-[#9E988C]" dir="ltr">
                    {googleUser.email}
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleGoogleSignOut}
              className="h-9 px-3 rounded-xl border border-red-500/40 bg-red-950/20 hover:bg-red-950/40 text-xs font-bold text-red-300 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>فصل حساب Google</span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-red-500/40 bg-red-950/30 text-xs text-red-200 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-red-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {needsAuth ? (
        <div className="rounded-2xl border border-white/10 bg-[#121216] p-8 text-center space-y-4">
          <Cloud className="w-12 h-12 text-[#D4AF37]/70 mx-auto" />
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base font-bold text-[#F5F2EB]">
              قم بتسجيل الدخول بحساب Google لتفعيل Google Drive و Firestore
            </h3>
            <p className="text-xs text-[#9E988C] leading-relaxed">
              بمجرد الموافقة ومنح الإذن، ستتمكن من رفع نسخ احتياطية كاملة للمتجر، استيراد صور
              المنتجات وملفات PDF من Google Drive، ومزامنة السجلات عبر Firebase Firestore بأمان.
            </p>
          </div>
          <div className="pt-2">
            <GoogleSignInButton
              onClick={handleGoogleSignIn}
              disabled={loggingIn}
              label={loggingIn ? 'جاري تسجيل الدخول...' : 'Sign in with Google'}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Quick Cloud Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Backup Card */}
            <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#121216] p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                <FolderSync className="w-4 h-4" />
                <span>نسخ احتياطي كامل للمتجر على Google Drive</span>
              </div>
              <p className="text-xs text-[#9E988C] leading-relaxed">
                يحفظ جميع المنتجات ({storeData?.products.length ?? 0})، الإعدادات، البنرات، والتقييمات
                كملف JSON داخل مجلد "Taj Al-Thahabi Backups" في حسابك مع توثيق السجل في Firestore.
              </p>
              <button
                type="button"
                onClick={handleBackupStoreToDrive}
                disabled={backingUp}
                className="btn-gold-wave h-10 px-5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <FolderSync className="w-4 h-4" />
                <span>
                  {backingUp ? 'جاري الرفع إلى Drive...' : 'حفظ نسخة احتياطية الآن على Drive'}
                </span>
              </button>
            </div>

            {/* Direct Upload Card */}
            <div className="rounded-2xl border border-white/10 bg-[#121216] p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                <Upload className="w-4 h-4" />
                <span>رفع ملف جديد إلى Google Drive</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={uploadCategory}
                  onChange={(e) =>
                    setUploadCategory(
                      e.target.value as 'product_media' | 'install_guide' | 'invoice'
                    )
                  }
                  className="h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                >
                  <option value="product_media">صورة منتج / وسائط</option>
                  <option value="install_guide">دليل تركيب PDF</option>
                  <option value="invoice">فاتورة / مستند</option>
                </select>

                <label className="h-10 px-4 rounded-xl border border-[#D4AF37]/45 bg-[#171510] hover:border-[#D4AF37] text-xs font-bold text-[#E5C158] inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>{uploadingFile ? 'جاري الرفع...' : 'اختر ملفاً للرفع إلى Drive'}</span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploadingFile}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadDeviceFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Drive Files Browser */}
          <div className="rounded-2xl border border-white/10 bg-[#121216] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-[#F5F2EB]">
                ملفات Google Drive ({files.length})
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#D4AF37] absolute start-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث باسم الملف..."
                    className="h-9 ps-8 pe-3 rounded-lg bg-[#16161B] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <select
                  value={mimeFilter}
                  onChange={(e) =>
                    setMimeFilter(
                      e.target.value as
                        | 'all'
                        | 'image/'
                        | 'application/pdf'
                        | 'application/json'
                    )
                  }
                  className="h-9 px-2.5 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                >
                  <option value="all">كل الملفات</option>
                  <option value="image/">الصور فقط</option>
                  <option value="application/pdf">ملفات PDF</option>
                  <option value="application/json">النسخ الاحتياطية JSON</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadFiles()}
                  disabled={loadingFiles}
                  className="h-9 px-3 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/50 text-xs text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                  <span>تحديث</span>
                </button>
              </div>
            </div>

            {loadingFiles && files.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#9E988C]">
                جاري جلب الملفات من Google Drive...
              </div>
            ) : files.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#9E988C]">
                لا توجد ملفات مطابقة في Google Drive حالياً.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto">
                {files.map((file) => {
                  const isImage = file.mimeType.startsWith('image/');
                  const isPdf = file.mimeType === 'application/pdf';
                  const isJson = file.mimeType === 'application/json';
                  const isRenaming = renameTargetId === file.id;

                  return (
                    <div
                      key={file.id}
                      className="p-3 rounded-xl border border-white/10 bg-[#0D0D10] flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-11 h-11 rounded-lg border border-white/10 bg-[#16161B] flex items-center justify-center shrink-0 overflow-hidden">
                          {isImage && file.thumbnailLink ? (
                            <img
                              src={file.thumbnailLink}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : isImage ? (
                            <FileImage className="w-5 h-5 text-emerald-400" />
                          ) : isPdf ? (
                            <FileText className="w-5 h-5 text-red-400" />
                          ) : isJson ? (
                            <FileJson className="w-5 h-5 text-[#E5C158]" />
                          ) : (
                            <Cloud className="w-5 h-5 text-[#9E988C]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          {isRenaming ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                className="flex-1 h-7 px-2 rounded bg-[#16161B] border border-[#D4AF37]/50 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const trimmed = renameDraft.trim();
                                  if (!trimmed || trimmed === file.name) {
                                    setRenameTargetId(null);
                                    return;
                                  }
                                  setPendingMutation({
                                    kind: 'rename',
                                    file,
                                    nextName: trimmed,
                                  });
                                }}
                                className="h-7 px-2 rounded bg-[#D4AF37] text-[#09090B] text-[10px] font-bold cursor-pointer"
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenameTargetId(null)}
                                className="h-7 px-2 rounded border border-white/15 text-[10px] cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs font-bold text-[#F5F2EB] truncate">
                              {file.name}
                            </div>
                          )}
                          <div className="text-[10px] text-[#9E988C] flex flex-wrap gap-2">
                            <span>{file.mimeType}</span>
                            {file.size && (
                              <span>
                                · {Math.max(1, Math.round(Number(file.size) / 1024))} KB
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onPickFile && (
                          <button
                            type="button"
                            onClick={() => onPickFile(file)}
                            title="استخدام هذا الملف"
                            className="h-7 px-2.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>اختيار</span>
                          </button>
                        )}
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="فتح في Google Drive"
                            className="w-7 h-7 rounded-lg border border-white/10 bg-[#16161B] text-[#E5C158] flex items-center justify-center"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setRenameTargetId(file.id);
                            setRenameDraft(file.name);
                          }}
                          title="إعادة تسمية"
                          className="w-7 h-7 rounded-lg border border-white/10 bg-[#16161B] text-[#C5BFB2] hover:text-white flex items-center justify-center cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingMutation({ kind: 'delete', file })}
                          title="حذف من Google Drive"
                          className="w-7 h-7 rounded-lg border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-950/50 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Firestore Logged Backups & Uploads */}
          <div className="rounded-2xl border border-white/10 bg-[#121216] p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#E5C158]">
              سجل النسخ والملفات الموثقة في Firestore ({firestoreRecords.length})
            </h3>
            {firestoreRecords.length === 0 ? (
              <div className="text-xs text-[#9E988C]">
                لا توجد سجلات محفوظة في Firestore حتى الآن. سيتم التوثيق تلقائياً عند أخذ نسخة احتياطية
                أو رفع ملف.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {firestoreRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-xl border border-white/10 bg-[#0D0D10] flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#F5F2EB] truncate">{rec.fileName}</div>
                      <div className="text-[11px] text-[#9E988C]">
                        التصنيف: {rec.category} · الحالة:{' '}
                        <span
                          className={
                            rec.status === 'active' ? 'text-emerald-400' : 'text-amber-400'
                          }
                        >
                          {rec.status === 'active' ? 'نشط' : 'مؤرشف'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rec.webViewLink && (
                        <a
                          href={rec.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-7 px-2.5 rounded-lg border border-[#D4AF37]/40 text-[#E5C158] flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>عرض</span>
                        </a>
                      )}
                      {rec.status === 'active' && (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingMutation({ kind: 'archive_record', record: rec })
                          }
                          className="h-7 px-2.5 rounded-lg border border-amber-500/40 text-amber-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Archive className="w-3 h-3" />
                          <span>أرشفة</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* MANDATORY Explicit Confirmation Dialog for Mutating / Destructive Operations */}
      {pendingMutation && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => !mutating && setPendingMutation(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#121216] p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-amber-300">
              <AlertTriangle className="w-6 h-6 shrink-0 text-red-400" />
              <h3 className="font-display text-lg font-bold text-[#F5F2EB]">
                تأكيد العملية على Google Drive
              </h3>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/10 text-xs text-[#C5BFB2] space-y-1.5 leading-relaxed">
              {pendingMutation.kind === 'delete' && (
                <>
                  <div>
                    هل أنت متأكد من حذف الملف التالي نهائياً من Google Drive؟ لا يمكن التراجع عن
                    الحذف.
                  </div>
                  <div className="font-bold text-red-300 break-all">
                    الملف: {pendingMutation.file.name}
                  </div>
                  <div className="text-[10px] text-[#9E988C]" dir="ltr">
                    ID: {pendingMutation.file.id}
                  </div>
                </>
              )}
              {pendingMutation.kind === 'rename' && (
                <>
                  <div>هل تؤكد تعديل اسم الملف في Google Drive؟</div>
                  <div>
                    الاسم الحالي: <strong>{pendingMutation.file.name}</strong>
                  </div>
                  <div className="text-[#E5C158]">
                    الاسم الجديد: <strong>{pendingMutation.nextName}</strong>
                  </div>
                </>
              )}
              {pendingMutation.kind === 'archive_record' && (
                <>
                  <div>هل تؤكد أرشفة سجل النسخة الاحتياطية في Firestore؟</div>
                  <div className="font-bold text-amber-300">
                    السجل: {pendingMutation.record.fileName}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={mutating}
                onClick={() => setPendingMutation(null)}
                className="h-9 px-4 rounded-xl border border-white/15 text-xs text-[#C5BFB2] hover:text-white cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={mutating}
                onClick={() => void executeConfirmedMutation()}
                className={`h-9 px-5 rounded-xl text-xs font-bold text-white cursor-pointer ${
                  pendingMutation.kind === 'delete'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158]'
                }`}
              >
                {mutating
                  ? 'جاري التنفيذ...'
                  : pendingMutation.kind === 'delete'
                    ? 'تأكيد الحذف نهائياً'
                    : 'تأكيد التحديث'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
