

export function validateDealArgs(ctx: CommandContext) {
    const [seller, amount] = ctx.args
    if (!isAddress(seller)) throw new Error('Invalid address')
    if (Number(amount) <= 0) throw new Error('Amount must be > 0')
    return { seller, amount: parseUnits(amount, 6) }
}



const rateLimit = new Map<string, number>()
export function checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const last = rateLimit.get(userId) || 0
    if (now - last < 1000) return false
    rateLimit.set(userId, now)
    return true
}

