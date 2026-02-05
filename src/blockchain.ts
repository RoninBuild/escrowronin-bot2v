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