import { makeTownsBot } from '@towns-protocol/bot'
import { encodeFunctionData, parseUnits, keccak256, toHex } from 'viem'
import commands from './commands'
import { config } from './config'
import { publicClient, factoryAbi, escrowAbi, getEscrowCount, getDealInfo, getStatusName } from './blockchain'
import { createDeal, getDealById, updateDealStatus, getDealsByUser } from './database'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
    baseRpcUrl: config.rpcUrl,
    identity: {
        name: 'RoninOTC',
        description: 'Trustless OTC escrow on Base with USDC.',
        image: 'https://roninotc-app.vercel.app/logo.png',
        domain: 'roninotc-app.vercel.app',
    },
})

// ===== BOT COMMANDS =====

// Help command
bot.onSlashCommand('help', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**RoninOTC Bot - Available Commands:**\n\n' +
        '**Escrow Commands:**\n' +
        '• `/escrow_create @buyer "description" amount` - Create OTC deal\n' +
        '• `/escrow_info <address>` - Get deal details\n' +
        '• `/escrow_stats` - View statistics\n\n' +
        '**Other Commands:**\n' +
        '• `/help` - Show this help message\n' +
        '• `/time` - Get the current time\n\n' +
        '**Example:**\n' +
        '`/escrow_create @alice "Logo design work" 100`\n\n' +
        '**About:**\n' +
        'Trustless OTC escrow on Base with USDC.\n' +
        `Factory: ${config.factoryAddress}`,
    )
})

bot.onSlashCommand('time', async (handler, { channelId }) => {
    const currentTime = new Date().toLocaleString()
    await handler.sendMessage(channelId, `Current time: ${currentTime} ⏰`)
})

bot.onSlashCommand('app', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '🚀 **Open RoninOTC Dashboard**\nCreate, manage, and track your trustless escrow deals on Base.',
        {
            attachments: [
                {
                    type: 'miniapp',
                    url: config.appUrl,
                },
                {
                    type: 'image',
                    url: `${config.appUrl}/logo.png`,
                    alt: 'RoninOTC Logo',
                }
            ]
        }
    )
})

bot.onSlashCommand('app_only', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '🌐 Open RoninOTC Dashboard (No Image Debug)',
        {
            attachments: [
                {
                    type: 'miniapp',
                    url: config.appUrl,
                }
            ]
        }
    )
})

// /escrow_create - WITH @MENTION PARSING
bot.onSlashCommand('escrow_create', async (handler, context) => {
    console.log('=== ESCROW_CREATE called ===')
    console.log('Context keys:', Object.keys(context))
    console.log('Message:', context.args.join(' '))
    console.log('Mentions:', context.mentions)

    const { channelId, args, mentions, userId, spaceId } = context

    try {
        if (!mentions || mentions.length === 0) {
            await handler.sendMessage(channelId, '❌ Please mention the buyer:\n\n`/escrow_create @buyer "description" amount`\n\n**Example:**\n`/escrow_create @alice "Logo design" 100`')
            return
        }

        const buyerAddress = mentions[0].userId
        const input = args.join(' ')
        const descMatch = input.match(/"([^"]+)"/)
        const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:USDC)?$/i)

        if (!descMatch || !amountMatch) {
            await handler.sendMessage(
                channelId,
                '❌ Invalid format. Use:\n\n`/escrow_create @buyer "description" amount`\n\n**Example:**\n`/escrow_create @alice "Logo design" 100`'
            )
            return
        }

        const description = descMatch[1]
        const amount = parseFloat(amountMatch[1])

        if (amount <= 0) {
            await handler.sendMessage(channelId, '❌ Amount must be greater than 0')
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

        const miniAppUrl = `${config.appUrl}/deal/${dealId}`

        await handler.sendMessage(
            channelId,
            `**🤝 OTC Deal Created**\n\n` +
            `**Deal ID:** \`${dealId}\`\n` +
            `**Seller:** <@${userId}>\n` +
            `**Buyer:** <@${buyerAddress}>\n` +
            `**Amount:** ${amount} USDC\n` +
            `**Description:** ${description}\n` +
            `**Deadline:** 48 hours\n` +
            `**Status:** ⏳ Draft (not on-chain yet)`,
            {
                attachments: [
                    {
                        type: 'link',
                        url: miniAppUrl,
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
bot.onSlashCommand('escrow_info', async (handler, context) => {
    const { channelId, args } = context

    try {
        const address = args[0]
        if (!address) {
            await handler.sendMessage(channelId, '❌ Please provide escrow address')
            return
        }

        if (!address.startsWith('0x') || address.length !== 42) {
            await handler.sendMessage(channelId, '❌ Invalid escrow address')
            return
        }

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