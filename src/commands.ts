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
        name: 'app_only',
        description: 'Launch dashboard (no image debug).'
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
        name: 'escrow_create_test',
        description: 'DEBUG: Create deal with custom roles (Hidden)',
        options: [
            {
                name: 'seller',
                description: 'Seller Address/ENS',
                type: 3,
                required: true,
            },
            {
                name: 'buyer',
                description: 'Buyer Address/ENS',
                type: 3,
                required: true,
            },
            {
                name: 'description',
                description: 'Description',
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
] as const satisfies BotCommand[]

export default commands