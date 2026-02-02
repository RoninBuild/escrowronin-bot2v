import { makeTownsBot } from '@towns-protocol/bot'
import { encodeFunctionData, parseUnits, keccak256, toHex } from 'viem'
import commands from './commands'
import { config } from './config'
import { publicClient, factoryAbi, escrowAbi, getEscrowCount, getDealInfo, getStatusName } from './blockchain'
import { createDeal, getDealById, updateDealStatus, getDealsByUser } from './database'
import { serveStatic } from 'hono/bun'
import fs from 'node:fs/promises'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
    baseRpcUrl: config.rpcUrl,
    identity: {
        name: 'RoninOTC',
        description: 'Trustless OTC escrow on Base with USDC.',
        image: 'https://roninotc-app.vercel.app/logo.png',
        domain: new URL(process.env.BASE_URL || 'https://roninotc-app.vercel.app').hostname,
    },
})

// ===== BOT COMMANDS =====

// Help command
bot.onSlashCommand('help', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**RoninOTC Bot - Available Commands:**\n\n' +
        '🚀 `/app` - Launch dashboard\n' +
        '🤝 `/escrow_create @buyer "description" amount` - Create OTC deal\n' +
        '📊 `/escrow_info <address>` - Get deal details\n' +
        '📈 `/escrow_stats` - View global statistics\n' +
        '❓ `/help` - Show this help message\n\n' +
        '**Example:**\n' +
        '`/escrow_create @alice "Logo design work" 100`\n\n' +
        '**About:**\n' +
        'Trustless OTC escrow on Base with USDC.\n' +
        `Factory: ${config.factoryAddress}`,
    )
})


bot.onSlashCommand('app', async (handler, { channelId }) => {
    const miniappUrl = `${process.env.BASE_URL || config.appUrl}/index.html`
    await handler.sendMessage(
        channelId,
        '🚀 **Open RoninOTC Dashboard**\nCreate, manage, and track your trustless escrow deals on Base.',
        {
            attachments: [
                {
                    type: 'miniapp',
                    url: miniappUrl,
                },
                {
                    type: 'image',
                    url: `https://roninotc-app.vercel.app/logo.png`,
                    alt: 'RoninOTC Logo',
                }
            ]
        }
    )
})


// Helper to verify/resolve address
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'
import { createPublicClient, http, isAddress } from 'viem'

const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http()
})

async function resolveAddress(input: string): Promise<string | null> {
    // 1. Check if it's a valid address
    if (isAddress(input)) return input

    // 2. Check if it's an ENS
    if (input.includes('.')) {
        try {
            const address = await mainnetClient.getEnsAddress({
                name: normalize(input),
            })
            return address
        } catch (e) {
            console.error('ENS resolution error:', e)
            return null
        }
    }

    return null
}

