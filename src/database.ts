import { Database } from 'bun:sqlite'

const db = new Database('roninotc.db')

// Create deals table
db.run(`
  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id TEXT UNIQUE NOT NULL,
    seller_address TEXT NOT NULL,
    buyer_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    token TEXT NOT NULL,
    description TEXT NOT NULL,
    deadline INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    escrow_address TEXT,
    town_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

db.run(`CREATE INDEX IF NOT EXISTS idx_deal_id ON deals(deal_id)`)
db.run(`CREATE INDEX IF NOT EXISTS idx_seller ON deals(seller_address)`)
db.run(`CREATE INDEX IF NOT EXISTS idx_buyer ON deals(buyer_address)`)
db.run(`CREATE INDEX IF NOT EXISTS idx_status ON deals(status)`)

export interface Deal {
  id?: number
  deal_id: string
  seller_address: string
  buyer_address: string
  amount: string
  token: string
  description: string
  deadline: number
  status: 'draft' | 'created' | 'funded' | 'released' | 'refunded' | 'disputed' | 'resolved'
  escrow_address?: string
  town_id: string
  channel_id: string
  message_id?: string
  created_at: number
  updated_at: number
}

export function createDeal(deal: Omit<Deal, 'id' | 'created_at' | 'updated_at'>): Deal {
  const now = Date.now()
  const stmt = db.prepare(`
    INSERT INTO deals (
      deal_id, seller_address, buyer_address, amount, token,
      description, deadline, status, escrow_address, town_id,
      channel_id, message_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    deal.deal_id,
    deal.seller_address,
    deal.buyer_address,
    deal.amount,
    deal.token,
    deal.description,
    deal.deadline,
    deal.status,
    deal.escrow_address ?? null,
    deal.town_id,
    deal.channel_id,
    deal.message_id ?? null,
    now,
    now
  )

  return {
    ...deal,
    id: db.query('SELECT last_insert_rowid() as id').get() as number,
    created_at: now,
    updated_at: now
  }
}

export function getDealById(dealId: string): Deal | null {
  const stmt = db.query('SELECT * FROM deals WHERE deal_id = ?')
  return stmt.get(dealId) as Deal | null
}

export function updateDealStatus(dealId: string, status: Deal['status'], escrowAddress?: string) {
  const stmt = db.prepare(`
    UPDATE deals
    SET status = ?, escrow_address = ?, updated_at = ?
    WHERE deal_id = ?
  `)
  return stmt.run(status, escrowAddress ?? null, Date.now(), dealId)
}

export function getDealsByUser(userAddress: string, role: 'buyer' | 'seller'): Deal[] {
  const field = role === 'buyer' ? 'buyer_address' : 'seller_address'
  const stmt = db.query(`SELECT * FROM deals WHERE ${field} = ? ORDER BY created_at DESC LIMIT 20`)
  return stmt.all(userAddress) as Deal[]
}

export function getActiveDeals(): Deal[] {
  // Poll checks for deals that are created/funded but not final.
  // Also check drafts if we want to auto-detect creation? No, on-chain check needs address.
  // So only deals with escrow_address.
  // Ignored statuses: released, refunded, resolved.
  const stmt = db.query("SELECT * FROM deals WHERE status NOT IN ('released', 'refunded', 'resolved') AND escrow_address IS NOT NULL")
  return stmt.all() as Deal[]
}

export default db