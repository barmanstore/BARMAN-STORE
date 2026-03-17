const getPhoneChangeStatusClassName = (phoneChangeRequest) => {
  const status = String(phoneChangeRequest?.status || '').trim().toLowerCase();
  return status ? `phone-change-status ${status}` : '';
};

const getPhoneChangeStatusMessage = (phoneChangeRequest) => {
  const status = String(phoneChangeRequest?.status || '').trim().toUpperCase();
  const requestedPhone = String(phoneChangeRequest?.new_phone || '').trim();
  if (!status || !requestedPhone) return '';
  if (status === 'PENDING_VALIDATION') {
    return 'Phone update is pending. You will be notified once it is updated.';
  }
  if (status === 'APPROVED') {
    return `Phone update to ${requestedPhone} was approved and applied.`;
  }
  if (status === 'REJECTED') {
    return phoneChangeRequest?.rejection_reason
      ? `Phone update was rejected: ${phoneChangeRequest.rejection_reason}`
      : 'Latest phone update request was rejected.';
  }
  return '';
};

const getEmailRequestStatusClassName = (verificationRequestStatus) => {
  const status = String(verificationRequestStatus?.email?.status || '').trim().toLowerCase();
  return status ? `request-status ${status}` : '';
};

const getEmailRequestStatusMessage = (verificationRequestStatus) => {
  const status = String(verificationRequestStatus?.email?.status || '').trim().toLowerCase();
  if (!status) return 'Admin will review and send your code/link via email.';
  if (status === 'pending') return 'Verification request is pending admin review (email).';
  if (status === 'sent') return 'Admin has sent your verification code/link via email. Enter it below.';
  if (status === 'rejected') return 'Verification request was rejected by admin. You can request again.';
  if (status === 'completed') return 'Latest verification request is already completed.';
  return `Latest verification request status: ${status}.`;
};

export {
  getPhoneChangeStatusClassName,
  getPhoneChangeStatusMessage,
  getEmailRequestStatusClassName,
  getEmailRequestStatusMessage,
};
