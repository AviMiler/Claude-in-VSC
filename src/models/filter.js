// Which gateway models the picker offers (PLAN.md section 3, decision 6). Pure.
// The gateway's capability flags are not reliable (DEPENDENCIES.md section 3.4), so models are
// hidden by configuration shape and by a user list, and tool support is learnt from the error.

// Models with a forced output schema (`extra_body.output_config.format`) only produce JSON titles.
function forcedFormatIds(info) {
  const ids = new Set();
  for (const entry of Array.isArray(info) ? info : []) {
    const params = (entry && entry.litellm_params) || {};
    const format = params.extra_body && params.extra_body.output_config && params.extra_body.output_config.format;
    if (format && entry.model_name) ids.add(entry.model_name);
  }
  return ids;
}

function filterModels(ids, info, denylist = []) {
  const hidden = forcedFormatIds(info);
  const denied = new Set((Array.isArray(denylist) ? denylist : []).map((s) => String(s).trim()));
  return [...new Set(ids)].filter((id) => !hidden.has(id) && !denied.has(id));
}

// The error text of a turn run on a model without tool support (DEPENDENCIES.md section 2 #29).
function isNoToolsError(text) {
  return /does not support tools/i.test(String(text || ''));
}

// The server error of a model without image support (Ollama: "missing data required for image input"; others: "vision").
function isNoVisionError(text) {
  return /image input|does not support (image|vision)|vision|multimodal|image.{0,30}not supported/i.test(String(text || ''));
}

module.exports = { filterModels, isNoToolsError, isNoVisionError };
