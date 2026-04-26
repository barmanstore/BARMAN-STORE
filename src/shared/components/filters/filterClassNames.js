const joinClassNames = (...classNames) => classNames.filter(Boolean).join(' ');

const FILTER_FRAME_CLASS_NAME = 'inline-grid min-w-0 gap-1.5';
const FILTER_LABEL_CLASS_NAME = 'text-[11px] font-semibold uppercase tracking-[0.08em]';
const FILTER_SURFACE_CLASS_NAME =
  'relative inline-flex min-h-[44px] items-center overflow-hidden rounded-[18px] border border-slate-200/90 bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-md transition';
const FILTER_ICON_TRIGGER_CLASS_NAME =
  'relative inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-slate-200/90 bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-md transition';
const FILTER_PILL_ROW_CLASS_NAME =
  'flex min-h-[44px] flex-wrap items-center gap-2 rounded-[18px] border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-md';
const FILTER_PILL_CLASS_NAME =
  'shrink-0 rounded-[10px] border px-3.5 py-2 text-[12px] font-semibold tracking-[0.01em] transition';
const FILTER_POPOVER_CLASS_NAME =
  'z-20 mt-2 grid w-full gap-3 rounded-[20px] border border-slate-200/90 bg-white/98 p-3.5 shadow-[0_24px_48px_rgba(15,23,42,0.14)] backdrop-blur-md sm:absolute sm:left-0 sm:top-[calc(100%+10px)] sm:mt-0 sm:min-w-[280px]';
const FILTER_DATE_RANGE_POPOVER_CLASS_NAME =
  'z-20 grid gap-3 rounded-[20px] border border-slate-200/90 bg-white/98 p-3.5 shadow-[0_24px_48px_rgba(15,23,42,0.14)] backdrop-blur-md absolute left-0 top-[calc(100%+10px)] mt-0 w-[560px] max-w-[calc(100vw-24px)]';
const FILTER_DATE_FIELD_CLASS_NAME =
  'h-[40px] rounded-2xl border border-slate-200 bg-white/95 px-3.5 text-[12px] font-medium text-slate-800 outline-none transition';
const FILTER_TONES = {
  sky: {
    label: 'text-sky-700',
    icon: 'text-sky-500',
    field:
      'border-slate-200/90 focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100/90',
    trigger: 'border-slate-200 hover:border-sky-200',
    triggerOpen: 'border-sky-300 ring-4 ring-sky-100/90',
    pillIdle:
      'border-slate-200 bg-white/95 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700',
    pillActive:
      'border-sky-300 bg-sky-500 font-bold text-white shadow-[0_10px_18px_rgba(37,99,235,0.18)]',
    popover: 'border-sky-100',
    dateField: 'border-slate-200 focus:border-sky-300 focus:ring-4 focus:ring-sky-100',
    action: 'text-sky-700 hover:text-sky-900',
  },
  amber: {
    label: 'text-amber-700',
    icon: 'text-amber-500',
    field:
      'border-slate-200/90 focus-within:border-amber-300 focus-within:ring-4 focus-within:ring-amber-100/90',
    trigger: 'border-slate-200 hover:border-amber-200',
    triggerOpen: 'border-amber-300 ring-4 ring-amber-100/90',
    pillIdle:
      'border-slate-200 bg-white/95 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700',
    pillActive:
      'border-amber-300 bg-amber-500 font-bold text-white shadow-[0_10px_18px_rgba(217,119,6,0.18)]',
    popover: 'border-amber-100',
    dateField: 'border-slate-200 focus:border-amber-300 focus:ring-4 focus:ring-amber-100',
    action: 'text-amber-700 hover:text-amber-900',
  },
  emerald: {
    label: 'text-emerald-700',
    icon: 'text-emerald-500',
    field:
      'border-slate-200/90 focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100/90',
    trigger: 'border-slate-200 hover:border-emerald-200',
    triggerOpen: 'border-emerald-300 ring-4 ring-emerald-100/90',
    pillIdle:
      'border-slate-200 bg-white/95 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700',
    pillActive:
      'border-emerald-300 bg-emerald-500 font-bold text-white shadow-[0_10px_18px_rgba(5,150,105,0.18)]',
    popover: 'border-emerald-100',
    dateField: 'border-slate-200 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100',
    action: 'text-emerald-700 hover:text-emerald-900',
  },
  violet: {
    label: 'text-violet-700',
    icon: 'text-violet-500',
    field:
      'border-slate-200/90 focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100/90',
    trigger: 'border-slate-200 hover:border-violet-200',
    triggerOpen: 'border-violet-300 ring-4 ring-violet-100/90',
    pillIdle:
      'border-slate-200 bg-white/95 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700',
    pillActive:
      'border-violet-300 bg-violet-500 font-bold text-white shadow-[0_10px_18px_rgba(109,40,217,0.18)]',
    popover: 'border-violet-100',
    dateField: 'border-slate-200 focus:border-violet-300 focus:ring-4 focus:ring-violet-100',
    action: 'text-violet-700 hover:text-violet-900',
  },
  slate: {
    label: 'text-slate-600',
    icon: 'text-slate-500',
    field:
      'border-slate-200/90 focus-within:border-slate-300 focus-within:ring-4 focus-within:ring-slate-100/90',
    trigger: 'border-slate-200 hover:border-slate-300',
    triggerOpen: 'border-slate-300 ring-4 ring-slate-100/90',
    pillIdle:
      'border-slate-200 bg-white/95 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
    pillActive:
      'border-slate-300 bg-slate-500 font-bold text-white shadow-[0_10px_18px_rgba(15,23,42,0.16)]',
    popover: 'border-slate-200',
    dateField: 'border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100',
    action: 'text-slate-700 hover:text-slate-900',
  },
};

