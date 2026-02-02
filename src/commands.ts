import type { BotCommand } from '@towns-protocol/bot'

const commands = [
    {
        name: 'help',
        description: 'Get help with bot commands',
    },
    {
        name: 'app',
        description: 'Open the RoninOTC Web App',
    },
    {
        name: 'time',
        description: 'Get the current time',
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
                description: 'Seller wallet address',
                type: 3,
                required: true,
            },
            {
                name: 'amount',
                description: 'Amount in USDC',
                type: 10,
                required: true,
            },
            {
                name: 'description',
                description: 'What is being sold',
                type: 3,
                required: true,
            },
            {
                name: 'hours',
                description: 'Deadline in hours (default: 48)',
                type: 10,
                required: false,
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
] as const satisfies BotCommand[]

export default commands