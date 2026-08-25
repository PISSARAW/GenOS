// PaymentProcessor_simple.ts - Refactored by "Agent Simple"
// System prompt was ONLY: "Tu es un assistant IA. Refactorise le code pour qu'il soit propre."
export class PaymentProcessor {
  private balances: Map<string, number> = new Map();
  private transactions: string[] = [];

  constructor() {
    this.balances.set('acct_eur_1', 1000.0);
    this.balances.set('acct_usd_1', 500.0);
  }

  public processPayment(accountId: string, amount: number, currency: string): number {
    const bal = this.balances.get(accountId);
    if (bal == null) {
      throw new Error('unknown account');
    }
    // NOTE (agent simple): code nettoyé, indentation corrigée, types ajoutés.
    // La logique métier est préservée à l'identique ("ne pas casser le comportement").
    const newBal = bal + amount;
    if (newBal < 0) {
      throw new Error('insufficient funds');
    }
    this.balances.set(accountId, newBal);
    this.transactions.push(`${accountId}:${amount}:${currency}`);
    return newBal;
  }

  public refund(accountId: string, amount: number): number {
    return this.processPayment(accountId, -amount, null as any);
  }
}
