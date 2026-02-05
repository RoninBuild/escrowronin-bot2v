import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const FACTORY_V2 = getAddress('0x420DD381b31aEf6683db6B902084cB0FFECe40Da')
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
            { name: 'stable', type: 'bool' }, // Fixed type
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
] as const

async function checkPool(name: string, tokenA: string, tokenB: string, stable: boolean) {
    try {
        const pool = await client.readContract({
            address: FACTORY_V2,
            abi: factoryAbi,
            functionName: 'getPool',
            args: [getAddress(tokenA), getAddress(tokenB), stable],
        })
        const exists = pool !== '0x0000000000000000000000000000000000000000'
        console.log(`${name} [${stable ? 'stable' : 'volatile'}]: ${exists ? pool : 'NOT FOUND'}`)
        return exists
    } catch (e: any) {
        console.log(`${name} [${stable ? 'stable' : 'volatile'}]: Error: ${e.message}`)
        return false
    }
}

async function main() {
    console.log('--- Checking Aerodrome V2 Pools ---')
    await checkPool('WETH/TOWNS', WETH, TOWNS, false)
    await checkPool('WETH/TOWNS', WETH, TOWNS, true)
    await checkPool('USDC/TOWNS', USDC, TOWNS, false)
    await checkPool('USDC/TOWNS', USDC, TOWNS, true)
}

main().catch(console.error)
