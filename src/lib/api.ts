import { config } from './config'
import type { Deal } from './types'

export async function getDeal(dealId: string): Promise<Deal | null> {
  try {
    const res = await fetch(`${config.botApiUrl}/api/deal/${dealId}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.deal || null
  } catch (error) {
    console.error('Failed to fetch deal:', error)
    return null
  }
}

export async function getUserDeals(address: string, role: 'buyer' | 'seller' = 'buyer'): Promise<Deal[]> {
  try {
    const res = await fetch(`${config.botApiUrl}/api/deals/user/${address}?role=${role}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.deals || []
  } catch (error) {
    console.error('Failed to fetch user deals:', error)
    return []
  }
}

export async function updateDealStatus(dealId: string, status: string, escrowAddress?: string) {
  try {
    const res = await fetch(`${config.botApiUrl}/api/deal/${dealId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, escrowAddress })
    })
    if (!res.ok) throw new Error('Failed to update status')
    return await res.json()
  } catch (error) {
    console.error('Failed to update deal status:', error)
    throw error
  }
}