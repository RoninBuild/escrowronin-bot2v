import { createPublicClient, http, encodePacked, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const QUOTER_V1 = getAddress('0xb27308f9AaDfd079D9A11C28B95BCB3bb8bC27ce')
const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
const WETH = getAddress('0x4200000000000000000000000000000000000006')
const TOWNS = getAddress('0x00000000A22C618fd6b4D7E9A335C4B96B189a38')

const quoterAbi = [
    {
        name: 'quoteExactInput',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'path', type: 'bytes' }, { name: 'amountIn', type: 'uint256' }],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
] as const

async function check(name: string, path: `0x${string}`, amountIn: bigint) {
    try {
        const amountOut = await client.readContract({
            address: QUOTER_V1,
            abi: quoterAbi,
            functionName: 'quoteExactInput',
            args: [path, amountIn],
        })
        console.log(`✅ [${name}] Result: ${amountOut.toString()}`)
        return amountOut
    } catch (e: any) {
        console.log(`❌ [${name}] Failed: ${e.shortMessage || e.message || 'Revert'}`)
        return 0n
    }
}

async function main() {
    console.log('--- ISOLATED PATH CHECKS ---')

    // USDC -> WETH (Should work)
    console.log('\n[USDC -> WETH]')
    await check('USDC -> WETH 0.05%', encodePacked(['address', 'uint24', 'address'], [USDC, 500, WETH]), 1000000n)

    // WETH -> TOWNS (Check all fee tiers)
    console.log('\n[WETH -> TOWNS]')
    for (const fee of [100, 500, 3000, 10000]) {
        await check(`WETH -> TOWNS ${fee / 10000}%`, encodePacked(['address', 'uint24', 'address'], [WETH, fee, TOWNS]), 10n ** 16n) // 0.01 WETH
    }

    // USDC -> TOWNS DIRECT
    console.log('\n[USDC -> TOWNS DIRECT]')
    for (const fee of [100, 500, 3000, 10000]) {
        await check(`USDC -> TOWNS ${fee / 10000}%`, encodePacked(['address', 'uint24', 'address'], [USDC, fee, TOWNS]), 1000000n)
    }
}

main().catch(console.error)
