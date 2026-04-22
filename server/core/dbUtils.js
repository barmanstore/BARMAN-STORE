const isUniqueViolationError = (error) => String(error?.code || '').trim() === '23505';

module.exports = { isUniqueViolationError };
