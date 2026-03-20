import './BackofficePopupShell.css';

function PopupWorkspaceNotice({
  title,
  message,
  onFocusPopup = null,
  onContinueInline = null,
}) {
  return (
    <div className="backoffice-popup-notice">
      <div className="backoffice-popup-notice__card">
        <h2>{title}</h2>
        <p>{message}</p>
        {typeof onFocusPopup === 'function' || typeof onContinueInline === 'function' ? (
          <div className="backoffice-popup-notice__actions">
            {typeof onFocusPopup === 'function' ? (
              <button type="button" className="admin-btn" onClick={onFocusPopup}>
                Focus Popup
              </button>
            ) : null}
            {typeof onContinueInline === 'function' ? (
              <button type="button" className="admin-btn secondary" onClick={onContinueInline}>
                Continue Here
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default PopupWorkspaceNotice;
