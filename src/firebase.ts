import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
] as const;

const app = initializeApp(firebaseConfig);

const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-6c89feac-18c2-49ab-a9c1-9b24920f2289';

export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of DRIVE_SCOPES) {
  provider.addScope(scope);
}

// Strict in-memory token cache (never stored in localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Startup Firestore connection validation
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
): Unsubscribe => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    cachedAccessToken = credential.accessToken;
    await ensureFirestoreUserProfile(result.user);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google sign in error:', error);
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/popup-blocked') {
      throw new Error('تم حظر النافذة المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع والمحاولة مجدداً.');
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('تم إغلاق نافذة تسجيل الدخول قبل إتمام التحقق.');
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const googleLogout = async (): Promise<void> => {
  cachedAccessToken = null;
  await auth.signOut();
};

export interface FirestoreWishlistRecord {
  userId: string;
  productId: string;
  productName: string;
  priceSar: number;
  imageUrl?: string;
}

export interface DriveBackupFirestoreRecord {
  id: string;
  ownerUid: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  category: 'store_backup' | 'product_media' | 'install_guide' | 'invoice';
  webViewLink?: string;
  sizeBytes?: number;
  status: 'active' | 'archived';
  createdAt?: unknown;
}

function sanitizeDocId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'item';
}

