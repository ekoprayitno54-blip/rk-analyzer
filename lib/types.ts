export type UnitType = 'SPBU' | 'LPG' | 'SPPBE' | 'OTHER'
export type BankTx = {
  id: string; date: string; description: string; debit: number; credit: number; balance: number;
  account?: string; reference?: string; fingerprint?: string; internalNote?: string; category?: string;
  matchStatus?: 'matched'|'partial'|'review'|'unmatched'; matchSource?: string; confidence?: number; difference?: number;
}
export type Settlement = { id: string; date: string; total: number; label: string; source?: string }
export type Redemption = { id: string; date: string; product: string; qty: number; unit: string; total: number; doNo?: string; source?: string }
export type AppData = { bank: BankTx[]; settlements: Settlement[]; redemptions: Redemption[]; unitType: UnitType; unitName: string; unitId?: string }
