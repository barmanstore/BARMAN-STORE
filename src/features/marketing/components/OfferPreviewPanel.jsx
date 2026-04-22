import { memo } from 'react';
import { AlertTriangle, Eye, ShieldCheck, Sparkles } from 'lucide-react';

function OfferPreviewPanel({
  previewTitle,
  previewText,
  previewScope,
  previewValue,
  previewSchedule,
  strengthMeta,
  validationIssues,
  conflictWarnings,
}) {
  return (
    <aside className="offer-preview-panel">
      <section className="offer-preview-card">
        <div className="offer-preview-head">
          <div className="offer-section-icon">
            <Eye size={16} />
          </div>
          <div>
            <h3>Preview</h3>
            <p>Customer-facing summary based on the current form.</p>
          </div>
        </div>

        <div className="offer-preview-body">
          <p className="offer-preview-title">{previewTitle}</p>
          <p className="offer-preview-text">{previewText}</p>
          <div className={`offer-strength-strip tone-${strengthMeta?.tone || 'light'}`}>
            <Sparkles size={15} />
            <div>
              <strong>{strengthMeta?.label || 'Offer strength'}</strong>
              <span>{strengthMeta?.description || ''}</span>
            </div>
          </div>
          <div className="offer-preview-meta">
            <span>{previewScope}</span>
            <span>{previewValue}</span>
            {previewSchedule ? <span>{previewSchedule}</span> : null}
          </div>
        </div>
      </section>

      <section className="offer-preview-card">
        <div className="offer-preview-head">
          <div className="offer-section-icon">
            <ShieldCheck size={16} />
          </div>
          <div>
            <h3>Validation</h3>
            <p>Catch mistakes before the backend rejects the offer.</p>
          </div>
        </div>

        {validationIssues.length > 0 ? (
          <ul className="offer-warning-list offer-warning-list--error">
            {validationIssues.map((issue) => (
              <li key={issue}>
                <AlertTriangle size={14} />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="offer-empty-state offer-empty-state--success">
            <strong>Ready to save</strong>
            <span>The current offer passes client-side checks.</span>
          </div>
        )}
      </section>

      <section className="offer-preview-card">
        <div className="offer-preview-head">
          <div className="offer-section-icon">
            <AlertTriangle size={16} />
          </div>
          <div>
            <h3>Possible Overlaps</h3>
            <p>Warnings only. Use them to avoid competing offers on the same scope.</p>
          </div>
        </div>

        {conflictWarnings.length > 0 ? (
          <ul className="offer-warning-list">
            {conflictWarnings.map((warning) => (
              <li key={warning}>
                <AlertTriangle size={14} />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="offer-empty-state">
            <strong>No obvious conflicts</strong>
            <span>No overlapping live or scheduled offer was detected for this scope.</span>
          </div>
        )}
      </section>
    </aside>
  );
}

export default memo(OfferPreviewPanel);
