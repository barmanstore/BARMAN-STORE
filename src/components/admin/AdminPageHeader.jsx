import React from 'react';
import './AdminUi.css';

function AdminPageHeader({
  title,
  subtitle,
  actions = null,
  className = '',
  children = null
}) {
  const classes = ['admin-page-header', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="admin-page-header-main">
        {title ? <h1>{title}</h1> : null}
        {subtitle ? <p>{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="admin-page-header-actions">{actions}</div> : null}
    </div>
  );
}

export default AdminPageHeader;
