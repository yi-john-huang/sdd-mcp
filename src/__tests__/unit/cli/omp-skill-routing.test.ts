import { execFileSync } from 'child_process';
import { renderOmpSkillRouting } from '../../../cli/tool-support/omp-skill-routing';
import { ROLE_MODEL_ROUTES } from '../../../cli/install-target';

it('routes invoked OMP skills for the turn and restores the parent model and thinking afterward', () => {
  const routes = {
    ...ROLE_MODEL_ROUTES,
    architect: { ...ROLE_MODEL_ROUTES.architect, omp: { model: 'provider/design', thinkingLevel: 'high' } },
  };
  const extension = renderOmpSkillRouting(routes);
  // The generated extension has no stable module path until installation; load its actual emitted bytes.
  const script = `
    const factory = (await import('data:text/javascript,' + encodeURIComponent(${JSON.stringify(extension)}))).default;
    const handlers = {};
    const original = { id: 'original' };
    const target = { id: 'design' };
    let current = original;
    let thinking = 'low';
    const changes = [];
    const pi = {
      on(name, handler) { handlers[name] = handler; },
      getThinkingLevel() { return thinking; },
      async setModel(model) { current = model; changes.push(model.id); return true; },
      setThinkingLevel(level) { thinking = level; changes.push(level); },
    };
    factory(pi);
    const ctx = {
      agent: { kind: 'main' },
      models: { resolve(name) { return name === 'provider/design' ? target : undefined; }, current() { return current; } },
      ui: { notify() { throw Error('unexpected routing failure'); } },
      abort() { throw Error('unexpected abort'); },
    };
    await handlers.before_agent_start({ prompt: '[IMPORTANT: User invoked the "sdd-design" skill; follow its instructions. Full skill below.]' }, ctx);
    if (current !== target || thinking !== 'high') throw Error('skill route not applied');
    await handlers.agent_end({}, ctx);
    if (current !== original || thinking !== 'low') throw Error('parent route not restored');
    await handlers.before_agent_start({ prompt: 'ordinary user request' }, ctx);
    if (current !== original || changes.join(',') !== 'design,high,original,low') throw Error('unrelated turn rerouted');
    let notified = false;
    let aborted = false;
    ctx.ui.notify = () => { notified = true; };
    ctx.abort = () => { aborted = true; };
    await handlers.before_agent_start({ prompt: '[IMPORTANT: User invoked the "sdd-review" skill; follow its instructions. Full skill below.]' }, ctx);
    if (!notified || !aborted || current !== original || thinking !== 'low') throw Error('unavailable route fell through');
  `;
  expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', script])).not.toThrow();
});
