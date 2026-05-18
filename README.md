# RoninOTC Bot

The Towns Protocol bot behind RoninOTC — trustless OTC escrow for deals made on
Base. Users create and track USDC escrow deals with slash commands inside Towns
chats; the bot settles them on-chain through the Escrow contracts and opens the
RoninOTC mini app dashboard.

OTC deals arranged in chat usually rely on trust or a manual middleman. This bot
moves the escrow on-chain and runs it from where the deal is negotiated.

## Commands

- `/escrow_create <seller> <buyer> <description> <deadline> <amount>` — open a deal
- `/escrow_info <contract_address>` — inspect a deal
- `/escrow_stats` — deal statistics
- `/app` — open the dashboard mini app

## Stack

TypeScript, @towns-protocol/bot, viem, Hono. Network: Base (USDC).
Part of the RoninOTC project — escrow contracts in `escrow2`, mini app in `roninotc-app`.
