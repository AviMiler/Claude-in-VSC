// Environment for starting the CLI on a chosen model. The CLI also calls the "haiku" model for
// session titles, so all three aliases point at the chosen model or the server loads a second
// model (DEPENDENCIES.md section 2 #28). Pure.

const DEFAULT_MODEL = 'default';

function modelEnv(model) {
  if (!model || model === DEFAULT_MODEL) return {};
  return {
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
  };
}

module.exports = { modelEnv, DEFAULT_MODEL };
