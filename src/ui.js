'use strict';
// ALL DOM lives here (and in index.html). The sim classes never touch the document, which
// is what lets the same files run headlessly. Builds the control panel from PARAM_SCHEMA
// and writes changes straight back into PARAMETERS.
function buildControls() {
  const panel = document.getElementById('controlPanel');
  for (const spec of PARAM_SCHEMA) {
    const wrap = document.createElement('label');
    wrap.className = 'ctl';
    wrap.appendChild(document.createTextNode(spec.label + ' '));
    const input = document.createElement('input');
    input.type = 'range';
    input.min = spec.min; input.max = spec.max; input.step = spec.step;
    input.value = PARAMETERS[spec.key];
    const val = document.createElement('span');
    val.textContent = ' ' + PARAMETERS[spec.key];
    input.oninput = function () {
      PARAMETERS[spec.key] = parseFloat(input.value);
      val.textContent = ' ' + input.value;
      if (spec.resets && typeof reset === 'function') reset();
    };
    wrap.appendChild(input);
    wrap.appendChild(val);
    panel.appendChild(wrap);
  }
}

function setStatus(msg) {
  const s = document.getElementById('status');
  if (s) s.textContent = msg;
}
