import { makeTownsBot } from '@towns-protocol/bot'
import { encodeFunctionData, parseUnits, keccak256, toHex } from 'viem'
import commands from './commands'
import { config } from './config'
import { publicClient, factoryAbi, escrowAbi, getEscrowCount, getDealInfo, getStatusName } from './blockchain'
import { createDeal, getDealById, updateDealStatus } from './database'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

// Help command (updated with escrow info)
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

// ===== ESCROW COMMANDS =====

// /escrow_create - WITH @MENTION PARSING
bot.onSlashCommand('escrow_create', async (handler, context) => {
    console.log('=== ESCROW_CREATE called ===')
    console.log('Context keys:', Object.keys(context))
    console.log('Message:', context.message)
    console.log('Mentions:', context.mentions)

    const { channelId, message, mentions, userId, spaceId } = context

    try {
        // Parse command: /escrow_create @buyer description amount
        // Example: /escrow_create @alice "Logo design" 100

        if (!mentions || mentions.length === 0) {
            await handler.sendMessage(channelId, '❌ Please mention the buyer:\n\n`/escrow_create @buyer "description" amount`\n\n**Example:**\n`/escrow_create @alice "Logo design" 100`')
            return
        }

        const buyerAddress = mentions[0] // First mention is buyer

        // Parse message to extract description and amount
        // Remove command and mention, split by quotes
        const parts = message.replace('/escrow_create', '').trim()

        // Extract description (in quotes) and amount
        const descMatch = parts.match(/"([^"]+)"/)
        const amountMatch = parts.match(/(\d+(?:\.\d+)?)\s*(?:USDC)?$/i)

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

        // Generate unique deal ID
        const dealId = `DEAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        // Calculate deadline (48 hours default)
        const deadline = Math.floor(Date.now() / 1000) + (48 * 3600)

        // Create deal in database
        const deal = createDeal({
            deal_id: dealId,
            seller_address: userId, // Creator is seller
            buyer_address: buyerAddress,
            amount: amount.toString(),
            token: 'USDC',
            description,
            deadline,
            status: 'draft',
            town_id: spaceId,
            channel_id: channelId,
        })

        console.log('✅ Deal created:', deal)

        // Generate mini-app link
        const miniAppUrl = `https://roninotc.vercel.app/deal/${dealId}`

        // Send deal card
        await handler.sendMessage(
            channelId,
            `**🤝 OTC Deal Created**\n\n` +
            `**Deal ID:** \`${dealId}\`\n` +
            `**Seller:** <@${userId}>\n` +
            `**Buyer:** <@${buyerAddress}>\n` +
            `**Amount:** ${amount} USDC\n` +
            `**Description:** ${description}\n` +
            `**Deadline:** 48 hours\n` +
            `**Status:** ⏳ Draft (not on-chain yet)\n\n` +
            `🔗 **[Open Deal in Mini App](${miniAppUrl})**\n\n` +
            `_Buyer & Seller: Click the link to proceed with escrow creation on Base._`
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
    console.log('=== ESCROW_INFO called ===')
    console.log('Context keys:', Object.keys(context))
    console.log('Options:', context.options)

    const { channelId, options } = context

    try {
        if (!options || !options.address) {
            await handler.sendMessage(channelId, `❌ No address provided. Available keys: ${Object.keys(context).join(', ')}`)
            return
        }

        const address = options.address as string

        if (!address.startsWith('0x') || address.length !== 42) {
            await handler.sendMessage(channelId, '❌ Invalid escrow address')
            return
        }

        const info = await getDealInfo(address as `0x${string}`)

        // Format amount (USDC has 6 decimals)
        const amountUsdc = Number(info.amount) / 1_000_000

        // Format deadline
        const deadlineDate = new Date(Number(info.deadline) * 1000)

        // Status
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
    console.log('=== ESCROW_STATS called ===')
    console.log('Context keys:', Object.keys(context))

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

// Original message handlers
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
export default app