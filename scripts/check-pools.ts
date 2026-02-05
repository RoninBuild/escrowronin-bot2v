import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const FACTORY = getAddress('0x33128a8fC170d030172f21153099ce00083B8a00')
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
            { name: 'fee', type: 'uint24' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
] as const

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkPool(name: string, tokenA: string, tokenB: string, fee: number) {
    try {
        await delay(2000); // 2s delay
        const pool = await client.readContract({
            address: FACTORY,
            abi: factoryAbi,
            functionName: 'getPool',
            args: [getAddress(tokenA), getAddress(tokenB), fee],
        })
        const exists = pool !== '0x0000000000000000000000000000000000000000'
        console.log(`${name} [${fee / 10000}%]: ${exists ? pool : 'NOT FOUND'}`)
        return exists
    } catch (e: any) {
        console.log(`${name} [${fee / 10000}%]: Error: ${e.message}`)
        return false
    }
}

async function main() {
    console.log('--- Checking WETH -> TOWNS Pools ---')
    await checkPool('WETH/TOWNS', WETH, TOWNS, 3000)
    await checkPool('WETH/TOWNS', WETH, TOWNS, 10000)
    await checkPool('WETH/TOWNS', WETH, TOWNS, 500)

    console.log('\n--- Checking USDC -> WETH Pools ---')
    await checkPool('USDC/WETH', USDC, WETH, 500)
}

main().catch(console.error)
