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

  const baseFields: Record<string, unknown> = {
    ownerUid: uid,
    productId: pid,
    name: (product.name || 'منتج جديد').trim().slice(0, 240) || 'منتج جديد',
    category: (product.category || 'دبات تلوث البنزين').trim().slice(0, 120) || 'دبات تلوث البنزين',
    priceSar: Math.max(0, Math.min(10000000, Number(product.priceSar) || 0)),
    description: (product.description || '').trim().slice(0, 5000),
    images: sanitizedImages,
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
      await updateDoc(personalRef, {
        ...baseFields,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, personalPath);
  }

  let catalogPublished = false;
  if (user.email === 'uuuo333@gmail.com' || user.email === 'dbattloth.221@gmail.com') {
    const catalogPath = `products/${pid}`;
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
        await updateDoc(catalogRef, {
          ...baseFields,
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

