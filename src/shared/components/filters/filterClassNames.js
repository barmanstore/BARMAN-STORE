const joinClassNames = (...classNames) => classNames.filter(Boolean).join(' ');

const FILTER_FRAME_CLASS_NAME = 'inline-grid min-w-0 gap-1.5';
const FILTER_LABEL_CLASS_NAME = 'text-[11px] font-semibold uppercase tracking-[0.08em]';
const FILTER_SURFACE_CLASS_NAME = 'relative inline-flex min-h-[38px] items-center overflow-hidden rounded-full border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition';
const FILTER_ICON_TRIGGER_CLASS_NAME = 'relative inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition';
const FILTER_PILL_ROW_CLASS_NAME = 'flex min-h-[38px] items-center gap-2 overflow-x-auto rounded-full border bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)] [scrollbar-width:thin]';
const FILTER_PILL_CLASS_NAME = 'shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition';
const FILTER_POPOVER_CLASS_NAME = 'z-20 mt-2 grid w-full gap-3 rounded-2xl border bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.14)] sm:absolute sm:left-0 sm:top-[calc(100%+10px)] sm:mt-0 sm:min-w-[280px]';
const FILTER_DATE_RANGE_POPOVER_CLASS_NAME = 'z-20 mt-2 grid w-full gap-3 rounded-[18px] border bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.14)] sm:absolute sm:left-0 sm:top-[calc(100%+10px)] sm:mt-0 sm:w-[560px] sm:max-w-[calc(100vw-24px)]';
const FILTER_DATE_FIELD_CLASS_NAME = 'h-[36px] rounded-xl border bg-white px-3 text-[12px] font-medium text-slate-800 outline-none transition';
const FILTER_SCOPE_SELECT_CLASS_NAME = 'h-[38px] w-[78px] shrink-0 appearance-none border-0 bg-slate-50 pl-2.5 pr-6 text-[10px] font-semibold uppercase tracking-[0.05em] outline-none';
const FILTER_SEARCH_BUTTON_CLASS_NAME = 'my-1 mr-1 inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-transparent transition focus-visible:outline-none';

const FILTER_TONES = {
  sky: {
    label: 'text-sky-700',
    icon: 'text-sky-500',
    field: 'border-slate-200 focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100',
    trigger: 'border-slate-200 hover:border-sky-200',
    triggerOpen: 'border-sky-300 ring-4 ring-sky-100',
    pillIdle: 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700',
    pillActive: 'border-sky-300 bg-sky-50 text-sky-700',
    popover: 'border-sky-100',
    dateField: 'border-slate-200 focus:border-sky-300 focus:ring-4 focus:ring-sky-100',
    action: 'text-sky-700 hover:text-sky-900',
    scope: 'text-slate-600 focus:bg-white',
    button: 'bg-sky-50 text-sky-700 hover:bg-sky-100 focus-visible:bg-sky-100',
  },
  amber: {
    label: 'text-amber-700',
    icon: 'text-amber-500',
    field: 'border-slate-200 focus-within:border-amber-300 focus-within:ring-4 focus-within:ring-amber-100',
    trigger: 'border-slate-200 hover:border-amber-200',
    triggerOpen: 'border-amber-300 ring-4 ring-amber-100',
    pillIdle: 'border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700',
    pillActive: 'border-amber-300 bg-amber-50 text-amber-700',
    popover: 'border-amber-100',
    dateField: 'border-slate-200 focus:border-amber-300 focus:ring-4 focus:ring-amber-100',
    action: 'text-amber-700 hover:text-amber-900',
    scope: 'text-slate-600 focus:bg-white',
    button: 'bg-amber-50 text-amber-700 hover:bg-amber-100 focus-visible:bg-amber-100',
  },
  emerald: {
    label: 'text-emerald-700',
    icon: 'text-emerald-500',
    field: 'border-slate-200 focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100',
    trigger: 'border-slate-200 hover:border-emerald-200',
    triggerOpen: 'border-emerald-300 ring-4 ring-emerald-100',
    pillIdle: 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700',
    pillActive: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    popover: 'border-emerald-100',
    dateField: 'border-slate-200 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100',
    action: 'text-emerald-700 hover:text-emerald-900',
    scope: 'text-slate-600 focus:bg-white',
    button: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:bg-emerald-100',
  },
  violet: {
    label: 'text-violet-700',
    icon: 'text-violet-500',
    field: 'border-slate-200 focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100',
    trigger: 'border-slate-200 hover:border-violet-200',
    triggerOpen: 'border-violet-300 ring-4 ring-violet-100',
    pillIdle: 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700',
    pillActive: 'border-violet-300 bg-violet-50 text-violet-700',
    popover: 'border-violet-100',
    dateField: 'border-slate-200 focus:border-violet-300 focus:ring-4 focus:ring-violet-100',
    action: 'text-violet-700 hover:text-violet-900',
    scope: 'text-slate-600 focus:bg-white',
    button: 'bg-violet-50 text-violet-700 hover:bg-violet-100 focus-visible:bg-violet-100',
  },
  slate: {
    label: 'text-slate-600',
    icon: 'text-slate-500',
    field: 'border-slate-200 focus-within:border-slate-300 focus-within:ring-4 focus-within:ring-slate-100',
    trigger: 'border-slate-200 hover:border-slate-300',
    triggerOpen: 'border-slate-300 ring-4 ring-slate-100',
    pillIdle: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
    pillActive: 'border-slate-300 bg-slate-100 text-slate-700',
    popover: 'border-slate-200',
    dateField: 'border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100',
    action: 'text-slate-700 hover:text-slate-900',
    scope: 'text-slate-600 focus:bg-white',
    button: 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:bg-slate-200',
  },
};

