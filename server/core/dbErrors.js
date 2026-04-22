const isTransientDatabaseError = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '53300' ||
    code === '57P03' ||
    message.includes('maxclientsinsessionmode') ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('too many clients already') ||
    message.includes('max client connections reached') ||
    message.includes('remaining connection slots are reserved') ||
    message.includes('connection limit reached') ||
    message.includes('pool_size') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout')
  );
};

module.exports = { isTransientDatabaseError };
