import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const AERODROME_FACTORY = getAddress('0x420DD381b31aEf6683db6B902084cB0FFECe40Da')
const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
const WETH = getAddress('0x4200000000000000000000000000000000000006')
const TOWNS = getAddress('0x00000000A22C618fd6b4D7E9A335C4B96B189a38')

const factoryAbi = [
    {
        name: 'getPool',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'tickSpacing', type: 'int24' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
] as const

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkPool(tokenA: string, tokenB: string, tickSpacing: number) {
    try {
        await delay(1000);
        const pool = await client.readContract({
            address: AERODROME_FACTORY,
            abi: factoryAbi,
            functionName: 'getPool',
            args: [getAddress(tokenA), getAddress(tokenB), tickSpacing],
        })
        const exists = pool !== '0x0000000000000000000000000000000000000000'
        console.log(`Aerodrome Pool [ts=${tickSpacing}]: ${exists ? pool : 'NOT FOUND'}`)
        return exists
    } catch (e: any) {
        console.log(`Error checking Aerodrome pool [ts=${tickSpacing}]: ${e.message}`)
        return false
    }
}

async function main() {
    console.log('--- Checking Aerodrome SlipStream Pools (WETH -> TOWNS) ---')
    // Common tick spacings for Uniswap V3 forks
    await checkPool(WETH, TOWNS, 1)
    await checkPool(WETH, TOWNS, 50)
    await checkPool(WETH, TOWNS, 100)
    await checkPool(WETH, TOWNS, 200)
    await checkPool(WETH, TOWNS, 2000)
}

main().catch(console.error)
