import { forwardRef } from 'react';
import './TableShell.css';

const TableShell = forwardRef(function TableShell(
  { title = null, actions = null, children, className = '', scrollClassName = '' },
  ref
) {
  const classes = ['ui-table-shell', className].filter(Boolean).join(' ');
  const scrollClasses = ['ui-table-shell__scroll', scrollClassName].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      {title || actions ? (
        <div className="ui-table-shell__header">
          {title ? <h3 className="ui-table-shell__title">{title}</h3> : <span />}
          {actions ? <div className="ui-table-shell__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div ref={ref} className={scrollClasses}>
        {children}
      </div>
    </section>
  );
});

export default TableShell;
