export const config = {
  botApiUrl: process.env.NEXT_PUBLIC_BOT_API_URL || 'https://escrowronin-bot2v.onrender.com',
  factoryAddress: '0x61dA31C366D67d5De8A9E0E0CA280C7B3B900306' as `0x${string}`,
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  chainId: 8453, // Base
  explorerUrl: 'https://basescan.org',
  rpcUrl: 'https://mainnet.base.org',
}

export const APP_NAME = 'RoninOTC'
export const APP_DESCRIPTION = 'Trustless OTC escrow on Base'