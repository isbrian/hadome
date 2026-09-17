const { useState, useEffect, useRef } = require('react');
const { ModelChoice } = require('./ModelChoice');
const { EffortChoice } = require('./EffortChoice');

const { ORDER, nextMode, MARK } = require('./modeCycle');

function Mode({ mode, label, labels, notes, hint, onPick, thinking, thinkingLabel, thinkingNote, onThinking, model, effort, onOpen }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const modeButtonRef = useRef(null);
  const [pickerStyle, setPickerStyle] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const fitPicker = () => {
      if (!modeButtonRef.current) return;
      const inputWrap = document.getElementById('inwrap');
      if (!inputWrap) return;
      setPickerStyle({
        maxHeight: Math.max(0, modeButtonRef.current.getBoundingClientRect().top - 8) + 'px',
        width: Math.max(260, inputWrap.getBoundingClientRect().width) + 'px',
      });
    };
    fitPicker();
    window.addEventListener('resize', fitPicker);
    return () => window.removeEventListener('resize', fitPicker);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div id="modewrap" ref={box}>
      {open ? (
        <div className="modepick" style={pickerStyle || undefined}>
          {ORDER.map((m) => (
            <button
              key={m}
              className={'modeitem mode-' + m + (m === mode ? ' now' : '')}
              onClick={() => {
                setOpen(false);
                if (m !== mode) onPick(m);
              }}
            >
              <span className={'mark codicon codicon-' + MARK[m]} aria-hidden="true" />
              <span className="col">
                <span className="nm">{(labels && labels[m]) || m}</span>
                {}
                {notes && notes[m] ? <span className="note">{notes[m]}</span> : null}
              </span>
            </button>
          ))}
          <ModelChoice model={model} />
          {effort && Array.isArray(effort.levels) && effort.levels.length ? (
            <EffortChoice effort={effort} asTabLabel={model && model.asTabLabel ? model.asTabLabel : ''} />
          ) : typeof thinking === 'boolean' ? (
            <button
              className={'modeitem thinkitem' + (thinking ? ' now' : '')}

              aria-pressed={thinking}
              onClick={() => onThinking(!thinking)}
            >
              <span
                className={'mark codicon codicon-' + (thinking ? 'check' : 'blank')}
                aria-hidden="true"
              />
              <span className="col">
                <span className="nm">{thinkingLabel}</span>
                {thinkingNote ? <span className="note">{thinkingNote}</span> : null}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        id="mode"
        ref={modeButtonRef}
        className={'iconbtn mode mode-' + mode}
        title={hint + '（' + label + '）'}
        aria-label={hint + '（' + label + '）'}
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next && onOpen) onOpen();
            return next;
          });
        }}

        tabIndex={-1}
      >
        <span className={'mark codicon codicon-' + MARK[mode]} aria-hidden="true" />

        <span className="nm">{label}</span>
      </button>
    </div>
  );
}

module.exports = { Mode, ORDER, nextMode, MARK };
