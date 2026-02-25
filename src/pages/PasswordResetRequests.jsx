import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, MessageCircle, RefreshCw, XCircle } from 'lucide-react';
import { adminApi } from '../services/api';

const rowActionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 42,
};

function PasswordResetRequests() {
  const [requests, setRequests] = useState([]);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingKey, setProcessingKey] = useState('');
  const [preparedNotifications, setPreparedNotifications] = useState({});

  const fetchData = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      const [resetRequests, contactRequests] = await Promise.all([
        adminApi.getPasswordResetRequests(),
        adminApi.getContactVerificationRequests('open'),
      ]);
      setRequests(Array.isArray(resetRequests) ? resetRequests : []);
      setVerificationRequests(Array.isArray(contactRequests) ? contactRequests : []);
    } catch (_) {
      setError('Failed to load account actions data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const emailQueue = useMemo(
    () => verificationRequests.filter((row) => String(row?.request_type || '').toLowerCase() === 'email'),
    [verificationRequests]
  );
  const phoneQueue = useMemo(
    () => verificationRequests.filter((row) => String(row?.request_type || '').toLowerCase() === 'phone'),
    [verificationRequests]
  );

  const openNotificationLink = (url) => {
    const link = String(url || '').trim();
    if (!link) return;
    if (link.startsWith('mailto:')) {
      window.location.href = link;
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const markSentSafe = async (eventId) => {
    const id = Number(eventId || 0);
    if (!id) return;
    try {
      await adminApi.markNotificationSent(id);
    } catch (_) {
      // best effort only
    }
  };

  const handleCopyText = async (value, label) => {
    try {
      const text = String(value || '').trim();
      if (!text) return;
      if (!navigator?.clipboard?.writeText) {
        setError('Clipboard API is not available in this browser');
        return;
      }
      await navigator.clipboard.writeText(text);
      setSuccess(`${label} copied`);
    } catch (_) {
      setError(`Failed to copy ${String(label || 'text').toLowerCase()}`);
    }
  };

  const handleApproveAndSend = async (row) => {
    const requestId = Number(row?.id || 0);
    const requestType = String(row?.request_type || '').toLowerCase();
    if (!requestId || !requestType) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`verify:${requestId}:send`);
      const result = await adminApi.approveAndSendContactVerificationRequest(requestId);
      const delivery = result?.delivery || {};
      const prepared = requestType === 'email'
        ? (result?.prepared_email || delivery?.email || null)
        : (result?.prepared_whatsapp || delivery?.whatsapp || null);
      const notification = {
        request_type: requestType,
        event_id: Number(delivery?.event_id || 0) || null,
        ...(prepared || {}),
      };
      setPreparedNotifications((prev) => ({ ...prev, [`verify:${requestId}`]: notification }));
      if (requestType === 'email') {
        openNotificationLink(notification.mailto_url);
      } else {
        openNotificationLink(notification.whatsapp_url);
      }
      await markSentSafe(notification.event_id);
      setSuccess(
        requestType === 'email'
          ? 'Email verification template prepared'
          : 'Phone verification template prepared'
      );
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to process verification request');
    } finally {
      setProcessingKey('');
    }
  };

  const handleRejectVerificationRequest = async (row) => {
    const requestId = Number(row?.id || 0);
    if (!requestId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`verify:${requestId}:reject`);
      await adminApi.rejectContactVerificationRequest(requestId);
      setPreparedNotifications((prev) => {
        const next = { ...prev };
        delete next[`verify:${requestId}`];
        return next;
      });
      setSuccess('Verification request rejected');
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to reject verification request');
    } finally {
      setProcessingKey('');
    }
  };

  const handleApproveAndSendPasswordReset = async (requestRow, channel) => {
    const requestId = Number(requestRow?.id || 0);
    if (!requestId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`reset:${requestId}:${channel}`);
      const result = await adminApi.updatePasswordResetRequest(requestId, {
        status: 'approved',
        notify_channel: channel,
      });
      const notification = result?.notification || {};
      setPreparedNotifications((prev) => ({ ...prev, [`reset:${requestId}`]: notification }));

      if (channel === 'email' && notification?.email) {
        openNotificationLink(notification.email.mailto_url);
        await markSentSafe(notification.email.event_id);
      }
      if (channel === 'whatsapp' && notification?.whatsapp) {
        openNotificationLink(notification.whatsapp.whatsapp_url);
        await markSentSafe(notification.whatsapp.event_id);
      }
      setSuccess('Password reset approved and template prepared');
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to process reset request');
    } finally {
      setProcessingKey('');
    }
  };

  const handleRejectPasswordReset = async (requestRow) => {
    const requestId = Number(requestRow?.id || 0);
    if (!requestId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`reset:${requestId}:reject`);
      await adminApi.updatePasswordResetRequest(requestId, { status: 'rejected' });
      setSuccess('Password reset request rejected');
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to reject request');
    } finally {
      setProcessingKey('');
    }
  };

  if (loading) return <div className="billing-content"><p>Loading account actions...</p></div>;

  return (
    <div className="billing-content account-actions">
      <div className="account-actions-header">
        <h1>Account Actions</h1>
        <button className="admin-btn" onClick={() => fetchData({ silent: true })} disabled={refreshing || !!processingKey}>
          {refreshing ? <Loader2 size={16} className="spinning" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>
      <p className="account-actions-subtitle">
        Manage password resets and manual contact verification requests from one queue.
      </p>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <section className="account-actions-section">
        <h2>Password Reset Requests</h2>
        <div className="table-container">
          <table className="billing-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan="6">No password reset requests.</td>
                </tr>
              ) : requests.map((r) => {
                const emailProcessing = processingKey === `reset:${r.id}:email`;
                const whatsappProcessing = processingKey === `reset:${r.id}:whatsapp`;
                const rejectProcessing = processingKey === `reset:${r.id}:reject`;
                const prepared = preparedNotifications[`reset:${r.id}`] || {};
                return (
                  <tr key={r.id}>
                    <td>{r.user_name || '-'}</td>
                    <td>{r.email || '-'}</td>
                    <td>{r.phone || '-'}</td>
                    <td>{r.reason || '-'}</td>
                    <td>{r.status}</td>
                    <td>
                      {r.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            className="admin-btn"
                            title={r.email ? 'Approve and send via Email' : 'Email is not available'}
                            onClick={() => handleApproveAndSendPasswordReset(r, 'email')}
                            disabled={!r.email || !!processingKey}
                            style={rowActionStyle}
                          >
                            {emailProcessing ? <Loader2 size={16} className="spinning" /> : <Mail size={16} />}
                          </button>
                          <button
                            className="admin-btn"
                            title={r.phone ? 'Approve and send via WhatsApp' : 'Phone is not available'}
                            onClick={() => handleApproveAndSendPasswordReset(r, 'whatsapp')}
                            disabled={!r.phone || !!processingKey}
                            style={rowActionStyle}
                          >
                            {whatsappProcessing ? <Loader2 size={16} className="spinning" /> : <MessageCircle size={16} />}
                          </button>
                          <button
                            className="admin-btn"
                            title="Reject request"
                            onClick={() => handleRejectPasswordReset(r)}
                            disabled={!!processingKey}
                            style={rowActionStyle}
                          >
                            {rejectProcessing ? <Loader2 size={16} className="spinning" /> : <XCircle size={16} />}
                          </button>
                        </div>
                      ) : (
                        <span>{r.status}</span>
                      )}

                      {prepared?.email && (
                        <div className="prepared-message-box">
                          <strong>Prepared Email</strong>
                          <textarea readOnly rows={4} value={prepared.email.body || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.email.subject, 'Subject')}>
                              Copy Subject
                            </button>
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.email.body, 'Body')}>
                              Copy Body
                            </button>
                            {prepared.email.mailto_url && <a className="admin-btn" href={prepared.email.mailto_url}>Open Email App</a>}
                          </div>
                        </div>
                      )}
                      {prepared?.whatsapp && (
                        <div className="prepared-message-box">
                          <strong>Prepared WhatsApp</strong>
                          <textarea readOnly rows={4} value={prepared.whatsapp.text || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.whatsapp.text, 'Message')}>
                              Copy Message
                            </button>
                            {prepared.whatsapp.whatsapp_url && (
                              <a className="admin-btn" href={prepared.whatsapp.whatsapp_url} target="_blank" rel="noreferrer">
                                Open WhatsApp
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="account-actions-section">
        <h2>Email Verification Requests</h2>
        <div className="table-container">
          <table className="billing-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {emailQueue.length === 0 ? (
                <tr>
                  <td colSpan="4">No pending email verification requests.</td>
                </tr>
              ) : emailQueue.map((row) => {
                const sendProcessing = processingKey === `verify:${row.id}:send`;
                const rejectProcessing = processingKey === `verify:${row.id}:reject`;
                const prepared = preparedNotifications[`verify:${row.id}`];
                return (
                  <tr key={`email-${row.id}`}>
                    <td>{row.user_name || '-'}</td>
                    <td>{row.user_email || '-'}</td>
                    <td>{row.status}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          className="admin-btn"
                          title="Approve and prepare verification email"
                          onClick={() => handleApproveAndSend(row)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {sendProcessing ? <Loader2 size={16} className="spinning" /> : <Mail size={16} />}
                        </button>
                        <button
                          className="admin-btn"
                          title="Reject verification request"
                          onClick={() => handleRejectVerificationRequest(row)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {rejectProcessing ? <Loader2 size={16} className="spinning" /> : <XCircle size={16} />}
                        </button>
                      </div>
                      {prepared && (
                        <div className="prepared-message-box">
                          <strong>Prepared Email</strong>
                          <textarea readOnly rows={4} value={prepared.body || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.subject, 'Subject')}>
                              Copy Subject
                            </button>
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.body, 'Body')}>
                              Copy Body
                            </button>
                            {prepared.mailto_url && <a className="admin-btn" href={prepared.mailto_url}>Open Email App</a>}
                            {prepared.link && (
                              <a className="admin-btn" href={prepared.link} target="_blank" rel="noreferrer">
                                Open Verification Link
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="account-actions-section">
        <h2>Phone Verification Requests</h2>
        <div className="table-container">
          <table className="billing-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {phoneQueue.length === 0 ? (
                <tr>
                  <td colSpan="4">No pending phone verification requests.</td>
                </tr>
              ) : phoneQueue.map((row) => {
                const sendProcessing = processingKey === `verify:${row.id}:send`;
                const rejectProcessing = processingKey === `verify:${row.id}:reject`;
                const prepared = preparedNotifications[`verify:${row.id}`];
                return (
                  <tr key={`phone-${row.id}`}>
                    <td>{row.user_name || '-'}</td>
                    <td>{row.user_phone || '-'}</td>
                    <td>{row.status}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          className="admin-btn"
                          title="Approve and prepare verification WhatsApp message"
                          onClick={() => handleApproveAndSend(row)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {sendProcessing ? <Loader2 size={16} className="spinning" /> : <MessageCircle size={16} />}
                        </button>
                        <button
                          className="admin-btn"
                          title="Reject verification request"
                          onClick={() => handleRejectVerificationRequest(row)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {rejectProcessing ? <Loader2 size={16} className="spinning" /> : <XCircle size={16} />}
                        </button>
                      </div>
                      {prepared && (
                        <div className="prepared-message-box">
                          <strong>Prepared WhatsApp</strong>
                          <textarea readOnly rows={4} value={prepared.text || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.text, 'Message')}>
                              Copy Message
                            </button>
                            {prepared.whatsapp_url && (
                              <a className="admin-btn" href={prepared.whatsapp_url} target="_blank" rel="noreferrer">
                                Open WhatsApp
                              </a>
                            )}
                            {prepared.link && (
                              <a className="admin-btn" href={prepared.link} target="_blank" rel="noreferrer">
                                Open Verification Link
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default PasswordResetRequests;
