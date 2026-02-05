import { createPublicClient, createWalletClient, http, getAddress, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { readFileSync } from 'fs'
import { join } from 'path'

// CONFIG
const PRIVATE_KEY = '<REDACTED_LEAKED_KEY>'
const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
const WETH = getAddress('0x4200000000000000000000000000000000000006')
const TOWNS = getAddress('0x00000000A22C618fd6b4D7E9A335C4B96B189a38')
const AERO_ROUTER = getAddress('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43')

const account = privateKeyToAccount(PRIVATE_KEY as any)
const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })
const wallet = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })

async function main() {
    console.log('Deploying from:', account.address)

    // 1. Check balances
    const ethBalance = await client.getBalance({ address: account.address })
    console.log('ETH Balance:', ethBalance.toString())

    // NOTE: In a real environment I would need the artifact for the contract. 
    // Since I can't compile here easily, I will attempt to use a pre-existing artifact if possible
    // or describe the next steps for manual verify if I can't deploy directly.

    console.log('--- TEST PLAN ---')
    console.log('1. Deploy EscrowAerodrome')
    console.log('2. Send 1 USDC to contract')
    console.log('3. Call fund()')
    console.log('4. Call release()')
    console.log('5. Verify TOWNS sent to arbiter')

    // Since I don't have a compiler to get bytecode, 
    // I will create a script that ONLY interacts with an ALREADY DEPLOYED contract if the user can deploy it,
    // OR I will ask the user to run forge create.
}

main().catch(console.error)
