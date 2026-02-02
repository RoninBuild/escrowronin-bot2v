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
                description: 'Seller wallet/ENS/@user',
                type: 3,
                required: true,
            },
            {
                name: 'buyer',
                description: 'Buyer wallet/ENS/@user',
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