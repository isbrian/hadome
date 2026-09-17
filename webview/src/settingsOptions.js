function modelOptions(models, current, t) {
  const list = Array.isArray(models) ? models : [];
  const options = [{ value: '', label: null, lane: null }];
  let found = current === '';
  const hasCategories = list.some((model) => model && model.category);

  if (!hasCategories) {
    for (const model of list) {
      if (!model || typeof model.slug !== 'string') continue;
      options.push({ value: model.slug, label: model.title, lane: null });
      if (model.slug === current) found = true;
    }
  } else {
    const labelFor = (model) => {
      const category = model.category;
      const suffix = category.lane === 'auto' ? `・${t('settingsPage.lane.auto')}` : '';
      return `${category.name}（${category.short}${suffix}）`;
    };
    for (const legacy of [false, true]) {
      for (const model of list) {
        if (!model || typeof model.slug !== 'string' || !model.category || !!model.category.legacy !== legacy) continue;
        const lane = typeof model.category.lane === 'string' ? model.category.lane : null;
        const describedLanes = ['auto', 'instant', 'thinking', 'pro', 'thinking_mini'];
        const description = lane && describedLanes.includes(lane) ? t('settingsPage.lane.' + lane + '.d') : null;
        options.push({
          value: model.slug,
          label: labelFor(model),
          lane,
          ...(description ? { description } : {}),
          ...(legacy ? { group: 'legacy' } : {}),
        });
        if (model.slug === current) found = true;
      }
    }
  }

  if (current && !found) options.push({ value: current, label: current, lane: null });
  return options;
}

function effortOptions(models, model, current) {
  const list = Array.isArray(models) ? models : [];
  const values = [];
  const add = (value) => {
    if (typeof value !== 'string' || values.includes(value)) return;
    values.push(value);
  };

  const selected = model ? list.find((item) => item && item.slug === model) : null;
  if (selected) {
    for (const value of Array.isArray(selected.efforts) ? selected.efforts : []) add(value);
  } else {
    for (const item of list) {
      for (const value of Array.isArray(item && item.efforts) ? item.efforts : []) add(value);
    }
  }

  if (current) add(current);
  return [{ value: '' }, ...values.map((value) => ({ value }))];
}

const api = { modelOptions, effortOptions };
if (typeof window !== 'undefined') window.BridgeSettingsOptions = api;
module.exports = api;
