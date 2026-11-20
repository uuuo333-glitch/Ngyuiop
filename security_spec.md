# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny Catch-All**: All unspecified paths under `/databases/{database}/documents` are strictly denied for read and write.
2. **Email Verification Gate**: Standard user writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Master Gate & Identity Integrity**: Every subcollection (`/private/{docId}`, `/wishlists/{productId}`, `/driveBackups/{backupId}`) verifies that the parent `/users/{userId}` document exists and that `request.auth.uid == userId` (or `isAdmin()` for administrative review).
4. **PII Split Isolation**: Non-PII display data resides in `/users/{userId}`, while PII (`email`, `phone`, `nationalAddress`, `address`) is isolated in `/users/{userId}/private/info` and restricted strictly to the owner or verified admin.
5. **Immutable Ownership & Timestamps**: `uid` / `userId` / `ownerUid` and `createdAt` cannot be modified after creation; `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
6. **Terminal State Locking**: In `driveBackups`, once `status == 'archived'`, non-admin users cannot unarchive or mutate the record.
7. **Admin Privilege Prevention**: Users cannot write to `/admins/{userId}` to elevate themselves; only an existing verified admin (including the bootstrapped support email `dbattloth.221@gmail.com` with `email_verified == true`) can manage admin grants.
8. **Storefront Identity, Theme & Banners Governance**: `/storefront/public` and active `/banners/{bannerId}` (`isActive == true`) are intentionally public-readable for storefront rendering, while all creates/updates/deletes strictly require `isAdmin()`, bounded string sizes, `hasAll`/`hasOnly` field validation, and `request.time` timestamps.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Profile Create**: Anonymous caller tries to create `/users/u1`. Expected: `PERMISSION_DENIED`.
2. **Unverified Email Write**: Signed-in user with `email_verified: false` tries to create `/users/u1`. Expected: `PERMISSION_DENIED`.
3. **Cross-User Spoofed UID**: User `u1` tries to create `/users/u1` with `uid: "u2"`. Expected: `PERMISSION_DENIED`.
4. **Shadow Field Injection (UserProfile)**: User `u1` adds ghost field `isAdmin: true` in `/users/u1`. Expected: `PERMISSION_DENIED`.
5. **ID Poisoning**: User `u1` tries to create `/users/u1/wishlists/invalid$id*!`. Expected: `PERMISSION_DENIED`.
6. **Oversized String Exhaustion**: User `u1` writes a 1KB string to `displayName` (limit 120). Expected: `PERMISSION_DENIED`.
7. **Client Timestamp Forgery**: User `u1` passes a past client `Date` for `createdAt` instead of `serverTimestamp()`. Expected: `PERMISSION_DENIED`.
8. **Cross-User PII Read**: User `u2` tries to `get` `/users/u1/private/info`. Expected: `PERMISSION_DENIED`.
9. **Orphan Subcollection Write**: User `u1` tries to create `/users/u1/driveBackups/b1` when `/users/u1` does not exist. Expected: `PERMISSION_DENIED`.
10. **Immutable Field Tampering**: User `u1` tries to update `ownerUid` or `createdAt` on `/users/u1/driveBackups/b1`. Expected: `PERMISSION_DENIED`.
11. **Terminal State Bypass**: User `u1` tries to update an `'archived'` backup record back to `'active'`. Expected: `PERMISSION_DENIED`.
12. **Self-Admin Escalation**: User `u1` tries to write `/admins/u1` with `role: 'admin'`. Expected: `PERMISSION_DENIED`.
