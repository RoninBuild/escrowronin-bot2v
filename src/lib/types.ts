export type DealStatus = 'draft' | 'created' | 'funded' | 'released' | 'refunded' | 'disputed' | 'resolved'

export interface Deal {
  id?: number
  deal_id: string
  seller_address: string
  buyer_address: string
  amount: string
  token: string
  description: string
  deadline: number
  status: DealStatus
  escrow_address?: string
  town_id: string
  channel_id: string
  message_id?: string
  created_at: number
  updated_at: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}