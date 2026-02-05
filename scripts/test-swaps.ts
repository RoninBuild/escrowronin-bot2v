import { createPublicClient, http, encodePacked, Hex, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const UNI_QUOTER_V2 = getAddress('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76A')
const AERO_QUOTER = getAddress('0xBE6D8861148dC742A985D2BDCCd988450005C614')

const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
const WETH = getAddress('0x4200000000000000000000000000000000000006')
const TOWNS = getAddress('0x00000000A22C618fd6b4D7E9A335C4B96B189a38')

const quoterAbi = [
    {
        name: 'quoteExactInput',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'path', type: 'bytes' }, { name: 'amountIn', type: 'uint256' }],
        outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 's', type: 'uint160[]' }, { name: 'i', type: 'uint32[]' }, { name: 'g', type: 'uint256' }],
    },
] as const

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function check(name: string, quoter: string, path: Hex, amountIn: bigint) {
    try {
        await delay(1000);
        const result = await client.readContract({
            address: getAddress(quoter),
            abi: quoterAbi,
            functionName: 'quoteExactInput',
            args: [path, amountIn],
        })
        console.log(`✅ [${name}] Result: ${result[0].toString()} TOWNS`)
        return result[0]
    } catch (e: any) {
        console.log(`❌ [${name}] Failed: ${e.shortMessage || 'Revert'}`)
        return 0n
    }
}

async function main() {
    const amountIn = 1000000n // 1 USDC

    console.log('--- FINAL SWAP AUDIT ---')

    // UNISWAP V3 PATHS
    console.log('\n[Uniswap V3]')
    await check('UNI: 0.05% -> 0.3%', UNI_QUOTER_V2, encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [USDC, 500, WETH, 3000, TOWNS]), amountIn)
    await check('UNI: 0.05% -> 1%', UNI_QUOTER_V2, encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [USDC, 500, WETH, 10000, TOWNS]), amountIn)
    await check('UNI: 0.3% -> 0.3%', UNI_QUOTER_V2, encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [USDC, 3000, WETH, 3000, TOWNS]), amountIn)

    // AERODROME SLIPSTREAM PATHS (Concentrated)
    console.log('\n[Aerodrome SlipStream - CL]')
    // ts=100 (0.3% approx), ts=200 (1% approx), ts=60 (0.3%)
    await check('AERO CL: ts=1 -> ts=100', AERO_QUOTER, encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [USDC, 1, WETH, 100, TOWNS]), amountIn)
    await check('AERO CL: ts=10 -> ts=100', AERO_QUOTER, encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [USDC, 10, WETH, 100, TOWNS]), amountIn)
    await check('AERO CL: ts=10 -> ts=60', AERO_QUOTER, encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [USDC, 10, WETH, 60, TOWNS]), amountIn)
    await check('AERO CL: ts=1 -> ts=60', AERO_QUOTER, encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [USDC, 1, WETH, 60, TOWNS]), amountIn)

    console.log('\n[Aerodrome - Direct]')
    await check('AERO DIRECT: ts=100', AERO_QUOTER, encodePacked(['address', 'uint24', 'address'], [USDC, 100, TOWNS]), amountIn)
    await check('AERO DIRECT: ts=200', AERO_QUOTER, encodePacked(['address', 'uint24', 'address'], [USDC, 200, TOWNS]), amountIn)
}

main().catch(console.error)