const getFilterTone = (tone = 'sky') => FILTER_TONES[tone] || FILTER_TONES.sky;

const getFilterFrameClassName = (className = '') =>
  joinClassNames(FILTER_FRAME_CLASS_NAME, className);

const getFilterLabelClassName = (tone = 'sky') =>
  joinClassNames(FILTER_LABEL_CLASS_NAME, getFilterTone(tone).label);

const getFieldContainerClassName = (tone = 'sky') =>
  joinClassNames(FILTER_SURFACE_CLASS_NAME, getFilterTone(tone).field);

const getPillRowClassName = () => FILTER_PILL_ROW_CLASS_NAME;

const getPillClassName = ({ tone = 'sky', active = false } = {}) =>
  joinClassNames(
    FILTER_PILL_CLASS_NAME,
    active ? getFilterTone(tone).pillActive : getFilterTone(tone).pillIdle
  );

const getFilterTriggerClassName = ({ tone = 'sky', isOpen = false, hasValue = false } = {}) =>
  joinClassNames(
    FILTER_SURFACE_CLASS_NAME,
    'w-full gap-2 px-3',
    isOpen ? getFilterTone(tone).triggerOpen : getFilterTone(tone).trigger,
    hasValue ? 'text-slate-800' : 'text-slate-500'
  );

const getFilterIconTriggerClassName = ({ tone = 'sky', isOpen = false, hasValue = false } = {}) =>
  joinClassNames(
    FILTER_ICON_TRIGGER_CLASS_NAME,
    isOpen ? getFilterTone(tone).triggerOpen : getFilterTone(tone).trigger,
    hasValue ? 'text-slate-800' : 'text-slate-500'
  );

const getFilterPopoverClassName = (tone = 'sky') =>
  joinClassNames(FILTER_POPOVER_CLASS_NAME, getFilterTone(tone).popover);

const getDateRangePopoverClassName = (tone = 'sky') =>
  joinClassNames(FILTER_DATE_RANGE_POPOVER_CLASS_NAME, getFilterTone(tone).popover);

const getDateFieldClassName = (tone = 'sky') =>
  joinClassNames(FILTER_DATE_FIELD_CLASS_NAME, getFilterTone(tone).dateField);

const getFilterActionClassName = (tone = 'sky') =>
  joinClassNames('text-[11px] font-semibold transition', getFilterTone(tone).action);

const getFilterIconClassName = (tone = 'sky') => getFilterTone(tone).icon;

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
  joinClassNames,
};
