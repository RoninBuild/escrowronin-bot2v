import type { BotCommand } from '@towns-protocol/bot'

const commands = [
    {
        name: 'help',
        description: 'Get help with bot commands',
    },
    {
        name: 'app',
        description: 'Launch the RoninOTC trustless escrow dashboard.'
    },
    {
        name: 'escrow_stats',
        description: 'Get escrow statistics',
    },
    {
        name: 'escrow_create',
        description: 'Create a new escrow deal',
        options: [
            {
                name: 'seller',
                description: 'Seller (use @mention)',
                type: 3,
                required: true,
            },
            {
                name: 'buyer',
                description: 'Buyer (use @mention)',
                type: 3,
                required: true,
            },
            {
                name: 'description',
                description: 'Deal description',
                type: 3,
                required: true,
            },
            {
                name: 'deadline',
                description: 'Deadline (e.g. 48h, 2d, 1w)',
                type: 3,
                required: true,
            },
            {
                name: 'amount',
                description: 'Amount in USDC',
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: 'escrow_info',
        description: 'Get deal information',
        options: [
            {
                name: 'address',
                description: 'Escrow contract address',
                type: 3,
                required: true,
            },
        ],
    },
] as const

export default commands as any

export const commands = {
    '/deal': async (ctx) => { /* OTC escrow creation */ },
    '/status': async (ctx) => { /* check deal status */ },
    '/dispute': async (ctx) => { /* open dispute */ },
    '/release': async (ctx) => { /* release funds */ },
    '/help': async (ctx) => { /* command list */ },
}



'/deal': async (ctx) => {
    const [seller, amount] = ctx.args
    if (!seller || !amount) return ctx.reply('Usage: /deal <seller> <amount>')
    const tx = await createEscrow(seller, parseUnits(amount, 6))
    return ctx.reply(`Escrow created: ${tx}`)
},



import { isAddress } from 'viem'

function validateAddress(addr: string): boolean {
    return isAddress(addr) && addr.startsWith('0x')
}



'/status': async (ctx) => {
    const [id] = ctx.args
    const deal = await getDealInfo(Number(id))
    return ctx.reply(`Deal ${id}: ${deal.status}, ${deal.amount} USDC`)
},



'/dispute': async (ctx) => {
    const [id] = ctx.args
    const { writeContract } = await getSmartAccount(ctx.userId)
    const tx = await writeContract({ address: deal.addr, abi: escrowAbi, functionName: 'openDispute' })
    return ctx.reply(`Dispute opened: ${tx}`)
},



'/release': async (ctx) => {
    const [id] = ctx.args
    const deal = await getDealById(Number(id))
    if (deal.seller !== ctx.userId) return ctx.reply('Only seller can release')
    return ctx.reply(`Funds released to buyer`)
},



'/mydeals': async (ctx) => {
    const deals = await getDealsByUser(ctx.userId)
    return ctx.reply(deals.map(d => `${d.id}: ${d.status} ${d.amount} USDC`).join('\n'))
},



'/arbitrate': async (ctx) => {
    const [id, winner] = ctx.args
    const payToSeller = winner === 'seller'
    const tx = await writeContract({ functionName: 'resolve', args: [payToSeller] })
    return ctx.reply(`Resolved in favor of ${winner}: ${tx}`)
},

