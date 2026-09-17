function EffortChoice({ effort, asTabLabel = '' }) {
  const levels = effort && Array.isArray(effort.levels) ? effort.levels : [];
  if (!levels.length) return null;

  const currentIndex = levels.findIndex((item) => item && item.value === effort.value);
  const pickNext = () => {
    const next = levels[(currentIndex + 1) % levels.length];
    if (next) effort.onPick(next.value);
  };

  return (
    <div
      className="modeitem effortitem"
      role="button"
      tabIndex={0}
      onClick={pickNext}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        pickNext();
      }}
    >
      <span className="effortLabel">
        <span className="mark codicon codicon-dashboard" aria-hidden="true" />
        <span className="nm">{effort.label}</span>
        <span className="effortLevelInline">
          ({effort.value === '' ? (effort.asTabInlineLabel || asTabLabel) : effort.labelFor(effort.value)})
        </span>
      </span>
      <span
        className="effortslider"
        role="slider"
        aria-label={effort.label}
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, levels.length - 1)}
        aria-valuenow={currentIndex >= 0 ? currentIndex : undefined}
        aria-valuetext={effort.value === '' ? asTabLabel : effort.labelFor(effort.value)}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          const index = Math.round(ratio * Math.max(0, levels.length - 1));
          const next = levels[index];
          if (next) effort.onPick(next.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const start = currentIndex >= 0
            ? currentIndex
            : (direction > 0 ? -1 : levels.length);
          const index = Math.min(
            Math.max(0, levels.length - 1),
            Math.max(0, start + direction),
          );
          const next = levels[index];
          if (next) effort.onPick(next.value);
        }}
      >
        {currentIndex >= 0 ? (
          <span
            className="effortthumb"
            style={{
              left: `calc(var(--thumb-inset) + ${currentIndex / Math.max(1, levels.length - 1)} * (100% - var(--thumb-size) - 2 * var(--thumb-inset)))`,
            }}
            aria-hidden="true"
          />
        ) : null}
      </span>
    </div>
  );
}

module.exports = { EffortChoice };
