

export function validateDealArgs(ctx: CommandContext) {
    const [seller, amount] = ctx.args
    if (!isAddress(seller)) throw new Error('Invalid address')
    if (Number(amount) <= 0) throw new Error('Amount must be > 0')
    return { seller, amount: parseUnits(amount, 6) }
}

