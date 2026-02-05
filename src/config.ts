export const config = {
  // Final sync: 2026-02-03T21:00:00Z
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  chainId: parseInt(process.env.CHAIN_ID || '8453'),
  factoryAddress: (process.env.ESCROW_FACTORY_ADDRESS || '0xc5A2751f45c03F487b33767cF9b9867907d0aEcE') as `0x${string}`,

  usdcAddress: (process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as `0x${string}`,
  arbitratorAddress: (process.env.ARBITRATOR_ADDRESS || '0x8929944d183E28291410656046e7f8f94E4f4E61') as `0x${string}`,
  explorerUrl: process.env.BASESCAN_URL || 'https://basescan.org',
  port: parseInt(process.env.PORT || '5123'),
  appUrl: process.env.APP_URL || 'https://roninotc-app.vercel.app',
} as const

export default config