/* warmtepomp-cards v1.0.0 — bundel van heatpump-monoblock-card en heatpump-boiler-card (MIT) */
/* heatpump-monoblock-card v1.0.0 — geanimeerde monoblock-warmtepomp met buffervat, cv-pomp en vloerverdeler
 * https://github.com/AMensink/warmtepomp-cards — MIT-licentie
 * Stel je eigen entiteiten in onder `entities:` in de kaart-YAML; zie README.
 */
const HPM_DEFAULTS = {
  supply: "sensor.warmtepomp_outlet_water_temperature",
  return: "sensor.warmtepomp_inlet_water_temperature",
  ambient: "sensor.warmtepomp_ambient_temperature",
  coil: "sensor.warmtepomp_coil_temperature",
  exhaust: "sensor.warmtepomp_exhaust_temperature",
  suction: "sensor.warmtepomp_suction_temperature",
  hp_sat: "sensor.warmtepomp_high_pressure_saturation_temperature",
  internal_coil: "sensor.warmtepomp_internal_coil_temperature",
  eev: "sensor.warmtepomp_main_valve_pressure",
  flow: "sensor.warmtepomp_water_flow_rate",
  fan_hz: "sensor.warmtepomp_fan_frequency",
  comp_hz: "sensor.warmtepomp_compressor_frequency",
  compressor: "binary_sensor.warmtepomp_compressor_state",
  defrost: "binary_sensor.warmtepomp_defrost_state",
  online: "binary_sensor.warmtepomp_online_status",
  fault: "sensor.warmtepomp_fault_codes",
  power_switch: "switch.warmtepomp_power",
  setpoint: "number.warmtepomp_temperature_setpoint",
  mode: "select.warmtepomp_mode",
  work_mode: "select.warmtepomp_work_mode",
  curve: "select.warmtepomp_curve_setting",
  power: "sensor.warmtepomp_power",
  energy_today: "sensor.warmtepomp_today_s_energy",
  energy_total: "sensor.warmtepomp_total_energy",
  floor_pump: null,
  thermostat: null,
};
const HPM_MODE_NL = {
  Cooling: "Koelen", Heating: "Verwarmen", "Floor Heating": "Vloerverwarming", "Hot Water": "Warm water",
  "Cooling + Hot Water": "Koelen + warm water", "Heating + Hot Water": "Verwarmen + warm water",
  "Floor Heating + Hot Water": "Vloerverw. + warm water",
};
const HPM_WORK_NL = { ECO: "Eco", Normal: "Normaal", Boost: "Boost" };

class HeatpumpMonoblockCard extends HTMLElement {
  static getStubConfig() { return {}; }
  setConfig(config) {
    this._config = { title: "Warmtepomp", buffer_liters: 30, ...config };
    this._e = { ...HPM_DEFAULTS, ...(config.entities || {}) };
    if (this._root) this._render();
  }
  getCardSize() { return 10; }
  getGridOptions() { return { columns: "full", rows: "auto", min_columns: 6 }; }
  set hass(hass) { this._hass = hass; if (!this._root) this._render(); this._update(); }