export async function ensureFirestoreUserProfile(
  user: User,
  privatePatch?: {
    phone?: string;
    nationalAddress?: string;
    address?: string;
  }
): Promise<void> {
  if (!user.uid || !user.emailVerified) return;
  const uid = sanitizeDocId(user.uid);
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  const displayName = (user.displayName || user.email?.split('@')[0] || 'User').slice(0, 120);
  const photoURL = user.photoURL ? user.photoURL.slice(0, 500) : undefined;

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      await setDoc(userRef, payload);
    } else {
      const payload: Record<string, unknown> = {
        displayName,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      await updateDoc(userRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const privatePath = `users/${uid}/private/info`;
  const privateRef = doc(db, 'users', uid, 'private', 'info');
  try {
    const pSnap = await getDoc(privateRef);
    const emailVal = user.email ? user.email.slice(0, 180) : undefined;
    if (!pSnap.exists()) {
      const pPayload: Record<string, unknown> = {
        uid,
        updatedAt: serverTimestamp(),
      };
      if (emailVal) pPayload.email = emailVal;
      if (privatePatch?.phone) pPayload.phone = privatePatch.phone.slice(0, 40);
      if (privatePatch?.nationalAddress) {
        pPayload.nationalAddress = privatePatch.nationalAddress.slice(0, 60);
      }
      if (privatePatch?.address) pPayload.address = privatePatch.address.slice(0, 300);
      await setDoc(privateRef, pPayload);
    } else if (privatePatch || emailVal) {
      const pPayload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (emailVal) pPayload.email = emailVal;
      if (privatePatch?.phone !== undefined) pPayload.phone = privatePatch.phone.slice(0, 40);
      if (privatePatch?.nationalAddress !== undefined) {
        pPayload.nationalAddress = privatePatch.nationalAddress.slice(0, 60);
      }
      if (privatePatch?.address !== undefined) pPayload.address = privatePatch.address.slice(0, 300);
      await updateDoc(privateRef, pPayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export async function syncWishlistItemToFirestore(
  user: User,
  item: { id: string; name: string; priceSar: number; imageUrl?: string },
  saved: boolean
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeDocId(user.uid);
  const pid = sanitizeDocId(item.id);
  const itemPath = `users/${uid}/wishlists/${pid}`;

  if (saved) {
    await ensureFirestoreUserProfile(user);
    const ref = doc(db, 'users', uid, 'wishlists', pid);
    try {
      const existingSnap = await getDoc(ref);
      const imageUrl = (item.imageUrl || '').slice(0, 1000);
      if (!existingSnap.exists()) {
        const payload: Record<string, unknown> = {
          userId: uid,
          productId: pid,
          productName: (item.name || 'Product').slice(0, 200),
          priceSar: Math.max(0, Math.min(1000000, Number(item.priceSar) || 0)),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (imageUrl) payload.imageUrl = imageUrl;
        await setDoc(ref, payload);
      } else {
        const payload: Record<string, unknown> = {
          productName: (item.name || 'Product').slice(0, 200),
          priceSar: Math.max(0, Math.min(1000000, Number(item.priceSar) || 0)),
          updatedAt: serverTimestamp(),
        };
        if (imageUrl) payload.imageUrl = imageUrl;
        await updateDoc(ref, payload);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, itemPath);
    }
  } else {
    try {
      await deleteDoc(doc(db, 'users', uid, 'wishlists', pid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, itemPath);
    }
  }
}

export async function fetchFirestoreWishlistIds(user: User): Promise<string[]> {
  if (!user.emailVerified) return [];
  const uid = sanitizeDocId(user.uid);
  const listPath = `users/${uid}/wishlists`;
  try {
    const q = query(collection(db, 'users', uid, 'wishlists'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => String(d.data().productId || d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, listPath);
  }
}

export async function recordDriveBackupInFirestore(
  user: User,
  input: {
    driveFileId: string;
    fileName: string;
    mimeType: string;
    category: 'store_backup' | 'product_media' | 'install_guide' | 'invoice';
    webViewLink?: string;
    sizeBytes?: number;
  }
): Promise<string> {
  if (!user.uid || !user.emailVerified) {
    throw new Error('يرجى تسجيل الدخول بحساب Google الموثق لحفظ سجل النسخ الاحتياطي.');
  }
  const uid = sanitizeDocId(user.uid);
  await ensureFirestoreUserProfile(user);
  const backupId = sanitizeDocId(`drv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `users/${uid}/driveBackups/${backupId}`;

  const payload: Record<string, unknown> = {
    ownerUid: uid,
    driveFileId: input.driveFileId.slice(0, 200),
    fileName: input.fileName.slice(0, 200),
    mimeType: input.mimeType.slice(0, 150),
    category: input.category,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.webViewLink) payload.webViewLink = input.webViewLink.slice(0, 1000);
  if (typeof input.sizeBytes === 'number' && !Number.isNaN(input.sizeBytes)) {
    payload.sizeBytes = Math.max(0, Math.min(10000000000, Math.round(input.sizeBytes)));
  }

  try {
    await setDoc(doc(db, 'users', uid, 'driveBackups', backupId), payload);
    return backupId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeDriveBackups(
  user: User,
  onRecords: (records: DriveBackupFirestoreRecord[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  if (!user.uid || !user.emailVerified) {
    onRecords([]);
    return () => {};
  }
  const uid = sanitizeDocId(user.uid);
  const path = `users/${uid}/driveBackups`;
  const q = query(collection(db, 'users', uid, 'driveBackups'), where('ownerUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: DriveBackupFirestoreRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerUid: String(data.ownerUid || uid),
          driveFileId: String(data.driveFileId || ''),
          fileName: String(data.fileName || ''),
          mimeType: String(data.mimeType || 'application/octet-stream'),
          category: (data.category as DriveBackupFirestoreRecord['category']) || 'store_backup',
          webViewLink: data.webViewLink ? String(data.webViewLink) : undefined,
          sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
          status: (data.status as 'active' | 'archived') || 'active',
          createdAt: data.createdAt,
        };
      });
      onRecords(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onErr?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function archiveDriveBackupInFirestore(user: User, backupId: string): Promise<void> {
  if (!user.uid || !user.emailVerified) return;
  const uid = sanitizeDocId(user.uid);
  const safeId = sanitizeDocId(backupId);
  const path = `users/${uid}/driveBackups/${safeId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'driveBackups', safeId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface SaveFirestoreProductInput {
  id: string;
  sku?: string;
  name: string;
  nameEn?: string;
  category: string;
  priceSar: number;
  description?: string;
  images?: string[];
  sizes?: string[];
  inStock?: boolean;
  isPublished?: boolean;
}

export async function saveProductToFirestore(
  user: User,
  product: SaveFirestoreProductInput
): Promise<{ personalPath: string; catalogPublished: boolean }> {
  if (!user.uid || !user.emailVerified) {
    throw new Error('يرجى ربط حساب Google الموثق لحفظ المنتج في قاعدة بيانات Firebase.');
  }

  const uid = sanitizeDocId(user.uid);
  const pid = sanitizeDocId(product.id || `prod_${Date.now().toString(36)}`);
  const personalPath = `users/${uid}/products/${pid}`;

  await ensureFirestoreUserProfile(user);

  const sanitizedImages = (product.images || [])
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && !u.startsWith('data:') && u.length <= 1500)
    .slice(0, 12);

  const sanitizedSizes = (product.sizes || [])
    .map((s) => String(s || '').trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 20);

  const baseFields: Record<string, unknown> = {
    ownerUid: uid,
    productId: pid,
    name: (product.name || 'منتج جديد').trim().slice(0, 240) || 'منتج جديد',
    category: (product.category || 'دبات تلوث البنزين').trim().slice(0, 120) || 'دبات تلوث البنزين',
    priceSar: Math.max(0, Math.min(10000000, Number(product.priceSar) || 0)),
    description: (product.description || '').trim().slice(0, 5000),
    images: sanitizedImages,
    sizes: sanitizedSizes,
    inStock: product.inStock !== false,
    isPublished: Boolean(product.isPublished),
  };

  if (product.sku?.trim()) {
    baseFields.sku = product.sku.trim().slice(0, 64);
  }
  if (product.nameEn?.trim()) {
    baseFields.nameEn = product.nameEn.trim().slice(0, 240);
  }

  const personalRef = doc(db, 'users', uid, 'products', pid);
  try {
    const existingSnap = await getDoc(personalRef);
    if (!existingSnap.exists()) {
      await setDoc(personalRef, {
        ...baseFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingPersonal = existingSnap.data();
      await updateDoc(personalRef, {
        ...baseFields,
        ownerUid: String(existingPersonal.ownerUid || uid),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, personalPath);
  }

  let catalogPublished = false;
  if (user.email === 'uuuo333@gmail.com' || user.email === 'dbattloth.221@gmail.com') {
    const catalogRef = doc(db, 'products', pid);
    try {
      const catSnap = await getDoc(catalogRef);
      if (!catSnap.exists()) {
        await setDoc(catalogRef, {
          ...baseFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingCatalog = catSnap.data();
        await updateDoc(catalogRef, {
          ...baseFields,
          ownerUid: String(existingCatalog.ownerUid || uid),
          updatedAt: serverTimestamp(),
        });
      }
      catalogPublished = true;
    } catch {
      // Non-blocking fallback if user does not hold catalog admin mirror permission
      catalogPublished = false;
    }
  }

  return { personalPath, catalogPublished };
}

export async function deleteProductFromFirestore(
  user: User,
  productId: string
): Promise<boolean> {
  if (!user.uid || !user.emailVerified) return false;
  const uid = sanitizeDocId(user.uid);
  const pid = sanitizeDocId(productId);
  try {
    await deleteDoc(doc(db, 'users', uid, 'products', pid)).catch(() => {});
    if (user.email === 'uuuo333@gmail.com' || user.email === 'dbattloth.221@gmail.com') {
      await deleteDoc(doc(db, 'products', pid)).catch(() => {});
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${pid}`);
  }
}

export interface StorefrontConfigFirestoreInput {
  storeName: string;
  storeTagline: string;
  storeLogoUrl?: string;
  themePreset?: string;
  primaryGoldColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  themeFontFamily?: string;
  cardStyle?: string;
  buttonStyle?: string;
  productsSectionBgUrl?: string;
  productsSectionBgOpacity?: number;
}

export async function saveStorefrontConfigToFirestore(
  user: User,
  input: StorefrontConfigFirestoreInput
): Promise<boolean> {
  if (!user.uid || !user.emailVerified) {
    throw new Error('يرجى ربط حساب Google الموثق لحفظ التعديلات في قاعدة بيانات Firebase.');
  }

  const uid = sanitizeDocId(user.uid);
  const path = 'storefront/public';
  await ensureFirestoreUserProfile(user);

  const payload: Record<string, unknown> = {
    configId: 'public',
    storeName: (input.storeName || 'مصنع التاج الذهبي لدبات التلوث').trim().slice(0, 160),
    storeTagline: (input.storeTagline || '').trim().slice(0, 300),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };

  const addStr = (key: string, val: string | undefined, maxLen: number, allowEmpty = false) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed && !allowEmpty) return;
    if (trimmed.startsWith('data:') && trimmed.length > maxLen) return;
    if (trimmed.length <= maxLen) {
      payload[key] = trimmed;
    }
  };

  addStr('storeLogoUrl', input.storeLogoUrl, 1500, true);
  addStr('themePreset', input.themePreset, 40);
  addStr('primaryGoldColor', input.primaryGoldColor, 32);
  addStr('secondaryColor', input.secondaryColor, 32);
  addStr('backgroundColor', input.backgroundColor, 32);
  addStr('surfaceColor', input.surfaceColor, 32);
  addStr('textColor', input.textColor, 32);
  addStr('themeFontFamily', input.themeFontFamily, 64);
  addStr('cardStyle', input.cardStyle, 40);
  addStr('buttonStyle', input.buttonStyle, 40);
  addStr('productsSectionBgUrl', input.productsSectionBgUrl, 1500, true);

  if (
    typeof input.productsSectionBgOpacity === 'number' &&
    !Number.isNaN(input.productsSectionBgOpacity)
  ) {
    payload.productsSectionBgOpacity = Math.max(
      0,
      Math.min(1, Number(input.productsSectionBgOpacity))
    );
  }

  try {
    await setDoc(doc(db, 'storefront', 'public'), payload);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface StorefrontBannerFirestoreInput {
  id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaUrl?: string;
  discountLabel?: string;
  accentColor: string;
  isActive: boolean;
}

export async function saveBannerToFirestore(
  user: User,
  banner: StorefrontBannerFirestoreInput
): Promise<boolean> {
  if (!user.uid || !user.emailVerified) {
    throw new Error('يرجى ربط حساب Google الموثق لحفظ البنر في قاعدة بيانات Firebase.');
  }

  const uid = sanitizeDocId(user.uid);
  const bid = sanitizeDocId(banner.id || `banner_${Date.now().toString(36)}`);
  const path = `banners/${bid}`;
  await ensureFirestoreUserProfile(user);

  const ref = doc(db, 'banners', bid);
  const baseFields: Record<string, unknown> = {
    bannerId: bid,
    title: (banner.title || 'عرض خاص').trim().slice(0, 240),
    subtitle: (banner.subtitle || '').trim().slice(0, 1000),
    ctaText: (banner.ctaText || 'تسوق الآن').trim().slice(0, 80),
    accentColor: (banner.accentColor || '#D4AF37').trim().slice(0, 32),
    isActive: banner.isActive !== false,
  };
  if (banner.ctaUrl?.trim()) {
    baseFields.ctaUrl = banner.ctaUrl.trim().slice(0, 500);
  }
  if (banner.discountLabel?.trim()) {
    baseFields.discountLabel = banner.discountLabel.trim().slice(0, 120);
  }

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...baseFields,
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = existingSnap.data();
      await setDoc(ref, {
        ...baseFields,
        ownerUid: String(existingData.ownerUid || uid),
        createdAt: existingData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteBannerFromFirestore(bannerId: string): Promise<boolean> {
  const bid = sanitizeDocId(bannerId);
  const path = `banners/${bid}`;
  try {
    await deleteDoc(doc(db, 'banners', bid));
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribePublicStorefrontOverrides(
  onConfig: (config: Partial<StorefrontConfigFirestoreInput>) => void,
  onBanners: (banners: StorefrontBannerFirestoreInput[]) => void
): Unsubscribe {
  const unsubConfig = onSnapshot(
    doc(db, 'storefront', 'public'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onConfig({
        storeName: typeof d.storeName === 'string' ? d.storeName : undefined,
        storeTagline: typeof d.storeTagline === 'string' ? d.storeTagline : undefined,
        storeLogoUrl: typeof d.storeLogoUrl === 'string' ? d.storeLogoUrl : undefined,
        themePreset: typeof d.themePreset === 'string' ? d.themePreset : undefined,
        primaryGoldColor: typeof d.primaryGoldColor === 'string' ? d.primaryGoldColor : undefined,
        secondaryColor: typeof d.secondaryColor === 'string' ? d.secondaryColor : undefined,
        backgroundColor: typeof d.backgroundColor === 'string' ? d.backgroundColor : undefined,
        surfaceColor: typeof d.surfaceColor === 'string' ? d.surfaceColor : undefined,
        textColor: typeof d.textColor === 'string' ? d.textColor : undefined,
        themeFontFamily: typeof d.themeFontFamily === 'string' ? d.themeFontFamily : undefined,
        cardStyle: typeof d.cardStyle === 'string' ? d.cardStyle : undefined,
        buttonStyle: typeof d.buttonStyle === 'string' ? d.buttonStyle : undefined,
        productsSectionBgUrl:
          typeof d.productsSectionBgUrl === 'string' ? d.productsSectionBgUrl : undefined,
        productsSectionBgOpacity:
          typeof d.productsSectionBgOpacity === 'number' ? d.productsSectionBgOpacity : undefined,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'storefront/public');
      } catch {
        // Non-fatal fallback for offline storefront reads
      }
    }
  );

  const bannersQuery = query(collection(db, 'banners'), where('isActive', '==', true));
  const unsubBanners = onSnapshot(
    bannersQuery,
    (snap) => {
      if (snap.empty) return;
      const list: StorefrontBannerFirestoreInput[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.bannerId || docSnap.id),
          title: String(d.title || ''),
          subtitle: String(d.subtitle || ''),
          ctaText: String(d.ctaText || 'تسوق الآن'),
          ctaUrl: typeof d.ctaUrl === 'string' ? d.ctaUrl : undefined,
          discountLabel: typeof d.discountLabel === 'string' ? d.discountLabel : undefined,
          accentColor: String(d.accentColor || '#D4AF37'),
          isActive: d.isActive !== false,
        };
      });
      onBanners(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'banners');
      } catch {
        // Non-fatal fallback for offline storefront reads
      }
    }
  );

  return () => {
    unsubConfig();
    unsubBanners();
  };
}


