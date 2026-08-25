-- queries.sql - réparé par le Worker OperonWorker (opéron SQL uniquement)
-- fix: == n'est pas un opérateur de comparaison SQL standard (utilise =)
SELECT id, balance FROM accounts WHERE currency = 'USD';
UPDATE accounts SET balance = balance * 1.02 WHERE id IN (SELECT id FROM accounts WHERE balance > 0);