// /escrow_create
bot.onSlashCommand('escrow_create', async (handler, context) => {
    console.log('=== ESCROW_CREATE called ===')

    const { channelId, args, mentions, userId, spaceId } = context

    try {
        // Parsing logic: <target> <description...> <amount>
        if (args.length < 3) {
            await handler.sendMessage(channelId,
                '❌ Invalid format. Use:\n\n' +
                '`/escrow_create <buyer> <description> <amount>`\n\n' +
                '**Examples:**\n' +
                '`/escrow_create @alice Logo design 100`\n' +
                '`/escrow_create 0x123...abc Contract work 500`\n' +
                '`/escrow_create vitalik.eth Audit services 1000`'
            )
            return
        }

        const targetInput = args[0]
        const amountInput = args[args.length - 1]
        const description = args.slice(1, -1).join(' ')

        // 1. Resolve Buyer Address
        let buyerAddress: string | null = null

        // Case A: Mention
        if (mentions && mentions.length > 0) {
            // Check if the FIRST argument matches a mention
            // Usually mentions come as separate objects, but user might type @alice. 
            // Logic: If args[0] looks like a mention OR mentions array exists, prioritize explicit mention object if it matches position?
            // Actually, if user types `@alice`, `args[0]` might be empty string or `<@id>`.
            // Towns SDK parser puts mentions in `mentions` array.
            // We'll trust `mentions[0]` if `args[0]` looks like a mention placeholder OR if we assume the first param IS the buyer.
            // But what if user types `/escrow_create @alice ...`? `mentions[0]` is reliable.
            // Wait, if user types plain address, `mentions` is empty.
            // We should check `mentions` first.
            buyerAddress = mentions[0].userId
        }

        // Case B: Direct Address or ENS (if not a mention)
        if (!buyerAddress) {
            buyerAddress = await resolveAddress(targetInput)
        } else {
            // Double check: if args[0] is NOT a mention but we have a mention elsewhere? 
            // Simple rule: If `args[0]` corresponds to the mention, use it. 
            // If `mentions` has items, use the first one.
            // But if `args[0]` is "0x...", `mentions` should be empty.
        }

        if (!buyerAddress) {
            await handler.sendMessage(channelId, `❌ Could not resolve buyer address: ${targetInput}`)
            return
        }

        // 2. Parse Amount
        const amount = parseFloat(amountInput.replace(/USDC/i, ''))

        if (isNaN(amount) || amount <= 0) {
            await handler.sendMessage(channelId, '❌ Invalid amount. Must be a number > 0')
            return
        }

        if (!description) {
            await handler.sendMessage(channelId, '❌ Description is required')
            return
        }

        const dealId = `DEAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const deadline = Math.floor(Date.now() / 1000) + (48 * 3600)

        const deal = createDeal({
            deal_id: dealId,
            seller_address: userId,
            buyer_address: buyerAddress,
            amount: amount.toString(),
            token: 'USDC',
            description,
            deadline,
            status: 'draft',
            town_id: spaceId || '',
            channel_id: channelId,
        })

        console.log('✅ Deal created:', deal)

        const miniAppUrl = `${process.env.BASE_URL || config.appUrl}/index.html?dealId=${dealId}`

        await handler.sendMessage(
            channelId,
            `**🤝 OTC Deal Created**\n\n` +
            `**Deal ID:** \`${dealId}\`\n` +
            `**Seller:** <@${userId}>\n` +
            `**Buyer:** ${targetInput.startsWith('0x') ? `\`${targetInput.slice(0, 6)}...${targetInput.slice(-4)}\`` : (targetInput.includes('.') ? targetInput : `<@${buyerAddress}>`)}\n` +
            `**Amount:** ${amount} USDC\n` +
            `**Description:** ${description}\n` +
            `**Deadline:** 48 hours\n` +
            `**Status:** ⏳ Draft (not on-chain yet)`,
            {
                attachments: [
                    {
                        type: 'miniapp',
                        url: miniAppUrl,
                    },
                    {
                        type: 'image',
                        url: `https://roninotc-app.vercel.app/logo.png`,
                        alt: 'RoninOTC Deal',
                    }
                ]
            }
        )

    } catch (error) {
        console.error('Error creating deal:', error)
        await handler.sendMessage(
            channelId,
            `❌ Failed to create deal: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
    }
})


// /escrow_info
bot.onSlashCommand('escrow_info', async (handler, { channelId, args, mentions }) => {

    try {
        const input = args[0]
        if (!input) {
            await handler.sendMessage(channelId, '❌ Please provide escrow address, ENS or @mention')
            return
        }

        // Try to resolve (Mentions/ENS)
        let address = input
        if (mentions && mentions.length > 0) {
            address = mentions[0].userId
        } else {
            const resolved = await resolveAddress(input)
            if (resolved) address = resolved
        }

        if (!isAddress(address)) {
            await handler.sendMessage(channelId, '❌ Invalid address or resolution failed')
            return
        }

        // Check if it's likely a contract address or a user address
        // For now, assume if it passes getDealInfo, it's a contract.

        const info = await getDealInfo(address as `0x${string}`)
        const amountUsdc = Number(info.amount) / 1_000_000
        const deadlineDate = new Date(Number(info.deadline) * 1000)
        const status = getStatusName(info.status)
        const statusEmoji = {
            'CREATED': '⏳️',
            'FUNDED': '✅',
            'RELEASED': '💸',
            'REFUNDED': '↩️',
            'DISPUTED': '⚠️',
            'RESOLVED': '✔️',
        }[status] || '❓'

        await handler.sendMessage(
            channelId,
            `**📊 Escrow Deal Information**\n\n` +
            `**Status:** ${statusEmoji} ${status}\n` +
            `**Buyer:** ${info.buyer}\n` +
            `**Seller:** ${info.seller}\n` +
            `**Amount:** ${amountUsdc} USDC\n` +
            `**Deadline:** ${deadlineDate.toLocaleString()}\n` +
            `**Contract:** ${address}\n\n` +
            `[View on BaseScan](${config.explorerUrl}/address/${address})`,
        )

    } catch (error) {
        console.error('Error fetching escrow info:', error)
        await handler.sendMessage(
            channelId,
            `❌ Failed to fetch escrow info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
    }
})

