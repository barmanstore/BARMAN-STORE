import React from 'react';

function EmptyState({
  eyebrow = null,
  icon = null,
  title,
  description = null,
  actions = null,
  className = '',
}) {
  const classes = ['ui-empty-state', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {eyebrow ? <div className="ui-empty-state__eyebrow">{eyebrow}</div> : null}
      {icon ? <div className="ui-empty-state__icon">{icon}</div> : null}
      {title ? <h3 className="ui-empty-state__title">{title}</h3> : null}
      {description ? <div className="ui-empty-state__description">{description}</div> : null}
      {actions ? <div className="ui-empty-state__actions">{actions}</div> : null}
    </div>
  );
}

export default EmptyState;
