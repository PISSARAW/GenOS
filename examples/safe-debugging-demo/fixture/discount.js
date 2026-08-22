function finalPrice(total, isMember) {
  if (!Number.isFinite(total) || total < 0) {
    throw new TypeError('total must be a non-negative number');
  }

  // Bug: members spending exactly 100 should receive the discount too.
  if (isMember && total > 100) {
    return Number((total * 0.8).toFixed(2));
  }
  return total;
}

module.exports = { finalPrice };
