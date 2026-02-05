// Towns Bot Native Integration
// Last Updated: 2026-02-05
import { Bot, makeTownsBot, getSmartAccountFromUserId } from '@towns-protocol/bot'
import { encodeFunctionData, parseUnits, keccak256, toHex, decodeEventLog, isAddress, getAddress } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'
import { createPublicClient, http } from 'viem'
import commands from './commands'
import { config } from './config'
import { publicClient, factoryAbi, escrowAbi, getEscrowCount, getDealInfo, getStatusName, getDisputeWinner } from './blockchain'
import { createDeal, getDealById, updateDealStatus, getDealsByUser, getActiveDeals } from './database'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import { serve } from 'bun'
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

// Support for old globalHandler if any stray code still uses it (safety)
let globalHandler: any = null

// ===== BOT COMMANDS (Register handlers BEFORE bot.start) =====

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

        // 3. Deadline and ID
        const dealId = `DEAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

        // 4. Resolve Profiles and Smart Wallets
        const sellerMention = mentions.find(m => m.userId.toLowerCase() === sellerAddress.toLowerCase())
        const buyerMention = mentions.find(m => m.userId.toLowerCase() === buyerAddress.toLowerCase())

        // Resolve real smart wallet addresses if they are Towns user IDs
        const resolveToSmartWallet = async (addr: string) => {
            if (isAddress(addr)) return addr
            try {
                // @ts-ignore - Towns SDK types may vary
                const sw = await getSmartAccountFromUserId(bot, { userId: addr as `0x${string}` })
                return sw || addr
            } catch (e) {
                return addr
            }
        }

        const finalSellerAddress = await resolveToSmartWallet(sellerAddress)
        const finalBuyerAddress = await resolveToSmartWallet(buyerAddress)

        const deal = createDeal({
            deal_id: dealId,
            seller_address: finalSellerAddress,
            seller_user_id: sellerAddress,
            seller_username: '', // Mentions only have displayName
            seller_display_name: sellerMention?.displayName,
            seller_pfp_url: (sellerMention as any)?.profileImageUrl || (sellerMention as any)?.pfpUrl || '',
            buyer_address: finalBuyerAddress,
            buyer_user_id: buyerAddress,
            buyer_username: '',
            buyer_display_name: buyerMention?.displayName,
            buyer_pfp_url: (buyerMention as any)?.profileImageUrl || (buyerMention as any)?.pfpUrl || '',
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
                        url: `${miniAppUrl}?dealId=${dealId}`,
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
bot.onSlashCommand('escrow_stats', async (handler, event) => {
    const { args, mentions, channelId, userId, spaceId } = event

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
        console.log(`[Poll] Checking ${activeDeals.length} active deals...`)
        for (const deal of activeDeals) {
            if (!deal.escrow_address) continue

            try {
                console.log(`[Poll] Checking deal ${deal.deal_id} at ${deal.escrow_address}`)
                const info = await getDealInfo(deal.escrow_address as `0x${string}`)
                const currentStatusName = getStatusName(info.status).toLowerCase()

                if (deal.status !== currentStatusName) {
                    console.log(`[Poll] STATUS CHANGE detected for ${deal.deal_id}: ${deal.status} -> ${currentStatusName}`)

                    updateDealStatus(deal.deal_id, currentStatusName as any, deal.escrow_address)

                    // Check if bot.sendMessage exists
                    if (typeof (bot as any).sendMessage !== 'function') {
                        console.error(`[Poll] CRITICAL: bot.sendMessage is NOT a function! type: ${typeof (bot as any).sendMessage}`)
                        continue
                    }

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
                        const winner = await getDisputeWinner(deal.escrow_address as `0x${string}`)
                        let msg = `⚖️ **DISPUTE RESOLVED**\n\nArbitrator has settled Deal \`${deal.deal_id}\`.`

                        if (winner) {
                            if (winner.toLowerCase() === deal.seller_address.toLowerCase()) {
                                msg += `\n\n✅ **Winner:** Seller\n💰 Funds transferred to seller.`
                            } else if (winner.toLowerCase() === deal.buyer_address.toLowerCase()) {
                                msg += `\n\n✅ **Winner:** Buyer\n💰 Funds returned to buyer.`
                            }
                        }
                        await bot.sendMessage(deal.channel_id, msg).catch(() => { })
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

// Introspection for debugging
console.log(`[Bot Info] Keys:`, Object.keys(bot))
console.log(`[Bot Info] proto:`, Object.keys(Object.getPrototypeOf(bot)))

// ===== CORS MIDDLEWARE =====
app.use('/*', cors({
    origin: '*',
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
}))

