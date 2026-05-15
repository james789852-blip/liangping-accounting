export type Role = '店長' | '副店長' | '助理' | '顧問' | '經理' | '總監'
export type StoreMode = 'ichef' | 'handwrite' | 'mixed'
export type ClosingStatus = 'draft' | 'submitted' | 'verified' | 'disputed'

export interface Store {
  id: string
  name: string
  mode: StoreMode
  uber_enabled: boolean
  uber_accounts: string[]
  panda_enabled: boolean
  panda_rate: number
  online_enabled: boolean
  online_rate: number
  twpay_enabled: boolean
  twpay_rate: number
  petty_cash: number
}

export interface CKPrice {
  id: string
  item_name: string
  unit_price: number
  excel_column: string
}

export interface UserProfile {
  user_id: string
  name: string
  role: Role
  store_ids: string[]
}