  _st(k) { const id = this._e[k]; return id && this._hass ? this._hass.states[id] : undefined; }
  _num(k) { const s = this._st(k); if (!s) return NaN; const v = parseFloat(s.state); return Number.isFinite(v) ? v : NaN; }
  _on(k) { const s = this._st(k); if (!s) return false; return !["off", "0", "0.0", "false", "unavailable", "unknown", "none", ""].includes(String(s.state).toLowerCase()); }
  _fmt(v, d = 0) { return Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "–"; }
  _unit(k, fb = "") { const s = this._st(k); return (s && s.attributes.unit_of_measurement) || fb; }
  _room() {
    const th = this._st("thermostat"), v = th ? parseFloat(th.attributes.current_temperature) : NaN;
    return Number.isFinite(v) ? v : 20;
  }
  // blauw alleen onder de gemeten kamertemperatuur (thermostaat), daarboven warm oplopend naar rood
  _col(t) {
    const R = this._room();
    const S = t < R
      ? [[R - 10, [59, 130, 246]], [R, [110, 175, 245]]]
      : [[R, [245, 200, 90]], [Math.max(R + 6, 33), [245, 165, 60]], [Math.max(R + 12, 42), [245, 110, 40]], [Math.max(R + 20, 55), [215, 40, 40]]];
    if (!Number.isFinite(t)) return "rgb(130,135,140)";
    if (t <= S[0][0]) return `rgb(${S[0][1]})`;
    for (let i = 1; i < S.length; i++) if (t <= S[i][0]) {
      const [a, c0] = S[i - 1], [b, c1] = S[i], f = (t - a) / (b - a);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(",")})`;
    }
    return `rgb(${S[S.length - 1][1]})`;
  }
  _more(k) {
    const entityId = this._e[k]; if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }
  _pump(id, cx, cy, r, k) {
    return `<g class="click" data-k="${k}">
      <circle cx="${cx}" cy="${cy}" r="${r}" class="pumpbody" id="${id}-body"/>
      <g id="${id}" style="transform-origin:${cx}px ${cy}px;transform-box:view-box"><path d="M${cx} ${cy} l0 -${r * 0.65} M${cx} ${cy} l${r * 0.56} ${r * 0.33} M${cx} ${cy} l-${r * 0.56} ${r * 0.33}" stroke="var(--primary-text-color,#333)" stroke-width="2.2" stroke-linecap="round"/></g>
    </g>`;
  }

  _render() {
    if (!this._root) this._root = this.attachShadow({ mode: "open" });
    // vloerverwarming: meander van (430,330) naar (590,380)
    let floor = "M430 330"; for (let i = 0; i < 7; i++) { const x = 440 + i * 22; floor += ` H ${x} V ${i % 2 ? 330 : 380}`; } floor += " H 590";
    const L = (k, x, y, lbl, id, anchor = "start") =>
      `<g class="click" data-k="${k}"><text class="lbl" x="${x}" y="${y}" text-anchor="${anchor}">${lbl}</text><text class="val" x="${x}" y="${y + 17}" id="${id}" text-anchor="${anchor}">–</text></g>`;
    this._root.innerHTML = `
<style>
  :host{display:block}
  ha-card{padding:12px 12px 14px;overflow:hidden}
  .head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 6px 6px}
  .title{font-size:1.15rem;font-weight:600;color:var(--primary-text-color)}
  .status{font-size:.85rem;padding:4px 10px;border-radius:999px;background:var(--secondary-background-color,rgba(127,127,127,.15));color:var(--primary-text-color);white-space:nowrap}
  .status.heat{background:rgba(245,110,40,.18);color:rgb(230,100,30)}
  .status.cool{background:rgba(59,130,246,.16);color:rgb(59,130,246)}
  .status.defrost{background:rgba(59,130,246,.16);color:rgb(59,130,246)}
  .status.fault{background:rgba(220,40,40,.2);color:rgb(210,45,45)}
  svg{width:100%;height:auto;display:block}
  .outside{fill:rgba(90,165,240,.07)}
  .wall{fill:var(--secondary-background-color,#eee);stroke:var(--divider-color,#ccc)}
  .hatch{stroke:var(--divider-color,#bbb);stroke-width:1.5}
  .housing{fill:var(--card-background-color,#fff);stroke:var(--secondary-text-color,#999);stroke-width:2.5}
  .grille{fill:none;stroke:var(--divider-color,#ccc);stroke-width:1.5}
  .blade{fill:var(--secondary-text-color,#888)}
  .hub{fill:var(--primary-text-color,#444)}
  .comp{fill:var(--secondary-text-color,#888)}
  .led{fill:#777}
  .phe{fill:var(--secondary-background-color,#eee);stroke:var(--secondary-text-color,#999);stroke-width:1.5}
  .lbl{fill:var(--secondary-text-color,#777);font-size:11px;font-family:var(--paper-font-body1_-_font-family,sans-serif)}
  .val{fill:var(--primary-text-color,#222);font-size:15px;font-weight:600;font-family:var(--paper-font-body1_-_font-family,sans-serif)}
  .zone{fill:var(--secondary-text-color,#999);font-size:10px;letter-spacing:.12em;font-family:var(--paper-font-body1_-_font-family,sans-serif)}
  .click{cursor:pointer}
  .click:hover .val{text-decoration:underline}
  .pipe{fill:none;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;opacity:.45}
  .flow{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:2 12;opacity:0}
  .shell{fill:none;stroke:var(--secondary-text-color,#888);stroke-width:2.5}
  .big{font-size:18px;font-weight:700;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.25);stroke-width:2px}
  .sub{font-size:10px;fill:rgba(255,255,255,.95);paint-order:stroke;stroke:rgba(0,0,0,.25);stroke-width:1px}
  .rad{stroke:var(--card-background-color,#fff);stroke-width:2}
  .air{fill:none;stroke:rgba(80,150,250,.8);stroke-width:2.5;stroke-dasharray:6 8;stroke-linecap:round;opacity:0}
  .snow{opacity:0}
  .heatwave{fill:none;stroke-width:2;stroke-linecap:round;opacity:0}
  .manifold{fill:var(--secondary-background-color,#eee);stroke:var(--secondary-text-color,#888);stroke-width:2}
  .mstub{stroke:var(--secondary-text-color,#888);stroke-width:2;stroke-linecap:round}
  #fan{transform-origin:95px 175px;transform-box:view-box}
  .fan-on #fan{animation:spin var(--fan-s,1s) linear infinite}
  .fan-on .air{opacity:1;animation:dash 1s linear infinite}
  .flow-on .flow.pri{opacity:1;animation:dash var(--flow-s,1.2s) linear infinite}
  .sec-on .flow.sec{opacity:1;animation:dash 1.3s linear infinite}
  .floor-on .flow.fl{opacity:1;animation:dash 1.4s linear infinite}
  .comp-on #comp{animation:hum .18s ease-in-out infinite alternate}
  .comp-on .led{fill:rgb(60,200,90)}
  .defrost .snow{opacity:1;animation:pulse 2s ease-in-out infinite}
  .warm .heatwave.hwr{opacity:.8;animation:wave 2.4s ease-in-out infinite}
  .floor-on .heatwave.hwf{opacity:.8;animation:wave 2.4s ease-in-out infinite}
  .buf{transition:fill 1.2s ease}
  .pumpbody{fill:var(--card-background-color,#fff);stroke:var(--secondary-text-color,#888);stroke-width:2.5;transition:stroke .4s}
  .sec-on #cvpump-body,.floor-on #flpump-body{stroke:rgb(60,200,90)}
  .sec-on #cvpump{animation:spin .8s linear infinite}
  .floor-on #flpump{animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes dash{to{stroke-dashoffset:-28}}
  @keyframes hum{from{transform:translate(0,0)}to{transform:translate(.8px,-.6px)}}
  @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
  @keyframes wave{0%{transform:translateY(0);opacity:0}30%{opacity:.8}100%{transform:translateY(-16px);opacity:0}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  .chips{display:flex;flex-wrap:wrap;gap:6px;padding:6px 4px 0}
  .chip{display:flex;align-items:center;gap:6px;font-size:.8rem;padding:4px 10px;border-radius:999px;background:var(--secondary-background-color,rgba(127,127,127,.12));color:var(--secondary-text-color);cursor:pointer;user-select:none}
  .chip .dot{width:8px;height:8px;border-radius:50%;background:rgba(127,127,127,.5)}
  .chip.on{color:var(--primary-text-color)}
  .chip.on .dot{background:rgb(60,200,90);box-shadow:0 0 6px rgb(60,200,90)}
  .chip.warn.on .dot{background:rgb(220,40,40);box-shadow:0 0 6px rgb(220,40,40)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;padding:10px 4px 0}
  .stat{background:var(--secondary-background-color,rgba(127,127,127,.1));border-radius:12px;padding:8px 10px;cursor:pointer}
  .stat .k{font-size:.75rem;color:var(--secondary-text-color)}
  .stat .v{font-size:1.05rem;font-weight:600;color:var(--primary-text-color);margin-top:2px}
</style>
<ha-card>
  <div class="head"><div class="title">${this._config.title}</div><div class="status" id="status">–</div></div>
  <svg id="svg" viewBox="0 0 640 420" role="img" aria-label="Warmtepomp">
    <defs>
      <clipPath id="hpm-buf"><rect x="330" y="26" width="52" height="100" rx="22"/></clipPath>
      <linearGradient id="hpm-bufg" x1="0" y1="0" x2="0" y2="1"><stop id="b-top" offset="0"/><stop id="b-bot" offset="1"/></linearGradient>
      <linearGradient id="hpm-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".2" stop-color="#fff" stop-opacity=".25"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <rect class="outside" x="0" y="0" width="262" height="420" rx="10"/>
    <text class="zone" x="12" y="18">BUITEN</text>
    <rect class="wall" x="262" y="0" width="22" height="420"/>
    ${Array.from({ length: 22 }, (_, i) => `<line class="hatch" x1="262" y1="${i * 20}" x2="284" y2="${i * 20 + 14}"/>`).join("")}

    <!-- monoblock -->
    <rect class="housing" x="18" y="80" width="230" height="200" rx="12"/>
    <rect x="30" y="280" width="16" height="14" class="comp"/><rect x="220" y="280" width="16" height="14" class="comp"/>
    <circle class="grille" cx="95" cy="175" r="66"/><circle class="grille" cx="95" cy="175" r="48"/><circle class="grille" cx="95" cy="175" r="30"/>
    <line class="grille" x1="29" y1="175" x2="161" y2="175"/><line class="grille" x1="95" y1="109" x2="95" y2="241"/>
    <g id="fan">${[0, 120, 240].map((a) => `<path class="blade" transform="rotate(${a} 95 175)" d="M95 175 C 100 140, 128 128, 140 142 C 130 160, 112 170, 95 175 Z"/>`).join("")}<circle class="hub" cx="95" cy="175" r="9"/></g>
    <path class="air" d="M17 130 C 9 130, 9 118, 3 112"/><path class="air" d="M17 220 C 9 220, 9 232, 3 238"/>
    <g id="comp"><rect class="comp" x="176" y="118" width="40" height="78" rx="18"/><rect class="comp" x="184" y="108" width="24" height="13" rx="5"/><circle class="led" cx="196" cy="182" r="4.5"/></g>
    <rect class="phe" x="178" y="212" width="36" height="54" rx="4"/>
    ${[0, 1, 2, 3, 4].map((i) => `<line class="grille" x1="182" y1="${220 + i * 10}" x2="210" y2="${220 + i * 10}"/>`).join("")}
    <g class="snow" transform="translate(95 175)"><path d="M0 -14 V14 M-12 -7 L12 7 M-12 7 L12 -7" stroke="rgb(80,150,250)" stroke-width="3" stroke-linecap="round"/></g>
    ${L("ambient", 12, 40, "Buitenlucht", "v-amb")}
    ${L("coil", 100, 40, "Verdamper", "v-coil")}
    ${L("exhaust", 180, 40, "Persgas", "v-exh")}
    ${L("suction", 30, 300, "Zuiggas", "v-suc")}
    ${L("comp_hz", 100, 300, "Compressor", "v-comp")}
    ${L("fan_hz", 180, 300, "Ventilator", "v-fan")}
    ${L("hp_sat", 30, 350, "Condensatie", "v-hps")}
    ${L("eev", 120, 350, "Exp.ventiel", "v-eev")}

    ${L("flow", 30, 390, "Debiet", "v-flow")}
    ${L("setpoint", 120, 390, "Doel aanvoer", "v-set")}

    <!-- verdiepingsvloeren -->
    <rect x="284" y="130" width="356" height="8" fill="var(--secondary-text-color,#888)" opacity=".35"/>
    <rect x="284" y="266" width="356" height="8" fill="var(--secondary-text-color,#888)" opacity=".35"/>
    <text class="zone" x="322" y="18">ZOLDER</text>
    <text class="zone" x="322" y="154">VERDIEPING</text>
    <text class="zone" x="322" y="290">BEGANE GROND</text>

    <!-- primair: buitenunit ↔ buffervat (circulatie warmtepomp) -->
    <path class="pipe" id="p-sup" d="M214 222 H 294 V 50 H 330"/>
    <path class="flow pri" id="f-sup" d="M214 222 H 294 V 50 H 330"/>
    <path class="pipe" id="p-ret" d="M330 105 H 308 V 256 H 214"/>
    <path class="flow pri" id="f-ret" d="M330 105 H 308 V 256 H 214"/>

    <!-- buffervat op zolder -->
    <g class="click" data-k="supply">
      <g clip-path="url(#hpm-buf)"><rect class="buf" x="330" y="26" width="52" height="100" fill="url(#hpm-bufg)"/><rect x="330" y="26" width="52" height="100" fill="url(#hpm-shine)"/></g>
      <rect class="shell" x="330" y="26" width="52" height="100" rx="22"/>
      <text class="big" x="356" y="80" text-anchor="middle" id="v-buf">–</text>
      <text class="sub" x="356" y="96" text-anchor="middle">${this._config.buffer_liters} L</text>
    </g>
    ${L("supply", 440, 70, "Aanvoer", "v-sup")}
    ${L("return", 505, 70, "Retour", "v-ret")}
    ${L("dt", 570, 70, "ΔT", "v-dt")}

    <!-- secundair: stijgleidingen, aanvoer 628 / retour 606 -->
    <path class="pipe" id="p-s1" d="M382 50 H 628 V 318"/>
    <path class="flow sec" id="f-s1" d="M382 50 H 628 V 318"/>
    <path class="pipe" id="p-r1" d="M606 318 V 105 H 382"/>
    <path class="flow sec" id="f-r1" d="M606 318 V 105 H 382"/>
    <!-- cv-pomp (thermostaat) na buffervat -->
    ${this._pump("cvpump", 405, 50, 11, "thermostat")}
    <text class="lbl" x="405" y="32" text-anchor="middle">cv-pomp</text>

    <!-- verdieping: radiatoren -->
    <path class="pipe" id="p-s2" d="M628 250 H 428 V 205 H 440"/>
    <path class="flow sec" id="f-s2" d="M628 250 H 428 V 205 H 440"/>
    <path class="pipe" id="p-r2" d="M568 222 H 606"/>
    <path class="flow sec" id="f-r2" d="M568 222 H 606"/>
    <g id="rad">${Array.from({ length: 9 }, (_, i) => `<rect class="rad radcol" x="${440 + i * 14}" y="175" width="12" height="62" rx="5"/>`).join("")}</g>
    ${[460, 500, 540].map((x, i) => `<path class="heatwave hwr" id="hw${i}" d="M${x} 170 q 4 -6 0 -12 q -4 -6 0 -12" style="animation-delay:${i * .6}s"/>`).join("")}

    <!-- begane grond: vloerverwarming met eigen verdeler en pomp -->
    <path class="pipe" id="p-floor-in" d="M597 400 H 420 V 330 H 430"/>
    <path class="flow fl" id="f-floor-in" d="M597 400 H 420 V 330 H 430"/>
    <path class="pipe" id="p-floor" d="${floor}"/>
    <path class="flow fl" id="f-floor" d="${floor}"/>
    <path class="pipe" id="p-floor-out" d="M590 380 H 597"/>
    <path class="flow fl" id="f-floor-out" d="M590 380 H 597"/>
    <g class="click" data-k="floor_pump">
      <rect class="manifold" x="597" y="318" width="40" height="92" rx="5"/>
      ${[338, 356, 374, 392].map((y) => `<line class="mstub" x1="602" y1="${y}" x2="632" y2="${y}"/>`).join("")}
    </g>
    <text class="lbl" x="593" y="316" text-anchor="end">verdeler</text>
    ${this._pump("flpump", 628, 292, 9, "floor_pump")}
    <text class="lbl" x="600" y="296" text-anchor="end">vloerpomp</text>
    ${[470, 520, 570].map((x, i) => `<path class="heatwave hwf" id="hf${i}" d="M${x} 322 q 4 -6 0 -12 q -4 -6 0 -12" style="animation-delay:${i * .8 + .3}s"/>`).join("")}
  </svg>
  <div class="chips">
    <div class="chip" data-k="comp_hz" id="c-comp"><span class="dot"></span>Compressor</div>
    <div class="chip" data-k="fan_hz" id="c-fan"><span class="dot"></span>Ventilator</div>
    <div class="chip" data-k="flow" id="c-flow"><span class="dot"></span>Circulatie WP</div>
    <div class="chip" data-k="thermostat" id="c-cv"><span class="dot"></span>Cv-pomp</div>
    <div class="chip" data-k="floor_pump" id="c-floor"><span class="dot"></span>Vloerpomp</div>
    <div class="chip" data-k="defrost" id="c-def"><span class="dot"></span>Ontdooien</div>
    <div class="chip" data-k="online" id="c-on"><span class="dot"></span>Online</div>
    <div class="chip warn" data-k="fault" id="c-fault"><span class="dot"></span>Storing</div>
  </div>
  <div class="grid">
    <div class="stat" data-k="power"><div class="k">Elektrisch</div><div class="v" id="s-pw">–</div></div>
    <div class="stat" data-k="flow"><div class="k">Warmte-afgifte</div><div class="v" id="s-heat">–</div></div>
    <div class="stat" data-k="power"><div class="k">COP (actueel)</div><div class="v" id="s-cop">–</div></div>
    <div class="stat" data-k="energy_today"><div class="k">Vandaag</div><div class="v" id="s-today">–</div></div>
    <div class="stat" data-k="mode"><div class="k">Modus</div><div class="v" id="s-mode">–</div></div>
    <div class="stat" data-k="curve"><div class="k">Werkstand · stooklijn</div><div class="v" id="s-curve">–</div></div>
  </div>
</ha-card>`;
    this._root.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation(); const k = el.dataset.k; this._more(k === "dt" ? "supply" : k);
    }));
    this._$ = (id) => this._root.getElementById(id);
  }

  _update() {
    if (!this._hass || !this._root) return;
    const $ = this._$, svg = $("svg");
    const set = (id, t) => { const el = $(id); if (el && el.textContent !== t) el.textContent = t; };
    const sup = this._num("supply"), ret = this._num("return"), flow = this._num("flow");
    const compHz = this._num("comp_hz"), fanHz = this._num("fan_hz"), pw = this._num("power");
    const comp = Number.isFinite(compHz) ? compHz > 0 : this._on("compressor");
    const fan = Number.isFinite(fanHz) ? fanHz > 0 : comp;
    const flowing = Number.isFinite(flow) ? flow > 0.5 : comp;
    const defrost = this._on("defrost"), online = this._on("online");
    const faultVal = this._num("fault"), fault = Number.isFinite(faultVal) ? faultVal !== 0 : this._on("fault");
    const power = this._on("power_switch") || !this._st("power_switch");
    const modeS = this._st("mode"), mode = modeS ? modeS.state : "";
    const cooling = /cool/i.test(mode) && !/heat|water/i.test(mode);

    // cv-pomp: aan zolang de thermostaat vraagt (hvac_action heating/cooling)
    const th = this._st("thermostat");
    const act = th ? String(th.attributes.hvac_action || "").toLowerCase() : "";
    const cvOn = th ? act === "heating" || act === "cooling" : flowing;
    // vloerpomp: schakelaar of slimme stekker (optioneel)
    const floorOn = this._e.floor_pump ? this._on("floor_pump") : power;

    svg.classList.toggle("comp-on", comp);
    svg.classList.toggle("fan-on", fan);
    svg.classList.toggle("flow-on", flowing);
    svg.classList.toggle("sec-on", cvOn);
    svg.classList.toggle("floor-on", !!floorOn);
    svg.classList.toggle("defrost", defrost);
    svg.classList.toggle("warm", cvOn && !cooling && Number.isFinite(sup) && sup >= 24);
    if (fan) svg.style.setProperty("--fan-s", `${Math.max(0.35, Math.min(2.5, 40 / Math.max(fanHz || 20, 1))).toFixed(2)}s`);
    if (flowing) svg.style.setProperty("--flow-s", `${Math.max(0.5, Math.min(3, 14 / Math.max(flow || 10, 1))).toFixed(2)}s`);

    const cs = this._col(sup), cr = this._col(ret);
    for (const id of ["p-sup", "f-sup", "p-s1", "f-s1", "p-s2", "f-s2"]) $(id).style.stroke = cs;
    for (const id of ["p-ret", "f-ret", "p-r1", "f-r1", "p-r2", "f-r2"]) $(id).style.stroke = cr;
    const mid = this._col(Number.isFinite(sup) && Number.isFinite(ret) ? (sup + ret) / 2 : sup);
    for (const id of ["p-floor", "f-floor"]) $(id).style.stroke = mid;
    for (const id of ["p-floor-in", "f-floor-in"]) $(id).style.stroke = cs;
    for (const id of ["p-floor-out", "f-floor-out"]) $(id).style.stroke = cr;
    $("b-top").setAttribute("stop-color", cs); $("b-bot").setAttribute("stop-color", cr);
    this._root.querySelectorAll(".radcol").forEach((r) => (r.style.fill = mid));
    this._root.querySelectorAll(".heatwave").forEach((w) => (w.style.stroke = cs));

    const T = (v) => (Number.isFinite(v) ? `${this._fmt(v, 0)} °C` : "–");
    set("v-buf", T(sup)); set("v-sup", T(sup)); set("v-ret", T(ret));
    set("v-flow", Number.isFinite(flow) ? `${this._fmt(flow, 1)} L/min` : "–");
    set("v-amb", T(this._num("ambient"))); set("v-coil", T(this._num("coil")));
    set("v-exh", T(this._num("exhaust"))); set("v-suc", T(this._num("suction")));
    set("v-hps", T(this._num("hp_sat")));
    set("v-eev", `${this._fmt(this._num("eev"), 0)} ${this._unit("eev", "P")}`);
    set("v-comp", Number.isFinite(compHz) ? `${this._fmt(compHz, 0)} Hz` : comp ? "aan" : "uit");
    set("v-fan", Number.isFinite(fanHz) ? `${this._fmt(fanHz, 0)} Hz` : fan ? "aan" : "uit");
    set("v-set", T(this._num("setpoint")));
    const dt = sup - ret;
    set("v-dt", Number.isFinite(dt) ? `${this._fmt(dt, 1)} K` : "–");

    // warmte = debiet (L/min) / 60 × 4,186 kJ/kgK × ΔT  → kW
    const heat = Number.isFinite(flow) && Number.isFinite(dt) && flowing ? (flow / 60) * 4.186 * Math.abs(dt) : NaN;
    set("s-pw", Number.isFinite(pw) ? (pw >= 1000 ? `${this._fmt(pw / 1000, 2)} kW` : `${this._fmt(pw, 0)} W`) : "–");
    set("s-heat", Number.isFinite(heat) ? `${this._fmt(heat, 2)} kW` : "–");
    const cop = comp && Number.isFinite(heat) && pw > 150 ? heat / (pw / 1000) : NaN;
    set("s-cop", Number.isFinite(cop) && cop < 12 ? this._fmt(cop, 1) : "–");
    set("s-today", `${this._fmt(this._num("energy_today"), 2)} kWh`);
    set("s-mode", mode ? HPM_MODE_NL[mode] || mode : "–");
    const wm = this._st("work_mode"), cv = this._st("curve");
    set("s-curve", `${wm ? HPM_WORK_NL[wm.state] || wm.state : "–"} · ${cv ? cv.state : "–"}`);

    const chip = (id, on) => $(id) && $(id).classList.toggle("on", on);
    chip("c-comp", comp); chip("c-fan", fan); chip("c-flow", flowing); chip("c-cv", cvOn); chip("c-floor", !!floorOn);
    chip("c-def", defrost); chip("c-on", online); chip("c-fault", fault);

    let txt = "Stand-by", cls = "";
    if (!power) txt = "Uit";
    else if (fault) { txt = `Storing (${this._fmt(faultVal, 0)})`; cls = "fault"; }
    else if (defrost) { txt = "Ontdooien"; cls = "defrost"; }
    else if (comp && cooling) { txt = `Koelen · ${this._fmt(compHz, 0)} Hz`; cls = "cool"; }
    else if (comp) { txt = `Verwarmen · ${this._fmt(compHz, 0)} Hz`; cls = "heat"; }
    else if (flowing) txt = "Circulatie (compressor uit)";
    set("status", txt); $("status").className = `status ${cls}`;
  }
}
if (!customElements.get("heatpump-monoblock-card")) customElements.define("heatpump-monoblock-card", HeatpumpMonoblockCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "heatpump-monoblock-card"))
  window.customCards.push({ type: "heatpump-monoblock-card", name: "Warmtepomp monoblock (geanimeerd)", description: "Monoblock-buitenunit met buffervat, cv-pomp, radiatoren en vloerverwarming met verdeler" });

/* heatpump-boiler-card v1.0.0 — geanimeerde warmtepompboiler voor Home Assistant
 * https://github.com/AMensink/warmtepomp-cards — MIT-licentie
 * Stel je eigen entiteiten in onder `entities:` in de kaart-YAML; zie README.
 */
const HPB_DEFAULTS = {
  tank_temp: "sensor.boiler_inlet_water_temperature",
  setpoint: "number.boiler_water_temperature_setpoint",
  ambient: "sensor.boiler_ambient_temperature",
  coil: "sensor.boiler_coil_temperature",
  exhaust: "sensor.boiler_exhaust_temperature",
  return_gas: "sensor.boiler_return_gas_temperature",
  eev: "sensor.boiler_expansion_valve_position",
  fan: "sensor.boiler_fan_status",
  compressor: "binary_sensor.boiler_compressor",
  water_pump: "binary_sensor.boiler_water_pump",
  heater: "binary_sensor.boiler_electric_heater",
  defrost: "switch.boiler_defrost",
  power_switch: "switch.boiler_power",
  mode: "select.boiler_mode",
  fault: "sensor.boiler_fault_codes",
  online: "binary_sensor.boiler_online_status",
  runtime_defrost: "sensor.boiler_compressor_runtime_before_defrost",
  power: null,
  energy_today: null,
  energy_month: null,
};

const HPB_MODE_NL = { Standard: "Standaard", Boost: "Boost", "Electric Heater": "Elektrisch" };

class HeatpumpBoilerCard extends HTMLElement {
  static getStubConfig() { return {}; }

  setConfig(config) {
    this._config = { title: "Warmtepompboiler", min_temp: 15, ...config };
    this._e = { ...HPB_DEFAULTS, ...(config.entities || {}) };
    if (this._root) this._render();
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: "full", rows: "auto", min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._render();
    this._update();
  }

  /* ---------- helpers ---------- */
  _st(key) { const id = this._e[key]; return id && this._hass ? this._hass.states[id] : undefined; }
  _num(key) {
    const s = this._st(key);
    if (!s) return NaN;
    const v = parseFloat(s.state);
    return Number.isFinite(v) ? v : NaN;
  }
  _on(key) {
    const s = this._st(key);
    if (!s) return false;
    const v = String(s.state).toLowerCase();
    return !["off", "0", "0.0", "false", "unavailable", "unknown", "none", ""].includes(v);
  }
  _fmt(v, d = 0) { return Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "–"; }
  _unit(key, fb = "") { const s = this._st(key); return (s && s.attributes.unit_of_measurement) || fb; }

  _tempColor(t) {
    const stops = [[10, [59, 130, 246]], [28, [90, 165, 240]], [40, [245, 165, 60]], [55, [245, 110, 40]], [70, [215, 40, 40]]];
    if (!Number.isFinite(t)) return "rgb(120,130,140)";
    if (t <= stops[0][0]) return `rgb(${stops[0][1]})`;
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const f = (t - t0) / (t1 - t0);
        return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(",")})`;
      }
    }
    return `rgb(${stops[stops.length - 1][1]})`;
  }

  _moreInfo(key) {
    const entityId = this._e[key];
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  /* ---------- render ---------- */
  _render() {
    if (!this._root) this._root = this.attachShadow({ mode: "open" });
    const coilPath = (() => {
      // helix of the condenser inside the tank (x 150..270, y 380..520)
      let d = "", y = 380;
      for (let i = 0; i < 6; i++) {
        d += `${i === 0 ? "M" : "L"}150 ${y} C 190 ${y + 14}, 230 ${y + 14}, 270 ${y + 12} `;
        d += `C 230 ${y + 18}, 190 ${y + 22}, 150 ${y + 24} `;
        y += 24;
      }
      return d;
    })();

    this._root.innerHTML = `
<style>
  :host { display:block; }
  ha-card { padding: 12px 12px 14px; overflow:hidden; }
  .head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 6px 6px; }
  .title { font-size: 1.15rem; font-weight: 600; color: var(--primary-text-color); }
  .status { font-size: .85rem; padding: 4px 10px; border-radius: 999px; background: var(--secondary-background-color, rgba(127,127,127,.15)); color: var(--primary-text-color); white-space:nowrap; }
  .status.heat { background: rgba(245,110,40,.18); color: rgb(230,100,30); }
  .status.elec { background: rgba(220,40,40,.16); color: rgb(210,45,45); }
  .status.defrost { background: rgba(59,130,246,.16); color: rgb(59,130,246); }
  .status.fault { background: rgba(220,40,40,.2); color: rgb(210,45,45); }
  svg { width:100%; height:auto; display:block; max-height: 62vh; }
  .housing { fill: var(--card-background-color, #fff); stroke: var(--divider-color, #ccc); stroke-width: 2; }
  .housing2 { fill: var(--secondary-background-color, #f2f2f2); stroke: var(--divider-color, #ccc); stroke-width: 1.5; }
  .shell { fill: none; stroke: var(--secondary-text-color, #888); stroke-width: 3; }
  .insul { fill: var(--secondary-background-color, #eee); }
  .lbl { fill: var(--secondary-text-color, #777); font-size: 11px; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
  .val { fill: var(--primary-text-color, #222); font-size: 15px; font-weight: 600; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
  .click { cursor:pointer; }
  .click:hover .val { text-decoration: underline; }
  .big { font-size: 40px; font-weight: 700; fill: #fff; paint-order: stroke; stroke: rgba(0,0,0,.25); stroke-width: 2px; }
  .sub { font-size: 13px; fill: rgba(255,255,255,.95); paint-order: stroke; stroke: rgba(0,0,0,.25); stroke-width: 1.5px; }
  .fin { stroke: var(--divider-color, #bbb); stroke-width: 2; }
  .pipe-hot, .pipe-cold { fill:none; stroke-width: 6; stroke-linecap: round; }
  .pipe-hot { stroke: rgba(230,90,40,.35); }
  .pipe-cold { stroke: rgba(59,130,246,.35); }
  .flow { fill:none; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 2 12; opacity: 0; }
  .flow.hot { stroke: rgb(245,110,40); }
  .flow.cold { stroke: rgb(80,150,250); }
  .water-pipe { fill:none; stroke-width: 7; stroke-linecap: round; }
  .coil { fill:none; stroke: rgba(160,110,70,.55); stroke-width: 4; stroke-linecap: round; }
  .coil-flow { fill:none; stroke: rgb(255,170,60); stroke-width: 3; stroke-dasharray: 3 10; opacity: 0; stroke-linecap: round; }
  .element { fill: rgba(140,140,140,.7); }
  .element-glow { fill: rgb(255,60,30); opacity: 0; filter: url(#hpb-glow); }
  .bubble { fill: rgba(255,255,255,.55); opacity: 0; }
  .air { fill:none; stroke: rgba(80,150,250,.8); stroke-width: 2.5; stroke-dasharray: 6 8; stroke-linecap: round; opacity: 0; }
  .airin { stroke: rgba(150,150,150,.8); }
  .blade { fill: var(--secondary-text-color, #888); }
  .hub { fill: var(--primary-text-color, #444); }
  .comp { fill: var(--secondary-text-color, #888); }
  .comp-led { fill: #777; }
  .snow { opacity: 0; fill: rgb(80,150,250); }

  /* ---- animation states ---- */
  #fan { transform-origin: 90px 105px; transform-box: view-box; }
  .fan-on #fan { animation: spin 1.1s linear infinite; }
  .fan-fast #fan { animation-duration: .55s; }
  .fan-on .air { opacity: 1; animation: dash 1s linear infinite; }
  .comp-on .flow { opacity: 1; animation: dash 1.2s linear infinite; }
  .comp-on .coil-flow { opacity: 1; animation: dash 1.6s linear infinite; }
  .comp-on .coil { stroke: rgba(245,120,50,.8); }
  .comp-on #comp { animation: hum .18s ease-in-out infinite alternate; }
  .comp-on .comp-led { fill: rgb(60,200,90); }
  .heater-on .element-glow { opacity: .9; animation: pulse 1.4s ease-in-out infinite; }
  .heating .bubble { animation: rise 4s linear infinite; }
  .defrost .snow { opacity: 1; animation: pulse 2s ease-in-out infinite; }
  .pump-on .water-pipe.hotw { stroke-dasharray: 8 8; animation: dash 1s linear infinite; }
  #water-rect, #hot-layer { transition: height 1.2s ease, y 1.2s ease, fill 1.2s ease; }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes dash { to { stroke-dashoffset: -28; } }
  @keyframes hum { from { transform: translate(0,0); } to { transform: translate(.8px,-.6px); } }
  @keyframes pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
  @keyframes rise { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: .8; } 90% { opacity: .6; } 100% { transform: translateY(-230px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }

  .chips { display:flex; flex-wrap:wrap; gap:6px; padding: 6px 4px 0; }
  .chip { display:flex; align-items:center; gap:6px; font-size:.8rem; padding:4px 10px; border-radius:999px; background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--secondary-text-color); cursor:pointer; user-select:none; }
  .chip .dot { width:8px; height:8px; border-radius:50%; background: rgba(127,127,127,.5); }
  .chip.on { color: var(--primary-text-color); }
  .chip.on .dot { background: rgb(60,200,90); box-shadow: 0 0 6px rgb(60,200,90); }
  .chip.warn.on .dot { background: rgb(220,40,40); box-shadow: 0 0 6px rgb(220,40,40); }
  .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; padding: 10px 4px 0; }
  .stat { background: var(--secondary-background-color, rgba(127,127,127,.1)); border-radius: 12px; padding: 8px 10px; cursor:pointer; }
  .stat .k { font-size: .75rem; color: var(--secondary-text-color); }
  .stat .v { font-size: 1.05rem; font-weight: 600; color: var(--primary-text-color); margin-top: 2px; }
</style>
<ha-card>
  <div class="head">
    <div class="title">${this._config.title}</div>
    <div class="status" id="status">–</div>
  </div>
  <svg id="svg" viewBox="0 0 420 610" role="img" aria-label="Warmtepompboiler">
    <defs>
      <clipPath id="hpb-tank"><rect x="120" y="222" width="180" height="350" rx="60" ry="60"/></clipPath>
      <linearGradient id="hpb-shine" x1="0" x2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".0"/>
        <stop offset=".18" stop-color="#fff" stop-opacity=".22"/>
        <stop offset=".35" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="hpb-water" x1="0" y1="0" x2="0" y2="1">
        <stop id="g-top" offset="0" stop-color="rgb(220,60,40)"/>
        <stop id="g-mid" offset=".5" stop-color="rgb(245,120,50)"/>
        <stop id="g-bot" offset="1" stop-color="rgb(59,130,246)"/>
      </linearGradient>
      <filter id="hpb-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>

    <!-- ===== warmtepomp-module ===== -->
    <rect class="housing" x="40" y="20" width="340" height="180" rx="22"/>
    <!-- luchtrooster -->
    <g opacity=".6">${Array.from({ length: 9 }, (_, i) => `<line class="fin" x1="40" y1="${38 + i * 18}" x2="30" y2="${38 + i * 18}"/>`).join("")}</g>
    <!-- verdamper (lamellen) -->
    <rect class="housing2" x="52" y="40" width="20" height="130" rx="4"/>
    ${Array.from({ length: 12 }, (_, i) => `<line class="fin" x1="54" y1="${46 + i * 10.5}" x2="70" y2="${46 + i * 10.5}"/>`).join("")}
    <!-- ventilator -->
    <circle cx="90" cy="105" r="0" />
    <g id="fan">
      ${[0, 90, 180, 270].map((a) => `<path class="blade" transform="rotate(${a} 90 105)" d="M90 105 C 96 80, 112 72, 118 84 C 112 94, 100 100, 90 105 Z"/>`).join("")}
      <circle class="hub" cx="90" cy="105" r="7"/>
    </g>
    <circle cx="90" cy="105" r="36" fill="none" stroke="var(--divider-color,#ccc)" stroke-width="2"/>
    <!-- luchtstroom -->
    <path class="air airin" d="M8 70 H 28"/><path class="air airin" d="M8 105 H 28"/><path class="air airin" d="M8 140 H 28"/>
    <path class="air" d="M132 60 C 150 60, 150 40, 170 40"/><path class="air" d="M132 150 C 150 150, 150 170, 170 170"/>
    <!-- ontdooi-sneeuwvlok -->
    <g class="snow" transform="translate(62 186)">
      <path d="M0 -9 V9 M-8 -4.5 L8 4.5 M-8 4.5 L8 -4.5" stroke="rgb(80,150,250)" stroke-width="2.2" stroke-linecap="round"/>
    </g>
    <!-- compressor -->
    <g id="comp">
      <rect class="comp" x="262" y="70" width="46" height="86" rx="20"/>
      <rect x="270" y="60" width="30" height="14" rx="5" class="comp"/>
      <circle class="comp-led" cx="285" cy="140" r="5"/>
    </g>
    <!-- expansieventiel -->
    <g class="click" data-k="eev">
      <path d="M190 132 l10 -8 l10 8 l-10 8 z" fill="var(--secondary-text-color,#888)"/>
    </g>
    <!-- koudemiddel-leidingen in module -->
    <path class="pipe-hot" d="M285 60 V 40 H 335 V 215"/>
    <path class="flow hot" d="M285 60 V 40 H 335 V 215"/>
    <path class="pipe-cold" d="M85 215 V 185 H 200 V 140"/>
    <path class="flow cold" d="M85 215 V 185 H 200 V 140"/>
    <path class="pipe-cold" d="M200 124 V 95 H 262"/>
    <path class="flow cold" d="M200 124 V 95 H 262"/>

    <!-- waarden module -->
    <g class="click" data-k="ambient"><text class="lbl" x="4" y="226">Lucht in</text><text class="val" x="4" y="244" id="v-ambient">–</text></g>
    <g class="click" data-k="coil"><text class="lbl" x="130" y="112">Verdamper</text><text class="val" x="130" y="130" id="v-coil">–</text></g>
    <g class="click" data-k="eev"><text class="lbl" x="214" y="150">Ventiel</text><text class="val" x="214" y="168" id="v-eev">–</text></g>
    <g class="click" data-k="return_gas"><text class="lbl" x="206" y="62">Zuiggas</text><text class="val" x="206" y="80" id="v-return">–</text></g>
    <g class="click" data-k="exhaust"><text class="lbl" x="316" y="80">Persgas</text><text class="val" x="316" y="98" id="v-exhaust">–</text></g>
    <g class="click" data-k="compressor"><text class="lbl" x="262" y="176">Compressor</text><text class="val" x="262" y="192" id="v-comp">–</text></g>

    <!-- ===== tank ===== -->
    <rect class="insul" x="112" y="214" width="196" height="366" rx="66"/>
    <g clip-path="url(#hpb-tank)">
      <rect x="120" y="222" width="180" height="350" fill="rgb(59,130,246)" id="water-bg"/>
      <rect x="120" y="222" width="180" height="350" fill="url(#hpb-water)" id="water-rect"/>
      <!-- condensorspiraal -->
      <path class="coil" d="${coilPath}"/>
      <path class="coil-flow" d="${coilPath}"/>
      <!-- elektrisch element -->
      <rect class="element" x="150" y="540" width="120" height="8" rx="4"/>
      <rect class="element-glow" x="150" y="539" width="120" height="10" rx="5"/>
      <!-- bubbels -->
      ${[[165, 0], [190, 1.1], [215, 2.3], [240, .6], [260, 1.8], [178, 3.1], [228, 2.9]].map(([x, d]) => `<circle class="bubble" cx="${x}" cy="${535 - (x % 4) * 6}" r="${2 + (x % 3)}" style="animation-delay:${d}s"/>`).join("")}
      <rect x="120" y="222" width="180" height="350" fill="url(#hpb-shine)"/>
    </g>
    <rect class="shell" x="120" y="222" width="180" height="350" rx="60"/>
    <!-- koudemiddel naar spiraal -->
    <path class="pipe-hot" d="M335 215 V 370 H 270"/>
    <path class="flow hot" d="M335 215 V 370 H 270"/>
    <path class="pipe-cold" d="M150 524 H 85 V 215"/>
    <path class="flow cold" d="M150 524 H 85 V 215"/>

    <!-- tapwater -->
    <path class="water-pipe hotw" id="hotw" d="M300 250 H 395" stroke="rgb(230,80,40)"/>
    <text class="lbl" x="345" y="240">Warm tapwater</text>
    <path class="water-pipe" d="M300 548 H 395" stroke="rgb(59,130,246)"/>
    <text class="lbl" x="345" y="538">Koud in</text>

    <!-- temperatuur in tank -->
    <g class="click" data-k="tank_temp">
      <text class="big" x="210" y="318" text-anchor="middle" id="v-tank">–</text>
    </g>
    <g class="click" data-k="setpoint">
      <text class="sub" x="210" y="342" text-anchor="middle" id="v-set">doel –</text>
    </g>
    <text class="lbl" x="98" y="600" id="v-heatlbl"></text>
  </svg>

  <div class="chips">
    <div class="chip" data-k="compressor" id="c-comp"><span class="dot"></span>Compressor</div>
    <div class="chip" data-k="fan" id="c-fan"><span class="dot"></span>Ventilator</div>
    <div class="chip" data-k="water_pump" id="c-pump"><span class="dot"></span>Waterpomp</div>
    <div class="chip" data-k="heater" id="c-heater"><span class="dot"></span>Element</div>
    <div class="chip" data-k="defrost" id="c-defrost"><span class="dot"></span>Ontdooien</div>
    <div class="chip" data-k="online" id="c-online"><span class="dot"></span>Online</div>
    <div class="chip warn" data-k="fault" id="c-fault"><span class="dot"></span>Storing</div>
  </div>
  <div class="grid">
    <div class="stat" data-k="power"><div class="k">Vermogen</div><div class="v" id="s-power">–</div></div>
    <div class="stat" data-k="energy_today"><div class="k">Vandaag</div><div class="v" id="s-today">–</div></div>
    <div class="stat" data-k="energy_month"><div class="k">Deze maand</div><div class="v" id="s-month">–</div></div>
    <div class="stat" data-k="mode"><div class="k">Modus</div><div class="v" id="s-mode">–</div></div>
    <div class="stat" data-k="setpoint"><div class="k">Doeltemperatuur</div><div class="v" id="s-set">–</div></div>
    <div class="stat" data-k="runtime_defrost"><div class="k">Tot ontdooien</div><div class="v" id="s-rt">–</div></div>
  </div>
</ha-card>`;

    this._root.querySelectorAll("[data-k]").forEach((el) =>
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this._moreInfo(el.dataset.k); })
    );
    this._$ = (id) => this._root.getElementById(id);
  }

  /* ---------- update ---------- */
  _update() {
    if (!this._hass || !this._root) return;
    const $ = this._$;
    const svg = $("svg");
    const set = (id, txt) => { const el = $(id); if (el && el.textContent !== txt) el.textContent = txt; };

    const tank = this._num("tank_temp");
    const sp = this._num("setpoint");
    const minT = this._config.min_temp;
    const comp = this._on("compressor");
    const fanState = this._st("fan") ? String(this._st("fan").state).toLowerCase() : "off";
    const fan = this._on("fan");
    const heater = this._on("heater");
    const defrost = this._on("defrost");
    const pump = this._on("water_pump");
    const power = this._on("power_switch") || !this._st("power_switch");
    const faultVal = this._num("fault");
    const fault = Number.isFinite(faultVal) ? faultVal !== 0 : this._on("fault");
    const online = this._on("online");

    svg.classList.toggle("comp-on", comp);
    svg.classList.toggle("fan-on", fan);
    svg.classList.toggle("fan-fast", fan && /high|hoog|2|3/.test(fanState));
    svg.classList.toggle("heater-on", heater);
    svg.classList.toggle("defrost", defrost);
    svg.classList.toggle("pump-on", pump);
    svg.classList.toggle("heating", comp || heater);

    // tank kleur / vulling: hoe "vol" warm t.o.v. doel
    const target = Number.isFinite(sp) ? sp : 60;
    const frac = Number.isFinite(tank) ? Math.max(0.08, Math.min(1, (tank - minT) / Math.max(1, target - minT))) : 0.5;
    const top = this._tempColor(tank);
    const bot = this._tempColor(Number.isFinite(tank) ? tank - 18 * (1 - frac) - 6 : NaN);
    $("g-top").setAttribute("stop-color", top);
    $("g-mid").setAttribute("stop-color", top);
    $("g-mid").setAttribute("offset", String(Math.max(0.05, frac * 0.85)));
    $("g-bot").setAttribute("stop-color", bot);
    $("water-bg").setAttribute("fill", bot);

    set("v-tank", Number.isFinite(tank) ? `${this._fmt(tank, 0)} °C` : "–");
    set("v-set", Number.isFinite(sp) ? `doel ${this._fmt(sp, 0)} °C · ${Math.round(frac * 100)}%` : "doel –");
    set("v-ambient", `${this._fmt(this._num("ambient"), 0)} °C`);
    set("v-coil", `${this._fmt(this._num("coil"), 0)} °C`);
    set("v-exhaust", `${this._fmt(this._num("exhaust"), 0)} °C`);
    set("v-return", `${this._fmt(this._num("return_gas"), 0)} °C`);
    set("v-eev", `${this._fmt(this._num("eev"), 0)} ${this._unit("eev", "P")}`);
    set("v-comp", comp ? "aan" : "uit");

    const chip = (id, on) => $(id) && $(id).classList.toggle("on", on);
    chip("c-comp", comp); chip("c-fan", fan); chip("c-pump", pump); chip("c-heater", heater);
    chip("c-defrost", defrost); chip("c-online", online); chip("c-fault", fault);

    const pw = this._num("power");
    set("s-power", Number.isFinite(pw) ? (pw >= 1000 ? `${this._fmt(pw / 1000, 2)} kW` : `${this._fmt(pw, 0)} W`) : "–");
    set("s-today", `${this._fmt(this._num("energy_today"), 2)} kWh`);
    set("s-month", `${this._fmt(this._num("energy_month"), 1)} kWh`);
    const m = this._st("mode");
    set("s-mode", m ? (HPB_MODE_NL[m.state] || m.state) : "–");
    set("s-set", `${this._fmt(sp, 0)} °C`);
    const rt = this._num("runtime_defrost");
    set("s-rt", Number.isFinite(rt) ? (rt >= 60 ? `${Math.floor(rt / 60)} u ${Math.round(rt % 60)} min` : `${Math.round(rt)} min`) : "–");

    // status
    let txt = "Stand-by", cls = "";
    if (!power) { txt = "Uit"; }
    else if (fault) { txt = `Storing (${this._fmt(faultVal, 0)})`; cls = "fault"; }
    else if (defrost) { txt = "Ontdooien"; cls = "defrost"; }
    else if (comp && heater) { txt = "Verwarmen · warmtepomp + element"; cls = "heat"; }
    else if (comp) { txt = "Verwarmen · warmtepomp"; cls = "heat"; }
    else if (heater) { txt = "Verwarmen · elektrisch"; cls = "elec"; }
    else if (Number.isFinite(tank) && Number.isFinite(sp) && tank >= sp - 1) { txt = "Op temperatuur"; }
    const st = $("status");
    set("status", txt);
    st.className = `status ${cls}`;
  }
}

if (!customElements.get("heatpump-boiler-card")) {
  customElements.define("heatpump-boiler-card", HeatpumpBoilerCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "heatpump-boiler-card")) {
  window.customCards.push({ type: "heatpump-boiler-card", name: "Warmtepompboiler (geanimeerd)", description: "Geanimeerde doorsnede van een warmtepompboiler met live waardes" });
}
