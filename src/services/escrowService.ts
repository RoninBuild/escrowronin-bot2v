

export class EscrowService {
    async create(seller: string, amount: bigint) { /* ... */ }
    async getStatus(id: number) { /* ... */ }
    async dispute(id: number) { /* ... */ }
    async release(id: number) { /* ... */ }
}

