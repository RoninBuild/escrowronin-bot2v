export const config = {
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  chainId: parseInt(process.env.CHAIN_ID || '8453'),
  factoryAddress: (process.env.ESCROW_FACTORY_ADDRESS || '0x61dA31C366D67d5De8A9E0E0CA280C7B3B900306') as `0x${string}`,
  usdcAddress: (process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as `0x${string}`,
  explorerUrl: process.env.BASESCAN_URL || 'https://basescan.org',
  port: parseInt(process.env.PORT || '5123'),
} as const

export default config