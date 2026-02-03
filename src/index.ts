import { makeTownsBot } from '@towns-protocol/bot'
import { encodeFunctionData, parseUnits, keccak256, toHex } from 'viem'
import commands from './commands'
import { config } from './config'
import { publicClient, factoryAbi, escrowAbi, getEscrowCount, getDealInfo, getStatusName } from './blockchain'
import { createDeal, getDealById, updateDealStatus, getDealsByUser, getActiveDeals } from './database'
import { serveStatic } from 'hono/bun'
import fs from 'node:fs/promises'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
    baseRpcUrl: config.rpcUrl,
    identity: {
        name: 'RoninOTC',
        description: 'Trustless OTC escrow on Base with USDC.',
        image: `${process.env.BASE_URL || 'https://roninotc-app.vercel.app'}/branding.png`,
        domain: new URL(process.env.BASE_URL || 'https://roninotc-app.vercel.app').hostname,
    },
})

// ===== BOT COMMANDS =====

// Help command
bot.onSlashCommand('help', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '🚀 **RoninOTC Bot Help**\n\n' +
        '**Commands:**\n' +
        '`/app` - Open Dashboard\n' +
        '`/escrow_create <seller> <buyer> <description> <deadline> <amount>`\n' +
        '`/escrow_info <contract_address>`\n' +
        '`/escrow_stats`\n\n' +
        '**Roles:**\n' +
        '🟢 **Buyer**: PAYS the funds (USDC).\n' +
        '🔴 **Seller**: RECEIVES the funds (Assets/Services).\n\n' +
        '**Example:**\n' +
        '`/escrow_create @Seller @Buyer "Service" 24h 100`',
    )
})