const getFilterTone = (tone = 'sky') => FILTER_TONES[tone] || FILTER_TONES.sky;

const getFilterFrameClassName = (className = '') => joinClassNames(FILTER_FRAME_CLASS_NAME, className);

const getFilterLabelClassName = (tone = 'sky') => joinClassNames(FILTER_LABEL_CLASS_NAME, getFilterTone(tone).label);

const getFieldContainerClassName = (tone = 'sky') => (
  joinClassNames(FILTER_SURFACE_CLASS_NAME, getFilterTone(tone).field)
);

const getPillRowClassName = () => FILTER_PILL_ROW_CLASS_NAME;

const getPillClassName = ({ tone = 'sky', active = false } = {}) => (
  joinClassNames(FILTER_PILL_CLASS_NAME, active ? getFilterTone(tone).pillActive : getFilterTone(tone).pillIdle)
);

const getFilterTriggerClassName = ({ tone = 'sky', isOpen = false, hasValue = false } = {}) => (
  joinClassNames(
    FILTER_SURFACE_CLASS_NAME,
    'w-full gap-2 px-3',
    isOpen ? getFilterTone(tone).triggerOpen : getFilterTone(tone).trigger,
    hasValue ? 'text-slate-800' : 'text-slate-500'
  )
);

const getFilterIconTriggerClassName = ({ tone = 'sky', isOpen = false, hasValue = false } = {}) => (
  joinClassNames(
    FILTER_ICON_TRIGGER_CLASS_NAME,
    isOpen ? getFilterTone(tone).triggerOpen : getFilterTone(tone).trigger,
    hasValue ? 'text-slate-800' : 'text-slate-500'
  )
);

const getFilterPopoverClassName = (tone = 'sky') => (
  joinClassNames(FILTER_POPOVER_CLASS_NAME, getFilterTone(tone).popover)
);

const getDateRangePopoverClassName = (tone = 'sky') => (
  joinClassNames(FILTER_DATE_RANGE_POPOVER_CLASS_NAME, getFilterTone(tone).popover)
);

const getDateFieldClassName = (tone = 'sky') => (
  joinClassNames(FILTER_DATE_FIELD_CLASS_NAME, getFilterTone(tone).dateField)
);

const getFilterActionClassName = (tone = 'sky') => (
  joinClassNames('text-[11px] font-semibold transition', getFilterTone(tone).action)
);

const getFilterIconClassName = (tone = 'sky') => getFilterTone(tone).icon;

const getScopeSelectClassName = (tone = 'sky') => (
  joinClassNames(FILTER_SCOPE_SELECT_CLASS_NAME, getFilterTone(tone).scope)
);

const getSearchButtonClassName = (tone = 'sky') => (
  joinClassNames(FILTER_SEARCH_BUTTON_CLASS_NAME, getFilterTone(tone).button)
);

export {
  getDateFieldClassName,
  getDateRangePopoverClassName,
  getFieldContainerClassName,
  getFilterActionClassName,
  getFilterFrameClassName,
  getFilterIconClassName,
  getFilterLabelClassName,
  getFilterPopoverClassName,
  getFilterIconTriggerClassName,
  getFilterTriggerClassName,
  getPillClassName,
  getPillRowClassName,
  getScopeSelectClassName,
  getSearchButtonClassName,
  joinClassNames,
};
