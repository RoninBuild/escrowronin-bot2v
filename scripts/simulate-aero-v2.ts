import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const ROUTER_V2 = getAddress('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43')
const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
const WETH = getAddress('0x4200000000000000000000000000000000000006')
const TOWNS = getAddress('0x00000000A22C618fd6b4D7E9A335C4B96B189a38')

const routerAbi = [
    {
        name: 'getAmountsOut',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            {
                name: 'routes',
                type: 'tuple[]',
                components: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'stable', type: 'bool' },
                ],
            },
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
    },
] as const

async function main() {
    const amountIn = 1000000n // 1 USDC

    const routes = [
        { from: USDC, to: WETH, stable: true },
        { from: WETH, to: TOWNS, stable: false },
    ]

    try {
        const amounts = await client.readContract({
            address: ROUTER_V2,
            abi: routerAbi,
            functionName: 'getAmountsOut',
            args: [amountIn, routes],
        })
        console.log(`✅ Aerodrome V2 Result: ${amounts[amounts.length - 1].toString()} TOWNS`)
        console.log(`  Path: USDC -> WETH (Stable) -> TOWNS (Volatile)`)
    } catch (e: any) {
        console.log(`❌ Aerodrome V2 Failed: ${e.message}`)

        // Try both volatile
        try {
            const routes2 = [
                { from: USDC, to: WETH, stable: false },
                { from: WETH, to: TOWNS, stable: false },
            ]
            const amounts2 = await client.readContract({
                address: ROUTER_V2,
                abi: routerAbi,
                functionName: 'getAmountsOut',
                args: [amountIn, routes2],
            })
            console.log(`✅ Aerodrome V2 (Both Volatile) Result: ${amounts2[amounts2.length - 1].toString()} TOWNS`)
        } catch (e2: any) {
            console.log(`❌ Aerodrome V2 (Both Volatile) Failed: ${e2.message}`)
        }
    }
}

main().catch(console.error)