// ===== CONNECTIVITY TEST =====
app.get('/api/ping', (c) => {
    console.log('[API] Ping received')
    return c.json({ status: 'ok', time: new Date().toISOString() })
})

// Bot started log
console.log(`🤝 RoninOTC bot initialized on port ${config.port}`)

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

        console.log(`[API] Status update request for ${dealId} to ${status}. Current DB status: ${updatedDeal?.status}`)

        if (typeof (bot as any).sendMessage !== 'function') {
            console.error(`[API] CRITICAL: bot.sendMessage is NOT a function!`)
        }

        // Notification logic for Dispute
        if (status === 'disputed' && updatedDeal) {
            console.log(`[StatusUpdate] Sending DISPUTE notification for ${dealId} to channel ${updatedDeal.channel_id} in town ${updatedDeal.town_id}`)
            try {
                // @ts-ignore
                await bot.sendMessage(
                    updatedDeal.channel_id,
                    `⚠️ **DISPUTE OPENED**\n\n` +
                    `Deal \`${dealId}\` has been flagged for dispute.\n` +
                    `Arbitrator: 0xdA50...7698\n\n` +
                    `The protocol arbitrator will review the transaction evidence.`,
                    // @ts-ignore - Some Towns Bot versions might need spaceId/townId
                    { spaceId: updatedDeal.town_id }
                )
                console.log(`[StatusUpdate] Notification sent successfully.`)
            } catch (err) {
                console.error('Failed to send dispute notification:', err)
            }
        }

        if (status === 'resolved' && updatedDeal) {
            console.log(`[StatusUpdate] Sending RESOLVED notification for ${dealId} to channel ${updatedDeal.channel_id}`)
            try {
                const winner = await getDisputeWinner(escrowAddress as `0x${string}`)
                let msg = `⚖️ **DISPUTE RESOLVED**\n\n` +
                    `Deal \`${dealId}\` has been settled by the arbitrator.`

                if (winner) {
                    if (winner.toLowerCase() === updatedDeal.seller_address.toLowerCase()) {
                        msg += `\n\n✅ **Winner:** Seller\n💰 Funds transferred to seller.`
                    } else if (winner.toLowerCase() === updatedDeal.buyer_address.toLowerCase()) {
                        msg += `\n\n✅ **Winner:** Buyer\n💰 Funds returned to buyer.`
                    }
                }

                // @ts-ignore
                await bot.sendMessage(updatedDeal.channel_id, msg, { spaceId: updatedDeal.town_id })
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

// ===== TRANSACTION INTERACTION SYSTEM (Sweepy-style) =====

type TransactionAction = 'create' | 'approve' | 'fund' | 'release' | 'dispute' | 'resolve'

// Store pending interactions
const pendingInteractions = new Map<string, {
    dealId: string;
    action: TransactionAction;
    userId?: string;
    channelId: string;
}>()

async function sendTxInteraction(
    channelId: string,
    deal: any,
    action: TransactionAction,
    userId?: string
) {
    const interactionId = `tx-${deal.deal_id}-${action}-${Date.now()}`
    pendingInteractions.set(interactionId, { dealId: deal.deal_id, action, userId, channelId })

    let txData: string
    let title: string
    let subtitle: string
    let description: string = ''
    let toAddress: `0x${string}`

    const USDC_ADDRESS: `0x${string}` = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base USDC
    const ESCROW_ADDRESS: `0x${string}` = (deal.escrow_address || config.factoryAddress) as `0x${string}`

    // Validate recipient - MUST be a hex address for the Bot SDK
    let cleanRecipient: `0x${string}` | undefined = undefined
    if (userId && isAddress(userId)) {
        cleanRecipient = getAddress(userId)
    }

    switch (action) {
        case 'create':
            txData = encodeFunctionData({
                abi: factoryAbi,
                functionName: 'createEscrow',
                args: [
                    getAddress(deal.seller_address),
                    getAddress(USDC_ADDRESS),
                    parseUnits(deal.amount, 6),
                    BigInt(deal.deadline),
                    getAddress(config.arbitratorAddress),
                    keccak256(toHex(deal.deal_id))
                ]
            })
            toAddress = config.factoryAddress as `0x${string}`
            title = '🚀 Deploy Escrow'
            subtitle = `Create secure escrow instance for ${deal.amount} USDC`
            description = `Deploying a new RoninOTC Escrow contract via Factory (0x...${config.factoryAddress.slice(-4)}) for Deal ${deal.deal_id}.`
            break

        case 'approve':
            txData = encodeFunctionData({
                abi: [{
                    name: 'approve',
                    type: 'function',
                    stateMutability: 'nonpayable',
                    inputs: [
                        { name: 'spender', type: 'address' },
                        { name: 'amount', type: 'uint256' }
                    ],
                    outputs: [{ type: 'bool' }]
                }],
                functionName: 'approve',
                args: [getAddress(ESCROW_ADDRESS), parseUnits(deal.amount, 6)]
            })
            toAddress = USDC_ADDRESS
            title = '💰 Approve USDC'
            subtitle = `Authorize escrow to handle ${deal.amount} USDC`
            description = `Allowing the Escrow contract (0x...${ESCROW_ADDRESS.slice(-4)}) to pull USDC for funding.`
            break

        case 'fund':
            txData = encodeFunctionData({
                abi: escrowAbi,
                functionName: 'fund',
                args: []
            })
            toAddress = ESCROW_ADDRESS
            title = '🔒 Fund Escrow'
            subtitle = `Deposit ${deal.amount} USDC into agreement`
            description = `Transferring ${deal.amount} USDC from your wallet into the secure Escrow contract (0x...${ESCROW_ADDRESS.slice(-4)}).`
            break

        case 'release':
            txData = encodeFunctionData({
                abi: escrowAbi,
                functionName: 'release',
                args: []
            })
            toAddress = ESCROW_ADDRESS
            title = '✅ Release Funds'
            subtitle = `Send ${deal.amount} USDC to seller`
            description = `Completing the deal and releasing funds to 0x...${deal.seller_address.slice(-4)}.`
            break

        case 'dispute':
            txData = encodeFunctionData({
                abi: escrowAbi,
                functionName: 'openDispute',
                args: []
            })
            toAddress = ESCROW_ADDRESS
            title = '⚠️ Raise Dispute'
            subtitle = 'Escalate this deal to arbitration'
            description = `Opening a dispute for the Escrow contract (0x...${ESCROW_ADDRESS.slice(-4)}). The arbitrator (0x...${config.arbitratorAddress.slice(-4)}) will decide the outcome.`
            break

        case 'resolve':
            txData = encodeFunctionData({
                abi: escrowAbi,
                functionName: 'resolve',
                args: [true] // _payToSeller = true
            })
            toAddress = ESCROW_ADDRESS
            title = '⚖️ Resolve Dispute'
            subtitle = 'Arbiter final decision'
            description = `Final settlement of the dispute in favor of the Seller.`
            break

        default:
            throw new Error('Invalid action')
    }

    const payload = {
        type: 'transaction' as const,
        id: interactionId,
        title,
        subtitle,
        tx: {
            chainId: '8453',
            to: getAddress(toAddress),
            value: '0',
            data: txData,
        },
        recipient: cleanRecipient
    }

    console.log(`[TX Request] Payload:`, JSON.stringify(payload, null, 2))

    async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
        return Promise.race([
            promise,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${name} took > ${timeoutMs}ms`)), timeoutMs))
        ]);
    }

    try {
        console.log(`[TX Request] Attempting interaction send via bot.sendInteractionRequest...`)

        if (typeof (bot as any).sendInteractionRequest === 'function') {
            try {
                const result = await withTimeout((bot as any).sendInteractionRequest(channelId, payload), 5000, 'sendInteractionRequest')
                console.log(`[TX Request] Interaction sent successfully:`, result)
                return result
            } catch (err) {
                console.error(`[TX Request] bot.sendInteractionRequest FAILED:`, err)
                throw err
            }
        } else {
            throw new Error('bot.sendInteractionRequest is not a function')
        }
    } catch (e) {
        console.error(`[TX Request] Final error:`, e)
        throw e
    }
}

// API endpoint for mini-app to request transactions
app.post('/api/request-transaction', async (c) => {
    console.log(`[API POST] /api/request-transaction hit at ${new Date().toISOString()}`)
    try {
        const body = await c.req.json()
        const { dealId, action, userId, channelId } = body
        console.log(`[API POST] Params:`, JSON.stringify(body))

        const deal = getDealById(dealId)
        if (!deal) {
            console.warn(`[API POST] Deal not found: ${dealId}`)
            return c.json({ error: 'Deal not found' }, 404)
        }

        try {
            console.log(`[API POST] Triggering interaction for ${action}...`)
            const result = await sendTxInteraction(channelId, deal, action, userId)
            console.log(`[API POST] Interaction triggered successfully.`)
            return c.json({ success: true, result: 'OK' })
        } catch (error) {
            console.error('[API POST] Inner Error:', error)
            return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
        }
    } catch (error) {
        console.error('[API POST] Outer Error:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// Handle transaction responses
bot.onInteractionResponse(async (handler, event) => {
    const { response, channelId } = event

    if (response.payload.content?.case !== 'transaction') return

    const tx = response.payload.content.value as any
    const interactionId = (response.payload as any).id || tx.requestId
    const interaction = pendingInteractions.get(interactionId)

    if (!interaction) {
        console.log(`[TX Response] Unknown interaction: ${interactionId}`)
        return
    }

    console.log(`[TX Response] ${interactionId}: ${tx.txHash ? 'SUCCESS' : 'FAILED'}`)

    if (tx.txHash) {
        // Transaction successful
        await handler.sendMessage(
            interaction.channelId,
            `✅ **Transaction Confirmed!**\n\n` +
            `Action: **${interaction.action.toUpperCase()}**\n` +
            `Deal: \`${interaction.dealId}\`\n\n` +
            `[View on BaseScan](https://basescan.org/tx/${tx.txHash})`
        )

        // Special handling for sequential flows
        if (interaction.action === 'create') {
            try {
                console.log(`[Auto-Approve] Waiting for receipt for tx: ${tx.txHash}`)
                const receipt = await publicClient.waitForTransactionReceipt({
                    hash: tx.txHash as `0x${string}`
                })

                const log = receipt.logs.find(l => {
                    try {
                        const decoded = decodeEventLog({
                            abi: factoryAbi,
                            data: l.data,
                            topics: l.topics,
                        })
                        return decoded.eventName === 'EscrowCreated'
                    } catch { return false }
                })

                if (log) {
                    const decoded = decodeEventLog({
                        abi: factoryAbi,
                        data: log.data,
                        topics: log.topics,
                    }) as any

                    const escrowAddress = decoded.args.escrowAddress
                    console.log(`[Auto-Approve] Extracted escrow address: ${escrowAddress}`)

                    updateDealStatus(interaction.dealId, 'created', escrowAddress)

                    const deal = getDealById(interaction.dealId)
                    if (deal) {
                        console.log(`[Auto-Approve] Triggering 'approve' for Buyer: ${deal.buyer_address}`)
                        setTimeout(async () => {
                            try {
                                await sendTxInteraction(channelId, deal, 'approve', deal.buyer_user_id || deal.buyer_address)
                                await handler.sendMessage(channelId, `👉 **Next Step:** Automated "Approve USDC" request sent to Buyer.`)
                            } catch (e) {
                                console.error(`[Auto-Approve] Failed to send auto-approve:`, e)
                            }
                        }, 2000)
                    }
                }
            } catch (e) {
                console.error(`[Auto-Approve] Create flow failed:`, e)
            }
        } else if (interaction.action === 'approve') {
            // After Approve, automatically trigger Fund
            try {
                const deal = getDealById(interaction.dealId)
                if (deal) {
                    console.log(`[Auto-Fund] Triggering 'fund' for Buyer: ${deal.buyer_address}`)
                    setTimeout(async () => {
                        try {
                            await sendTxInteraction(channelId, deal, 'fund', deal.buyer_user_id || deal.buyer_address)
                            await handler.sendMessage(channelId, `👉 **Next Step:** USDC Approved! Automated "Deposit Funds" request sent to Buyer.`)
                        } catch (e) {
                            console.error(`[Auto-Fund] Failed to send auto-fund:`, e)
                        }
                    }, 2000)
                }
            } catch (e) {
                console.error(`[Auto-Fund] Approve flow failed:`, e)
            }
        } else if (interaction.action === 'fund') {
            // After Fund, update DB and send final instructions
            try {
                updateDealStatus(interaction.dealId, 'funded')
                await handler.sendMessage(
                    channelId,
                    `🎉 **Funds Deposited!**\n\n` +
                    `The escrow is now fully funded and secured on-chain.\n\n` +
                    `👉 **Next Step:** Return to the App to **Release Funds** (Seller) or **Raise Dispute** (Buyer/Seller).`
                )
            } catch (e) {
                console.error(`[Final-Instruction] Fund flow failed:`, e)
            }
        }

        console.log(`[TX Response] Deal ${interaction.dealId} action ${interaction.action} completed`)
    } else if (tx.error) {
        // Transaction failed
        await handler.sendMessage(
            interaction.channelId,
            `❌ **Transaction Failed**\n\n` +
            `Action: **${interaction.action.toUpperCase()}**\n` +
            `Error: ${tx.error}\n\n` +
            `Please try again or contact support.`
        )
    }

    pendingInteractions.delete(interactionId)
})

console.log(`🔗 Transaction interaction system ready`)


const server = serve({
    port: config.port,
    fetch: app.fetch,
})

console.log(`🚀 Server running on port ${server.port}`)

export default app