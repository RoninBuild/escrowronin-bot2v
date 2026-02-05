import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
})

const CANDIDATES = [
    '0xb27308f9AaDfd079D9A11C28B95BCB3bb8bC27ce', // Quoter V1 Base?
    '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76A', // Quoter V2 Base
]

async function main() {
    for (const c of CANDIDATES) {
        try {
            const addr = getAddress(c);
            const code = await client.getBytecode({ address: addr })
            console.log(`Address ${addr}: ${code ? 'CONTRACT' : 'EMPTY'}`)
        } catch (e: any) {
            console.log(`Address ${c}: INVALID or ERROR: ${e.message}`)
        }
    }
}

main().catch(console.error)
