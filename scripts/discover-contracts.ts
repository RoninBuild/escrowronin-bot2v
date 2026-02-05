import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const CANDIDATES = [
    '0xbe6d8f0d05cC4be24d5167a3eF062215bE6D18a5', // Router
    '0xBE6D8861148dC742A985D2BDCCd988450005C614', // Potential Quoter
    '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76A', // Uni QuoterV2
]

async function main() {
    for (const c of CANDIDATES) {
        try {
            const code = await client.getBytecode({ address: c as any })
            console.log(`Address ${c}: ${code ? 'CONTRACT' : 'EMPTY'}`)
            if (code && code.length > 2) {
                console.log(`  Code length: ${code.length}`)
            }
        } catch (e: any) {
            console.log(`Address ${c}: ERROR: ${e.message}`)
        }
    }
}

main().catch(console.error)
