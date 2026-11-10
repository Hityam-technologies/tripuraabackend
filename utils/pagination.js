function pageMeta(page, limit, total) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit) || 1),
  };
}

module.exports = { pageMeta };
