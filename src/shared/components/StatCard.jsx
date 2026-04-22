import './StatCard.css';

function StatCard({ icon = null, label, value, hint = null, tone = 'slate', className = '' }) {
  const classes = ['ui-stat-card', `ui-stat-card--${tone}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {icon ? <div className="ui-stat-card__icon">{icon}</div> : null}
      <div className="ui-stat-card__copy">
        <span className="ui-stat-card__label">{label}</span>
        <strong className="ui-stat-card__value">{value}</strong>
        {hint ? <span className="ui-stat-card__hint">{hint}</span> : null}
      </div>
    </div>
  );
}

export default StatCard;
