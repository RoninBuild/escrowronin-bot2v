# RoninOTC (Towns Bot + Mini-App) | MVP

RoninOTC is an early MVP escrow bot for secure OTC deals inside Towns.
Create a deal in chat, then complete the onchain steps in the mini-app.

## Demo flow
1) Add the bot to a Towns chat
2) Create a deal:
   /escrow_create @username "product or deal description" <amount USDC>
3) Mini-app opens to complete:
   - deposit to escrow
   - set terms (fees, expiration)
   - optional arbitrator assignment
   - confirm + release

## Smart contract
Base escrow contract:
0x61dA31C366D67d5De8A9E0E0CA280C7B3B900306

## Current status
This is a time-boxed MVP shipped close to the deadline.
Core mechanics are in place, UX and full integration are still in progress.

## Roadmap
- Better deal management UX inside the bot
- Arbitrator incentives paid in $TOWNS (auto swap from collected USDC)
- Premium marketplace flows
- Deeper native integration as an in-Towns app
