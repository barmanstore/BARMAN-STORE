import { Link } from 'react-router-dom';
import './BackofficePopupShell.css';

function BackofficePopupShell({ title, subtitle = '', adminHref = '/admin', children }) {
  return (
    <div className="backoffice-popup-shell">
      <div className="backoffice-popup-shell__header">
        <div className="backoffice-popup-shell__copy">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="backoffice-popup-shell__actions">
          <Link to={adminHref} className="backoffice-popup-shell__link">
            Open in Admin
          </Link>
          <button
            type="button"
            className="backoffice-popup-shell__button"
            onClick={() => window.close()}
          >
            Close Window
          </button>
        </div>
      </div>
      <div className="backoffice-popup-shell__body">{children}</div>
    </div>
  );
}

export default BackofficePopupShell;
