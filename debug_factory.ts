
import { createPublicClient, http, parseUnits, keccak256, toHex, zeroAddress } from 'viem'
import { base } from 'viem/chains'
import factoryAbi from './src/abi/EscrowFactory.json'

const FACTORY_ADDRESS = '0x61dA31C366D67d5De8A9E0E0CA280C7B3B900306'
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

async function main() {
    const client = createPublicClient({
        chain: base,
        transport: http() // uses public RPC or from env
    })

    const buyer = '0x1234567890123456789012345678901234567890' as const
    const seller = '0x0987654321098765432109876543210987654321' as const
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600 * 48) // 48h
    const amount = parseUnits('0.01', 6)
    const memoHash = keccak256(toHex('debug-deal-' + Date.now()))

    console.log('Simulating createEscrow...')
    console.log('Factory:', FACTORY_ADDRESS)
    console.log('Token:', USDC_ADDRESS)

    const escrows = factoryAbi.filter((x: any) => x.name === 'createEscrow')
    console.log('Found createEscrow definitions:', escrows.length)
    escrows.forEach((e: any, i: number) => {
        console.log(`Def ${i} inputs:`, e.inputs.length, e.inputs.map((x: any) => x.name))
    })

    // Test 1: Valid for 7 args
    try {
        const { result } = await client.simulateContract({
            address: FACTORY_ADDRESS,
            abi: factoryAbi,
            functionName: 'createEscrow',
            args: [buyer, seller, USDC_ADDRESS, amount, deadline, zeroAddress, memoHash],
            account: seller // simulate as seller
        })
        console.log('✅ Simulation success! Result (Escrow Address):', result)
    } catch (e) {
        console.error('❌ Simulation failed (Valid Args):', e)
    }

    // Test 2: Self-dealing
    try {
        await client.simulateContract({
            address: FACTORY_ADDRESS,
            abi: factoryAbi,
            functionName: 'createEscrow',
            args: [seller, seller, USDC_ADDRESS, amount, deadline, zeroAddress, memoHash],
            account: seller
        })
        console.log('✅ Self-dealing simulation success (Unexpected)')
    } catch (e) {
        console.log('✅ Self-dealing failed as expected. Error:', (e as Error).message.split('\n')[0])
    }
}

main()
