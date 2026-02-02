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
                name: 'buyer',
                description: 'Buyer wallet/ENS/@user',
                type: 3,
                required: true,
            },
            {
                name: 'any_args',
                description: 'Description ... Amount',
                type: 3,
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
] as const

export default commands as any