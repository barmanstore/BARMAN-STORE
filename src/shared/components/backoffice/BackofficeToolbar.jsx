import React from 'react';
import './BackofficeUi.css';

function BackofficeToolbar({ className = '', children }) {
  const classes = ['admin-toolbar', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

export default BackofficeToolbar;