// /escrow_stats
bot.onSlashCommand('escrow_stats', async (handler, context) => {
    const { channelId } = context

    try {
        const count = await getEscrowCount()

        await handler.sendMessage(
            channelId,
            `**📊 RoninOTC Statistics**\n\n` +
            `**Total Deals Created:** ${count}\n` +
            `**Factory Address:** ${config.factoryAddress}\n` +
            `**Network:** Base Mainnet\n\n` +
            `[View Factory on BaseScan](${config.explorerUrl}/address/${config.factoryAddress})`,
        )

    } catch (error) {
        console.error('Error fetching stats:', error)
        await handler.sendMessage(
            channelId,
            `❌ Failed to fetch stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
    }
})

// Message handlers
bot.onMessage(async (handler, { message, channelId, eventId, createdAt }) => {
    if (message.includes('hello')) {
        await handler.sendMessage(channelId, 'Hello there! 👋')
        return
    }
    if (message.includes('ping')) {
        const now = new Date()
        await handler.sendMessage(channelId, `Pong! 🏓 ${now.getTime() - createdAt.getTime()}ms`)
        return
    }
    if (message.includes('react')) {
        await handler.sendReaction(channelId, eventId, '👍')
        return
    }
})

bot.onReaction(async (handler, { reaction, channelId }) => {
    if (reaction === '👋') {
        await handler.sendMessage(channelId, 'I saw your wave! 👋')
    }
})

// Startup logs
console.log(`🤝 RoninOTC bot started on port ${config.port}`)
console.log(`🏭 Factory: ${config.factoryAddress}`)
console.log(`🪙 USDC: ${config.usdcAddress}`)

const app = bot.start()

// Helper to serve index.html with injected BASE_URL
app.get('/index.html', async (c) => {
    const baseUrl = process.env.BASE_URL || `http://localhost:${config.port}`
    try {
        let html = await fs.readFile('./public/index.html', 'utf-8')
        html = html.replace(/__BASE_URL__/g, baseUrl)
        return c.html(html)
    } catch (e) {
        return c.text('index.html not found', 404)
    }
})

// Serve static files from public folder (for other assets)
app.use('/*', serveStatic({ root: './public' }))

// ===== CORS MIDDLEWARE =====
app.use('*', async (c, next) => {
    await next()
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
})

// ===== API ENDPOINTS (after bot.start) =====

app.get('/api/deal/:dealId', (c) => {
    try {
        const dealId = c.req.param('dealId')
        const deal = getDealById(dealId)

        if (!deal) {
            return c.json({ error: 'Deal not found' }, 404)
        }

        return c.json({ success: true, deal })
    } catch (error) {
        console.error('API error:', error)
        return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
    }
})

app.get('/api/deals/user/:address', (c) => {
    try {
        const address = c.req.param('address')
        const role = c.req.query('role') as 'buyer' | 'seller' || 'buyer'
        const deals = getDealsByUser(address, role)

        return c.json({ success: true, deals, count: deals.length })
    } catch (error) {
        console.error('API error:', error)
        return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
    }
})

app.post('/api/deal/:dealId/status', async (c) => {
    try {
        const dealId = c.req.param('dealId')
        const body = await c.req.json()
        const { status, escrowAddress } = body

        if (!status) {
            return c.json({ error: 'Status is required' }, 400)
        }

        updateDealStatus(dealId, status, escrowAddress)
        const updatedDeal = getDealById(dealId)

        return c.json({ success: true, deal: updatedDeal })
    } catch (error) {
        console.error('API error:', error)
        return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
    }
})

app.get('/api/health', (c) => {
    return c.json({
        status: 'ok',
        timestamp: Date.now(),
        service: 'RoninOTC API'
    })
})

console.log(`📡 API ready at /api/*`)

export default app