function formatInr(amount) {
  const value = Number(amount) || 0;
  return `₹${value.toLocaleString('en-IN')}`;
}

module.exports = { formatInr };