bot.onSlashCommand('app', async (handler, { channelId }) => {
    const miniappUrl = config.appUrl
    await handler.sendMessage(
        channelId,
        '🚀 **Open RoninOTC Dashboard**\nCreate, manage, and track your trustless escrow deals on Base.',
        {
            attachments: [
                {
                    type: 'miniapp',
                    url: miniappUrl,
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
        // Create clean args by filtering empty strings/whitespace
        const cleanArgs = args.filter(a => a && a.trim().length > 0)
        console.log('Clean Args:', cleanArgs)

        // Parsing logic: <seller> <buyer> <description> <deadline> <amount>
        // Min length 4: Seller, Buyer, Description, Amount (Default Deadline)

        if (cleanArgs.length < 3) {
            await handler.sendMessage(channelId,
                '❌ **Invalid format**\n\n' +
                '**Usage:**\n' +
                '`/escrow_create <seller> <buyer> <description> <deadline> <amount>`\n\n' +
                '**Roles:**\n' +
                '🔴 **Seller**: Receives funds\n' +
                '🟢 **Buyer**: Pays funds\n\n' +
                '**Examples:**\n' +
                '`/escrow_create @Seller @Buyer "Logo design" 48h 100`\n' +
                '`/escrow_create 0xSeller 0xBuyer "Audit" 1w 500`'
            )
            return
        }

        if (cleanArgs.length < 4) {
            await handler.sendMessage(channelId, '❌ **Missing arguments**.\nRequired: Seller, Buyer, Description, Amount.\nExample: `/escrow_create @Seller @Buyer "Task" 100`')
            return
        }

        const sellerInput = cleanArgs[0]
        const buyerInput = cleanArgs[1]

        // Handling optional deadline
        // If 5 args: S, B, Desc, Deadline, Amt
        // If 4 args: S, B, Desc, Amt (Default deadline)

        let descriptionInput = ''
        let deadlineInput = ''
        let amountInput = ''

        if (cleanArgs.length >= 5) {
            descriptionInput = cleanArgs[2]
            deadlineInput = cleanArgs[3]
            amountInput = cleanArgs[cleanArgs.length - 1]
        } else {
            // Length is 4
            descriptionInput = cleanArgs[2]
            amountInput = cleanArgs[3] // Last one is amount
            // Check if 3rd arg matches deadline format just in case usage was scrambled? 
            // Better stick to positional convention. S, B, D, A.
        }

        console.log('Inputs:', { sellerInput, buyerInput, descriptionInput, deadlineInput, amountInput })
        console.log('Mentions:', mentions)

        let mentionIdx = 0

        // Robust Address Resolver Helper with Fuzzy Matching
        const resolveArgToAddress = async (arg: string): Promise<string | null> => {
            // 1. If strict valid address, use it directly.
            if (isAddress(arg)) return arg

            // 2. Check if the arg passed is a shortened address string (e.g. "0x123...abc")
            const isShortened = arg.startsWith('0x') && arg.includes('...')

            if (mentions && mentions.length > 0) {
                // Strategy A: Fuzzy match against specific mention if arg looks like part of it
                if (isShortened) {
                    const start = arg.split('...')[0]
                    const end = arg.split('...')[1]
                    const matchIdx = mentions.findIndex(m =>
                        m.userId.toLowerCase().startsWith(start.toLowerCase()) &&
                        (end ? m.userId.toLowerCase().endsWith(end.toLowerCase()) : true)
                    )

                    if (matchIdx !== -1) {
                        // Found a match!
                        const matched = mentions[matchIdx]
                        // We don't remove it from array to avoid complex state, but we prioritize it.
                        // But if we have multiple args, we must be careful.
                        // For now, let's just return it. 
                        // To prevent re-using same mention for both if they are identical text? 
                        // No, typically manual inputs are distinct.
                        return matched.userId
                    }
                }

                // Strategy B: Positional Match (Fallback)
                // If the arg is effectively empty (Towns pill behavior potentially) or just a name
                // AND we haven't consumed this mention index yet.
                if (mentions[mentionIdx]) {
                    const matchedAddress = mentions[mentionIdx].userId
                    mentionIdx++ // Move cursor
                    return matchedAddress
                }
            }

            // 3. Last Resort: ENS or specific resolution
            return await resolveAddress(arg)
        }

        // 1. Resolve Seller
        const sellerAddress = await resolveArgToAddress(sellerInput)
        if (!sellerAddress) {
            await handler.sendMessage(channelId, `❌ **Seller Error**: Could not resolve address from input '${sellerInput}'.\n\n` +
                `**Tip**: If you are copy-pasting a "pill" (shortened address), it may not work. Please type \`@username\` or paste the **FULL** wallet address.`)
            return
        }

        // 2. Resolve Buyer
        const buyerAddress = await resolveArgToAddress(buyerInput)
        if (!buyerAddress) {
            await handler.sendMessage(channelId, `❌ **Buyer Error**: Could not resolve address from input '${buyerInput}'.\n\n` +
                `**Tip**: If you are copy-pasting a "pill" (shortened address), it may not work. Please type \`@username\` or paste the **FULL** wallet address.`)
            return
        }

        // 2. Parse Amount
        const amount = parseFloat(amountInput?.replace(/USDC/i, '') || '')

        if (isNaN(amount) || amount <= 0) {
            await handler.sendMessage(channelId, '❌ Invalid amount. Must be a number > 0')
            return
        }

        if (!descriptionInput) {
            await handler.sendMessage(channelId, '❌ Description is required')
            return
        }

        const dealId = `DEAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        // 3. Parse Deadline (simple: h, d, w)
        let deadlineSecs = 48 * 3600 // Default 48h
        if (deadlineInput) {
            const match = deadlineInput.match(/^(\d+)([hdw])$/i)
            if (match) {
                const val = parseInt(match[1])
                const unit = match[2].toLowerCase()
                if (unit === 'h') deadlineSecs = val * 3600
                else if (unit === 'd') deadlineSecs = val * 3600 * 24
                else if (unit === 'w') deadlineSecs = val * 3600 * 24 * 7
            }
        }
        const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadlineSecs

        const deal = createDeal({
            deal_id: dealId,
            seller_address: sellerAddress,
            buyer_address: buyerAddress,
            amount: amount.toString(),
            token: 'USDC',
            description: descriptionInput,
            deadline: deadlineTimestamp,
            status: 'draft',
            town_id: spaceId || '',
            channel_id: channelId,
        })

        console.log('✅ Deal created:', deal)

        const miniAppUrl = `${config.appUrl}/index.html`

        await handler.sendMessage(
            channelId,
            `**🤝 OTC Deal Created**\n\n` +
            `**Deal ID:**\n\n\`\`\`\n${dealId}\n\`\`\`\n\n` +
            `**Seller:** ${sellerInput.startsWith('0x') ? `\`${sellerInput.slice(0, 6)}...${sellerInput.slice(-4)}\`` : (sellerInput.includes('.') ? sellerInput : `<@${sellerAddress}>`)}\n\n` +
            `**Buyer:** ${buyerInput.startsWith('0x') ? `\`${buyerInput.slice(0, 6)}...${buyerInput.slice(-4)}\`` : (buyerInput.includes('.') ? buyerInput : `<@${buyerAddress}>`)}\n\n` +
            `**Amount:** \`${amount} USDC\`\n\n` +
            `**Description:** ${descriptionInput}\n\n` +
            `**Deadline:** ${deadlineInput || '48h'}\n\n` +
            `**Status:** ⏳ Draft (not on-chain yet)`,
            {
                attachments: [
                    {
                        type: 'miniapp',
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


// /arbiter_release
bot.onSlashCommand('arbiter_release', async (handler, { channelId, args }) => {
    try {
        const dealIdArg = args[0]
        if (!dealIdArg) {
            await handler.sendMessage(channelId, `❌ Please provide Deal ID`)
            return
        }

        const deal = getDealById(dealIdArg)

        if (!deal) {
            await handler.sendMessage(channelId, `❌ Deal not found: ${dealIdArg}`)
            return
        }

        const appUrl = process.env.BASE_URL || 'https://roninotc-app.vercel.app'
        const link = `${appUrl}/deal/${dealIdArg}`

        await handler.sendMessage(channelId,
            `👮 **Arbitrator Console**\n\n` +
            `To resolve Deal \`${dealIdArg}\`, please open the secure dashboard and connect the Arbitrator Wallet (0xdA50...).\n\n` +
            `👉 [Open Resolution Panel](${link})`
        )
    } catch (error) {
        console.error('Arbiter command error:', error)
        await handler.sendMessage(channelId, '❌ Error processing command')
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
        // Try to resolve (Mentions/ENS)
        let address = input

        // Check mentions first if input is not a raw address
        if (!isAddress(input) && mentions && mentions.length > 0) {
            address = mentions[0].userId
        }

        // Check ENS/Resolution if still not an address
        if (!isAddress(address)) {
            const resolved = await resolveAddress(address)
            if (resolved) address = resolved
        }

        if (!isAddress(address)) {
            await handler.sendMessage(channelId, `❌ Invalid address '${input}' or resolution failed.`)
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
        let msg = `❌ Failed to fetch escrow info: ${error instanceof Error ? error.message : 'Unknown error'}`
        if (msg.includes('reverted')) {
            msg = `❌ Error: The address you provided is not a valid Escrow Contract. \n\n` +
                `**Note:** /escrow_info requires the address of the DEAL contract, not your personal wallet address.`
        }
        await handler.sendMessage(channelId, msg)
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

// Polling Notification System
async function pollDeals() {
    try {
        const activeDeals = getActiveDeals()
        for (const deal of activeDeals) {
            if (!deal.escrow_address) continue

            try {
                const info = await getDealInfo(deal.escrow_address as `0x${string}`)
                const currentStatusName = getStatusName(info.status).toLowerCase()

                // Map chain status to DB/App status
                // Chain: CREATED, FUNDED, RELEASED, REFUNDED, DISPUTED, RESOLVED
                // DB: created, funded, released, refunded, disputed, resolved

                if (deal.status !== currentStatusName) {
                    console.log(`[Poll] Status change detected for ${deal.deal_id}: ${deal.status} -> ${currentStatusName}`)

                    updateDealStatus(deal.deal_id, currentStatusName as any, deal.escrow_address)

                    // Notify on specific transitions
                    if (currentStatusName === 'disputed') {
                        console.log(`[Poll] Sending DISPUTE notification for ${deal.deal_id}`)
                        await bot.sendMessage(
                            deal.channel_id,
                            `⚠️ **DISPUTE OPENED**\n\n` +
                            `Deal \`${deal.deal_id}\` has been flagged for dispute.\n` +
                            `Arbitrator: 0xdA50...7698\n\n` +
                            `The protocol arbitrator will review the transaction evidence.`
                        ).catch(e => console.error('Failed to send poll notification:', e))
                    }

                    if (currentStatusName === 'released') {
                        await bot.sendMessage(deal.channel_id, `💎 **DEAL COMPLETED**\nFunds released to seller for Deal \`${deal.deal_id}\`.`).catch(() => { })
                    }

                    if (currentStatusName === 'refunded') {
                        await bot.sendMessage(deal.channel_id, `↩️ **DEAL REFUNDED**\nFunds returned to buyer for Deal \`${deal.deal_id}\`.`).catch(() => { })
                    }

                    if (currentStatusName === 'resolved') {
                        await bot.sendMessage(deal.channel_id, `⚖️ **DISPUTE RESOLVED**\nArbitrator has settled Deal \`${deal.deal_id}\`.`).catch(() => { })
                    }
                }
            } catch (err) {
                console.error(`[Poll] Error checking deal ${deal.deal_id}:`, err)
            }
        }
    } catch (error) {
        console.error('[Poll] Loop error:', error)
    }
}

// Start polling every 10 seconds
setInterval(pollDeals, 10000)

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

        // Notification logic for Dispute
        if (status === 'disputed' && updatedDeal) {
            console.log(`[StatusUpdate] Sending DISPUTE notification for ${dealId} to channel ${updatedDeal.channel_id}`)
            try {
                // @ts-ignore - Assuming bot instance has sendMessage or similar capability
                await bot.sendMessage(
                    updatedDeal.channel_id,
                    `⚠️ **DISPUTE OPENED**\n\n` +
                    `Deal \`${dealId}\` has been flagged for dispute.\n` +
                    `Arbitrator: 0xdA50...7698\n\n` +
                    `The protocol arbitrator will review the transaction evidence.`
                )
                console.log(`[StatusUpdate] Notification sent successfully.`)
            } catch (err) {
                console.error('Failed to send dispute notification:', err)
            }
        }

        // Notification logic for Resolved
        if (status === 'resolved' && updatedDeal) {
            console.log(`[StatusUpdate] Sending RESOLVED notification for ${dealId} to channel ${updatedDeal.channel_id}`)
            try {
                const msg = `⚖️ **DISPUTE RESOLVED**\n\n` +
                    `Deal \`${dealId}\` has been settled by the arbitrator.\n` +
                    `The funds have been distributed according to the ruling.`

                await bot.sendMessage(updatedDeal.channel_id, msg)
                console.log(`[StatusUpdate] Resolved notification sent successfully.`)
            } catch (err) {
                console.error('Failed to send resolved notification:', err)
            }
        }

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