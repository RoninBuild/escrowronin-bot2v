import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const UNISWAP_FACTORY = getAddress('0x33128a8fC170d030172f21153099ce00083B8a00')
const AERODROME_FACTORY = getAddress('0x5e7DAcA2761156F4d0D3C40283294372505B93CC') // SlipStream Factory
const WETH = getAddress('0x4200000000000000000000000000000000000006')

const TOWNS_ADDRS = [
    getAddress('0x00000000A22C618fd6b4D7E9A335C4B96B189a38'), // Coinbase/Official?
    getAddress('0x000000fa00b200406de700041cfc6b19bbfb4d13')  // GeckoTerminal?
]

const uniFactoryAbi = [
    { name: 'getPool', type: 'function', stateMutability: 'view', inputs: [{ name: 't1', type: 'address' }, { name: 't2', type: 'address' }, { name: 'f', type: 'uint24' }], outputs: [{ name: 'p', type: 'address' }] }
] as const

const aeroFactoryAbi = [
    { name: 'getPool', type: 'function', stateMutability: 'view', inputs: [{ name: 't1', type: 'address' }, { name: 't2', type: 'address' }, { name: 'ts', type: 'int24' }], outputs: [{ name: 'p', type: 'address' }] }
] as const

async function main() {
    for (const towns of TOWNS_ADDRS) {
        console.log(`\n--- Checking TOWNS [${towns}] ---`)

        // Check Uniswap
        for (const fee of [500, 3000, 10000]) {
            try {
                const pool = await client.readContract({ address: UNISWAP_FACTORY, abi: uniFactoryAbi, functionName: 'getPool', args: [WETH, towns, fee] })
                if (pool !== '0x0000000000000000000000000000000000000000') console.log(`  Uniswap V3 [${fee / 10000}%]: ${pool}`)
            } catch (e) { }
        }

        // Check Aerodrome SlipStream (Registry/Factory)
        // Try both most common tick spacings
        for (const ts of [1, 10, 50, 60, 100, 200]) {
            try {
                const pool = await client.readContract({ address: AERODROME_FACTORY, abi: aeroFactoryAbi, functionName: 'getPool', args: [WETH, towns, ts] })
                if (pool !== '0x0000000000000000000000000000000000000000') console.log(`  Aerodrome SlipStream [ts=${ts}]: ${pool}`)
            } catch (e) { }
        }
    }
}

main().catch(console.error)
