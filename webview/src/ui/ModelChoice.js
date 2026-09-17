const { useEffect, useRef, useState } = require('react');

function ModelChoice({ model }) {
  const [open, setOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(() => Boolean(
    model && Array.isArray(model.options) && model.options.some(
      (option) => option && option.group === 'legacy' && option.value === model.value,
    )
  ));
  const currentModelRef = useRef(null);
  const options = model && Array.isArray(model.options) ? model.options : [];
  const regularModels = options.filter((option) => option && option.group !== 'legacy');
  const legacyModels = options.filter((option) => option && option.group === 'legacy');
  const emptyModel = regularModels.find((option) => option.value === '');
  const orderedRegularModels = emptyModel
    ? [emptyModel, ...regularModels.filter((option) => option !== emptyModel)]
    : regularModels;
  const currentModel = options.find((option) => option && option.value === model.value) || null;
  const asTabLabel = model && model.asTabLabel ? model.asTabLabel : '';

  useEffect(() => {
    const currentIsLegacy = legacyModels.some((option) => option.value === (model && model.value));
    if (currentIsLegacy) setLegacyOpen(true);
  }, [model && model.value, legacyModels.length]);

  useEffect(() => {
    if (!open || !currentModelRef.current) return;
    currentModelRef.current.scrollIntoView({ block: 'nearest' });
  }, [open, legacyOpen, model && model.value]);

  if (!model) return null;

  return (
    <>
      <button
        className="modeitem modelitem"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="mark codicon codicon-symbol-field" aria-hidden="true" />
        <span className="col">
          <span className="nm">{model.label}</span>
          <span className="note">{model.value === '' ? asTabLabel : (currentModel && (currentModel.label || currentModel.value))}</span>
        </span>
      </button>
      {open ? (
        <div className="modelpick">
          {model.loading ? <div className="modelstatus">{model.loadingLabel}</div> : null}
          {!model.loading ? orderedRegularModels.map((option) => (
            <button
              key={option.value || '__as-tab__'}
              ref={option.value === model.value ? currentModelRef : null}
              className={'modeitem modeloption' + (option.value === model.value ? ' now' : '')}
              onClick={() => {
                model.onPick(option.value);
                setOpen(false);
              }}
            >
              <span
                className={'mark codicon codicon-' + (option.value === model.value ? 'check' : 'blank')}
                aria-hidden="true"
              />
              <span className="col">
                <span className="nm">{option.value === '' ? asTabLabel : (option.label || option.value)}</span>
                {option.description ? <span className="note">{option.description}</span> : null}
              </span>
            </button>
          )) : null}
          {!model.loading && legacyModels.length ? (
            <>
              <button
                className="modeitem modelgroup"
                aria-expanded={legacyOpen}
                onClick={() => setLegacyOpen((value) => !value)}
              >
                <span className={'mark codicon codicon-chevron-' + (legacyOpen ? 'down' : 'right')} aria-hidden="true" />
                <span className="nm">{model.legacyLabel}</span>
              </button>
              {legacyOpen ? legacyModels.map((option) => (
                <button
                  key={option.value}
                  ref={option.value === model.value ? currentModelRef : null}
                  className={'modeitem modeloption' + (option.value === model.value ? ' now' : '')}
                  onClick={() => {
                    model.onPick(option.value);
                    setOpen(false);
                  }}
                >
                  <span
                    className={'mark codicon codicon-' + (option.value === model.value ? 'check' : 'blank')}
                    aria-hidden="true"
                  />
                  <span className="col">
                    <span className="nm">{option.label || option.value}</span>
                    {option.description ? <span className="note">{option.description}</span> : null}
                  </span>
                </button>
              )) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

module.exports = { ModelChoice };
