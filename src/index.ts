import { makeTownsBot } from '@towns-protocol/bot'
import { encodeFunctionData, parseUnits, keccak256, toHex } from 'viem'
import commands from './commands'
import { config } from './config'
import { publicClient, factoryAbi, escrowAbi, getEscrowCount, getDealInfo, getStatusName } from './blockchain'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

// Metadata endpoint for bot discovery


// Help command (updated with escrow info)
bot.onSlashCommand('help', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**EscrowRonin Bot - Available Commands:**\n\n' +
            '**Escrow Commands:**\n' +
            '• `/escrow create` - Create new escrow deal\n' +
            '• `/escrow info <address>` - Get deal details\n' +
            '• `/escrow stats` - View statistics\n\n' +
            '**Other Commands:**\n' +
            '• `/help` - Show this help message\n' +
            '• `/time` - Get the current time\n\n' +
            '**Message Triggers:**\n' +
            "• Mention me - I'll respond\n" +
            "• React with 👋 - I'll wave back\n" +
            '• Say "hello" - I\'ll greet you back\n' +
            '• Say "ping" - I\'ll show latency\n' +
            '• Say "react" - I\'ll add a reaction\n\n' +
            '**About:**\n' +
            'Trustless peer-to-peer escrow on Base.\n' +
            `Factory: ${config.factoryAddress}`,
    )
})

bot.onSlashCommand('time', async (handler, { channelId }) => {
    const currentTime = new Date().toLocaleString()
    await handler.sendMessage(channelId, `Current time: ${currentTime} ⏰`)
})

// ===== ESCROW COMMANDS =====

// /escrow create
bot.onSlashCommand('escrow create', async (handler, { channelId, options }) => {
    try {
        const seller = options.seller as string
        const amount = options.amount as number
        const description = options.description as string
        const hours = (options.hours as number) || 48

        // Validate inputs
        if (!seller.startsWith('0x') || seller.length !== 42) {
            await handler.sendMessage(channelId, '❌ Invalid seller address. Must be a valid Ethereum address (0x...)')
            return
        }

        if (amount <= 0) {
            await handler.sendMessage(channelId, '❌ Amount must be greater than 0')
            return
        }

        // Convert amount to USDC (6 decimals)
        const amountUsdc = parseUnits(amount.toString(), 6)

        // Calculate deadline
        const deadline = Math.floor(Date.now() / 1000) + (hours * 3600)

        // Hash description
        const memoHash = keccak256(toHex(description))

        // Encode createEscrow calldata
        const calldata = encodeFunctionData({
            abi: factoryAbi,
            functionName: 'createEscrow',
            args: [
                seller as `0x${string}`,
                config.usdcAddress,
                amountUsdc,
                BigInt(deadline),
                '0x0000000000000000000000000000000000000000' as `0x${string}`, // no arbiter for now
                memoHash,
            ],
        })

        // Send transaction request to user
        await handler.sendMessage(
            channelId,
            `**🤝 Creating Escrow Deal**\n\n` +
            `**Seller:** ${seller}\n` +
            `**Amount:** ${amount} USDC\n` +
            `**Description:** ${description}\n` +
            `**Deadline:** ${hours} hours\n\n` +
            `💯 **Next Step:** You need to sign a transaction to create this deal.\n\n` +
            `**Transaction Details:**\n` +
            `• **To:** ${config.factoryAddress}\n` +
            `• **Network:** Base Mainnet\n` +
            `• **Function:** createEscrow\n\n` +
            `💡️ *Note: This transaction does NOT transfer USDC yet. You'll fund the escrow in the next step.*\n\n` +
            `**Calldata:**\n\`\`\`\n${calldata}\n\`\`\``,
        )

    } catch (error) {
        console.error('Error creating escrow:', error)
        await handler.sendMessage(
            channelId,
            `❌ Failed to create escrow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
    }
})

// /escrow info
bot.onSlashCommand('escrow info', async (handler, { channelId, options }) => {
    try {
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

// /escrow stats
bot.onSlashCommand('escrow stats', async (handler, { channelId }) => {
    try {
        const count = await getEscrowCount()

        await handler.sendMessage(
            channelId,
            `**📊 Escrow Statistics**\n\n` +
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
console.log(`🤝 EscrowRonin bot started on port ${config.port}`)
console.log(`🏭 Factory: ${config.factoryAddress}`)
console.log(`🪙 USDC: ${config.usdcAddress}`)

const app = bot.start()
export default app