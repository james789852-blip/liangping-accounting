export type PermissionProfile = {
  role?: string | null
  is_hq?: boolean | null
  can_manage_users?: boolean | null
  can_manage_stores?: boolean | null
  can_manage_store_settings?: boolean | null
  can_manage_ck_settings?: boolean | null
  can_manage_items?: boolean | null
  can_manage_store_items?: boolean | null
  can_manage_ck_items?: boolean | null
  can_manage_store_receipts?: boolean | null
  can_manage_ck_receipts?: boolean | null
  can_manage_ck_prices?: boolean | null
  can_review_closings?: boolean | null
  can_export_reports?: boolean | null
}

const MANAGEMENT_ROLES = ['經理', '總監', '老闆']
export const STORE_ROLES = ['店長', '副店長', '小幫手', '廠長', '副廠長']

export function isBoss(profile?: PermissionProfile | null) {
  return profile?.role === '老闆'
}

export function hasManagementRole(profile?: PermissionProfile | null) {
  return MANAGEMENT_ROLES.includes(profile?.role ?? '')
}

export function isStoreRole(role?: string | null) {
  return STORE_ROLES.includes(role ?? '')
}

export function canManageUsers(profile?: PermissionProfile | null) {
  return isBoss(profile) || profile?.can_manage_users === true
}

export function canManageStores(profile?: PermissionProfile | null) {
  return canManageStoreSettings(profile) || canManageCKSettings(profile)
}

export function canManageItems(profile?: PermissionProfile | null) {
  return (
    canManageStoreItems(profile) ||
    canManageCKItems(profile) ||
    canManageStoreReceipts(profile) ||
    canManageCKReceipts(profile)
  )
}

function hasExplicitFlag(profile: PermissionProfile | null | undefined, key: keyof PermissionProfile) {
  return !!profile && Object.prototype.hasOwnProperty.call(profile, key)
}

function hasSplitPermission(
  profile: PermissionProfile | null | undefined,
  splitKey: keyof PermissionProfile,
  legacyKey: keyof PermissionProfile,
) {
  return (
    hasManagementRole(profile) ||
    profile?.[splitKey] === true ||
    (!hasExplicitFlag(profile, splitKey) && profile?.[legacyKey] === true)
  )
}

export function canManageStoreSettings(profile?: PermissionProfile | null) {
  return hasSplitPermission(profile, 'can_manage_store_settings', 'can_manage_stores')
}

export function canManageCKSettings(profile?: PermissionProfile | null) {
  return hasSplitPermission(profile, 'can_manage_ck_settings', 'can_manage_stores')
}

export function canManageStoreItems(profile?: PermissionProfile | null) {
  return hasSplitPermission(profile, 'can_manage_store_items', 'can_manage_items')
}

export function canManageCKItems(profile?: PermissionProfile | null) {
  return hasSplitPermission(profile, 'can_manage_ck_items', 'can_manage_items')
}

export function canManageStoreReceipts(profile?: PermissionProfile | null) {
  return hasSplitPermission(profile, 'can_manage_store_receipts', 'can_manage_items')
}

export function canManageCKReceipts(profile?: PermissionProfile | null) {
  return hasSplitPermission(profile, 'can_manage_ck_receipts', 'can_manage_items')
}

export function canManageCKPrices(profile?: PermissionProfile | null) {
  return hasManagementRole(profile) || profile?.can_manage_ck_prices === true
}

export function canReviewClosings(profile?: PermissionProfile | null) {
  return hasManagementRole(profile) || profile?.can_review_closings === true
}

export function canExportReports(profile?: PermissionProfile | null) {
  return hasManagementRole(profile) || profile?.can_export_reports === true
}

export function hasAnyHQPermission(profile?: PermissionProfile | null) {
  return !!(
    profile?.is_hq ||
    isBoss(profile) ||
    canManageUsers(profile) ||
    canManageStores(profile) ||
    canManageItems(profile) ||
    canManageCKPrices(profile) ||
    canReviewClosings(profile) ||
    canExportReports(profile)
  )
}
