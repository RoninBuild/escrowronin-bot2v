import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { config } from './config'
import factoryArtifact from './abi/EscrowFactory.json'
import escrowArtifact from './abi/Escrow.json'

export const factoryAbi = factoryArtifact.abi
export const escrowAbi = escrowArtifact.abi

export const publicClient = createPublicClient({
  chain: base,
  transport: http(config.rpcUrl),
})


export async function getEscrowCount() {
  const count = await publicClient.readContract({
    address: config.factoryAddress,
    abi: factoryAbi as any,

    functionName: 'getEscrowCount',
  })
  return count
}

export async function getDealInfo(escrowAddress: `0x${string}`) {
  const info = await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi as any,

    functionName: 'getDealInfo',
  }) as any[]

  return {
    buyer: info[0],
    seller: info[1],
    token: info[2],
    amount: info[3],
    deadline: info[4],
    arbiter: info[5],
    memoHash: info[6],
    status: info[7],
    fundedAt: info[8],
  }
}

export async function getDisputeWinner(escrowAddress: `0x${string}`) {
  try {
    const logs = await publicClient.getContractEvents({
      address: escrowAddress,
      abi: escrowAbi as any,

      eventName: 'DisputeResolved',
      fromBlock: 0n,
    })

    if (logs.length > 0) {
      return (logs[0] as any).args.winner
    }
  } catch (error) {
    console.error('Error fetching dispute winner:', error)
  }
  return null
}

export enum EscrowStatus {
  CREATED = 0,
  FUNDED = 1,
  RELEASED = 2,
  REFUNDED = 3,
  DISPUTED = 4,
  RESOLVED = 5,
}

export function getStatusName(status: number): string {
  const names = ['CREATED', 'FUNDED', 'RELEASED', 'REFUNDED', 'DISPUTED', 'RESOLVED']
  return names[status] || 'UNKNOWN'
}

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

export const publicClient = createPublicClient({ chain: base, transport: http() })
export const FACTORY = '0xc5A2751f45c03F487b33767cF9b9867907d0aEcE' as const



export async function getDealInfo(id: number) {
    try {
        const addr = await publicClient.readContract({
            address: FACTORY, abi: factoryAbi, functionName: 'getEscrowById', args: [BigInt(id)]
        })
        if (addr === '0x0000000000000000000000000000000000000000') throw new Error('Not found')
        return { addr, ...await readEscrow(addr) }
    } catch { return null }
}



export function normalizeAddr(addr: string): string {
    return addr.toLowerCase()
}



export async function batchGetStatuses(ids: number[]) {
    const contracts = ids.map(id => ({ address: FACTORY, abi: factoryAbi, functionName: 'getEscrowById', args: [BigInt(id)] }))
    return publicClient.multicall({ contracts })
}



export function hashMemo(text: string): `0x${string}` {
    return keccak256(toHex(text))
}



let _factoryAbi: any = null
export function getFactoryAbi() {
    if (!_factoryAbi) _factoryAbi = factoryAbi
    return _factoryAbi
}



import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'

export async function resolveAddress(input: string): Promise<string> {
    if (isAddress(input)) return input
    return await publicClient.getEnsAddress({ name: normalize(input) }) || ''
}

