const createDistributorUtils = ({ dbGetAsync } = {}) => {
  const getDistributorByIdAsync = async (distributorId) => {
    const normalizedDistributorId = Number(distributorId || 0);
    if (!normalizedDistributorId) return null;
    return dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [normalizedDistributorId]);
  };

  return { getDistributorByIdAsync };
};

module.exports = { createDistributorUtils };
