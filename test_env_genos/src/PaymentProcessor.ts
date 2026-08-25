// PaymentProcessor.ts - Legacy payment code. DO NOT TOUCH without tests.
export class PaymentProcessor {
    private balances: Map<string, number> = new Map();
        private transactions: string[] = [];

            constructor() {
                    this.balances.set("acct_eur_1", 1000.0);
                            this.balances.set("acct_usd_1", 500.0);
                                }

                                    public processPayment(accountId: string, amount: any, currency: any) {
                                            let bal = this.balances.get(accountId);
                                                    if (bal == null) {
                                                                throw new Error("unknown account");
                                                                        }
                                                                                // BUG SUBTIL: additionne sans vérifier la devise du montant
                                                                                        // vs la devise du compte. EUR + USD = corruption silencieuse.
                                                                                                let newBal = bal + amount;
                                                                                                        if (newBal < 0) {
                                                                                                                    throw new Error("insufficient funds");
                                                                                                                            }
                                                                                                                                    this.balances.set(accountId, newBal);
                                                                                                                                            this.transactions.push(`${accountId}:${amount}:${currency}`);
                                                                                                                                                    return newBal;
                                                                                                                                                        }

                                                                                                                                                            public refund(accountId: string, amount: any) {
                                                                                                                                                                    return this.processPayment(accountId, -amount, null);
                                                                                                                                                                        }
                                                                                                                                                                        }
