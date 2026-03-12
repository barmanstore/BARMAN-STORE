import React from 'react';
import './AdminUi.css';

function AdminToolbar({ className = '', children }) {
  const classes = ['admin-toolbar', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

export default AdminToolbar;
