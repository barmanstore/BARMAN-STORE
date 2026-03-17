const { createVerificationRecords } = require('./verification/records');
const { createVerificationLinks } = require('./verification/links');
const { createEmailVerificationSender } = require('./verification/sendEmail');
const { createPhoneVerificationSender } = require('./verification/sendPhone');

const createVerificationUtils = (deps = {}) => {
  const records = createVerificationRecords(deps);
  const links = createVerificationLinks(deps);
  const emailSender = createEmailVerificationSender({
    ...deps,
    createEmailVerificationRecord: records.createEmailVerificationRecord,
    buildEmailVerificationLink: links.buildEmailVerificationLink,
  });
  const phoneSender = createPhoneVerificationSender({
    ...deps,
    createPhoneVerificationRecord: records.createPhoneVerificationRecord,
    buildPhoneVerificationLink: links.buildPhoneVerificationLink,
  });

  return {
    createEmailVerificationRecord: records.createEmailVerificationRecord,
    createPhoneVerificationRecord: records.createPhoneVerificationRecord,
    buildEmailVerificationLink: links.buildEmailVerificationLink,
    buildPhoneVerificationLink: links.buildPhoneVerificationLink,
    sendPhoneVerificationChallenge: phoneSender.sendPhoneVerificationChallenge,
    sendEmailVerificationChallenge: emailSender.sendEmailVerificationChallenge,
  };
};

module.exports = { createVerificationUtils };
