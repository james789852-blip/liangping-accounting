export type PermissionProfile = {
  role?: string | null
  is_hq?: boolean | null
  can_manage_users?: boolean | null
  can_manage_stores?: boolean | null
  can_manage_items?: boolean | null
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
  return hasManagementRole(profile) || profile?.can_manage_stores === true
}

export function canManageItems(profile?: PermissionProfile | null) {
  return hasManagementRole(profile) || profile?.can_manage_items === true
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
    canReviewClosings(profile) ||
    canExportReports(profile)
  )
}

