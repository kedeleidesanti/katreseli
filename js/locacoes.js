import { db, doc, addDoc, updateDoc, deleteDoc, getDoc, collection, serverTimestamp, query, where, orderBy, getDocs }
  from "./firebase.js";
import { el, gv, sv, notif, fmtR, fmtD, esc } from "./helpers.js";
import { itens, decoracoes, clientes, locacoes, cfg } from "./state.js";
import { closeModal, openModal, wizGo }           from "./navigation.js";
import { popularSelectItens, popularSelectDecs, validarQtdItem } from "./estoque.js";
import { gerarContrato }                          from "./contrato.js";
import { gerarListaSeparacao }                     from "./clientes-extra.js";
import { gerarRecibo, gerarReciboConfirmacao }     from "./recibo.js";

export let locItens = [];

// ─── CEP helpers ─────────────────────────────────────────────────────────────
const CEP_ORIGEM = "83302180";

function setCepStatus(statusId, msg, cor) {
  const e = document.getElementById(statusId); if (!e) return;
  e.style.display = msg ? "block" : "none";
  e.style.color   = cor || "var(--txt3)";
  e.textContent   = msg;
}

async function buscarViaCep(cep, onSuccess, statusId) {
  const nums = cep.replace(/\D/g, "");
  if (nums.length !== 8) { setCepStatus(statusId, "CEP invalido", "#991b1b"); return; }
  setCepStatus(statusId, "Buscando...", "var(--p)");
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${nums}/json/`);
    const data = await resp.json();
    if (data.erro) setCepStatus(statusId, "CEP nao encontrado", "#991b1b");
    else { setCepStatus(statusId, `Encontrado: ${data.localidade}/${data.uf}`, "#065f46"); onSuccess(data); }
  } catch (_) { setCepStatus(statusId, "Erro ao buscar", "#991b1b"); }
}

window.mascaraCep = function (inp) {
  let v = inp.value.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
  inp.value = v;
  if (v.replace(/\D/g, "").length === 8) window.buscarCep();
};

window.buscarCep = function () {
  const cep = (document.getElementById("cli-cep") || {}).value || "";
  buscarViaCep(cep, data => {
    sv("cli-rua", data.logradouro || ""); sv("cli-bairro", data.bairro || "");
    sv("cli-cidade", data.localidade || ""); sv("cli-uf", data.uf || "");
    const n = document.getElementById("cli-num"); if (n) setTimeout(() => n.focus(), 100);
  }, "cep-status");
};

window.buscarCepRapido = function () {
  const cep = (document.getElementById("rcli-cep") || {}).value || "";
  buscarViaCep(cep, data => {
    sv("rcli-rua", data.logradouro || ""); sv("rcli-bairro", data.bairro || "");
    sv("rcli-cidade", data.localidade || ""); sv("rcli-uf", data.uf || "");
  }, "rcli-cep-status");
};

window.mascaraCepLocal = function (inp) {
  let v = inp.value.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
  inp.value = v;
  if (v.replace(/\D/g, "").length === 8) window.buscarCepLocal();
};

window.buscarCepLocal = function () {
  const cep = (document.getElementById("loc-local-cep") || {}).value || "";
  buscarViaCep(cep, data => {
    sv("loc-local-rua", data.logradouro || ""); sv("loc-local-bairro", data.bairro || "");
    sv("loc-local-cidade", data.localidade || ""); sv("loc-local-uf", data.uf || "");
  }, "loc-local-cep-status");
};

// ─── Cálculo de KM de entrega ─────────────────────────────────────────────────
window.calcKmEntrega = async function () {
  const cepDest = (document.getElementById("loc-entrega-cep") || {}).value || "";
  const cepNums = cepDest.replace(/\D/g, "");
  const pkm     = parseFloat((document.getElementById("loc-entrega-pkm") || {}).value) || 4;
  if (cepNums.length !== 8) return;

  const info = document.getElementById("loc-entrega-info");
  if (info) { info.style.display = ""; info.textContent = "Calculando distancia..."; }

  try {
    const r1 = await fetch(`https://viacep.com.br/ws/${CEP_ORIGEM}/json/`).then(r => r.json());
    const r2 = await fetch(`https://viacep.com.br/ws/${cepNums}/json/`).then(r => r.json());
    if (r2.erro) { if (info) { info.textContent = "CEP nao encontrado."; info.style.display = ""; } return; }

    const q1 = encodeURIComponent(`${r1.logradouro || ""} ${r1.localidade} ${r1.uf} Brazil`);
    const q2 = encodeURIComponent(`${r2.logradouro || ""} ${r2.localidade} ${r2.uf} Brazil`);
    const g1 = await fetch(`https://nominatim.openstreetmap.org/search?q=${q1}&format=json&limit=1`, { headers: { "User-Agent": "katreseli" } }).then(r => r.json());
    const g2 = await fetch(`https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1`, { headers: { "User-Agent": "katreseli" } }).then(r => r.json());

    if (!g1.length || !g2.length) {
      if (info) { info.textContent = "Nao foi possivel calcular. Insira km manualmente."; info.style.display = ""; }
      return;
    }

    const [lat1, lon1] = [parseFloat(g1[0].lat), parseFloat(g1[0].lon)];
    const [lat2, lon2] = [parseFloat(g2[0].lat), parseFloat(g2[0].lon)];

    // Calcular distância real por estrada via OSRM (OpenStreetMap Routing)
    let km;
    try {
      const osrm = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`,
        { headers: { "User-Agent": "katreseli" } }
      ).then(r => r.json());
      if (osrm?.routes?.[0]?.distance) {
        km = Math.round(osrm.routes[0].distance / 1000 * 10) / 10; // metros → km
      } else {
        throw new Error("sem rota");
      }
    } catch(_) {
      // Fallback: Haversine (linha reta) se OSRM falhar
      const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
      km = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
    }
    const totalEnt = Math.round(km * pkm * 100) / 100;

    sv("loc-entrega-km",  km.toFixed(1));
    sv("loc-entrega-val", totalEnt.toFixed(2));
    sv("loc-entrega-val-hidden", totalEnt.toFixed(2));
    if (info) {
      info.innerHTML = `<i class="ti ti-route"></i> <strong>${km}km</strong> por estrada &bull; R$${pkm.toFixed(2)}/km &bull; Total: <strong>R$${totalEnt.toFixed(2)}</strong> &bull; ${r2.localidade}/${r2.uf}`;
      info.style.display = "";
    }
    calcTotal();
  } catch (_) {
    if (info) { info.textContent = "Erro ao calcular. Insira km manualmente."; info.style.display = ""; }
  }
};

window.calcKmManual = function () {
  const km  = parseFloat((document.getElementById("loc-entrega-km")  || {}).value) || 0;
  const pkm = parseFloat((document.getElementById("loc-entrega-pkm") || {}).value) || 4;
  const val = (Math.round(km * pkm * 100) / 100).toFixed(2);
  sv("loc-entrega-val", val);
  sv("loc-entrega-val-hidden", val);
  calcTotal();
};

// ─── Calendário range ─────────────────────────────────────────────────────────
const MESES_CAL = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_S    = ["D","S","T","Q","Q","S","S"];
let _calR = { mes: new Date().getMonth(), ano: new Date().getFullYear(), ret: null, dev: null };
window._calR = _calR;

function initCalRange() {
  const n = new Date();
  // Atualizar PROPRIEDADES (não criar novo objeto — mantém referência do window._calR)
  _calR.mes = n.getMonth();
  _calR.ano = n.getFullYear();
  _calR.ret = null;
  _calR.dev = null;
  sv("loc-ret", ""); sv("loc-dev", "");
  const ir = document.getElementById("loc-ret-input"); if (ir) { ir.value = ""; }
  const id_ = document.getElementById("loc-dev-input"); if (id_) { id_.value = ""; }
  renderCalRange();
}

window.renderCalRange = renderCalRange;
function renderCalRange() {
  const hdr = document.getElementById("cal-range-hdr");
  const bod = document.getElementById("cal-range-body");
  const lbl = document.getElementById("cal-range-label");
  if (!bod) return;

  if (lbl) lbl.textContent = `${MESES_CAL[_calR.mes]} ${_calR.ano}`;
  if (hdr) hdr.innerHTML = DIAS_S.map(d => `<div class="cal-hdr">${d}</div>`).join("");

  const prim = new Date(_calR.ano, _calR.mes, 1).getDay();
  const tot  = new Date(_calR.ano, _calR.mes + 1, 0).getDate();
  const hoje = new Date().toISOString().split("T")[0];
  let cells  = Array(prim).fill('<div class="cal-day empty"></div>').join("");

  for (let d = 1; d <= tot; d++) {
    const ds  = `${_calR.ano}-${String(_calR.mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    let cls   = "cal-day";
    if (ds === hoje) cls += " today";
    if (_calR.ret && _calR.dev) {
      if (ds === _calR.ret && ds === _calR.dev) cls += " range-start range-end";
      else if (ds === _calR.ret) cls += " range-start";
      else if (ds === _calR.dev) cls += " range-end";
      else if (ds > _calR.ret && ds < _calR.dev) cls += " range-mid";
    } else if (_calR.ret && ds === _calR.ret) cls += " range-start";
    cells += `<div class="${cls}" data-ds="${ds}" onclick="clicCalRange(this)">${d}</div>`;
  }
  bod.innerHTML = cells;

  const info = document.getElementById("cal-range-info");
  if (info) {
    let chips = "";
    if (_calR.ret) chips += `<div class="cal-range-chip ret"><i class="ti ti-arrow-up-right"></i> Retirada: ${fmtD(_calR.ret)}</div>`;
    if (_calR.dev) chips += `<div class="cal-range-chip dev"><i class="ti ti-arrow-down-left"></i> Devolução: ${fmtD(_calR.dev)}</div>`;
    if (_calR.ret && _calR.dev) {
      const dias = Math.round((new Date(_calR.dev) - new Date(_calR.ret)) / (1000*60*60*24));
      chips += `<div class="cal-range-chip dias"><i class="ti ti-clock"></i> ${dias} dia${dias !== 1 ? "s" : ""}</div>`;
    }
    info.innerHTML = chips || '<span style="font-size:12px;color:var(--txt3)">Clique para selecionar a retirada</span>';
  }
  const ri = document.getElementById("loc-ret-input"); if (ri) ri.value = _isoParaBr(_calR.ret);
  const di = document.getElementById("loc-dev-input"); if (di) di.value = _isoParaBr(_calR.dev);
}

window.clicCalRange = function (dayEl) {
  const ds = dayEl.dataset.ds;
  if (!_calR.ret || (_calR.ret && _calR.dev)) { _calR.ret = ds; _calR.dev = null; sv("loc-ret", ds); sv("loc-dev", ""); }
  else { if (ds < _calR.ret) { _calR.dev = _calR.ret; _calR.ret = ds; } else _calR.dev = ds; sv("loc-ret", _calR.ret); sv("loc-dev", _calR.dev); }
  renderCalRange();
  if (_calR.ret && _calR.dev) {
    popularSelectItens(_calR.ret, _calR.dev);
    popularSelectDecs(_calR.ret,  _calR.dev);
  }
};
window.calRangePrev = function () { _calR.mes--; if (_calR.mes < 0)  { _calR.mes = 11; _calR.ano--; } renderCalRange(); };
window.calRangeNext = function () { _calR.mes++; if (_calR.mes > 11) { _calR.mes = 0;  _calR.ano++; } renderCalRange(); };

// Máscara e conversão para campos de data texto (dd/mm/aaaa ↔ yyyy-mm-dd)
window._maskData = function(input, tipo) {
  let v = input.value.replace(/\D/g, "").slice(0, 8);
  if (v.length >= 5) v = v.slice(0,2) + "/" + v.slice(2,4) + "/" + v.slice(4);
  else if (v.length >= 3) v = v.slice(0,2) + "/" + v.slice(2);
  input.value = v;
  if (v.length === 10) {
    const [d, m, y] = v.split("/");
    const iso = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) window.setDataManual(tipo, iso);
  }
};

// Sync visual: yyyy-mm-dd → dd/mm/aaaa para os inputs de texto
function _isoParaBr(iso) {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

window.setDataManual = function (tipo, valor) {
  if (!valor) return;
  if (tipo === "ret") {
    _calR.ret = valor;
    if (_calR.dev && _calR.dev < valor) { _calR.dev = null; sv("loc-dev", ""); const di = document.getElementById("loc-dev-input"); if (di) di.value = ""; }
    sv("loc-ret", valor);
    const d = new Date(valor + "T12:00:00"); _calR.mes = d.getMonth(); _calR.ano = d.getFullYear();
  } else {
    if (_calR.ret && valor < _calR.ret) { notif("Devolução deve ser apos a retirada!", true); const di = document.getElementById("loc-dev-input"); if (di) di.value = ""; return; }
    _calR.dev = valor; sv("loc-dev", valor);
  }
  renderCalRange();
};

// ─── Local do evento ──────────────────────────────────────────────────────────
window.setLocalOpt = function (tipo, btn) {
  document.querySelectorAll(".loc-local-opt").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
  const eCli   = document.getElementById("local-cli-end");
  const eOutro = document.getElementById("local-outro-form");
  if (tipo === "cli") { if (eCli) eCli.style.display = ""; if (eOutro) eOutro.style.display = "none"; window.onSelecionarCliente(); }
  else { if (eCli) eCli.style.display = "none"; if (eOutro) eOutro.style.display = ""; }
};

window.onSelecionarCliente = function () {
  const cliId = gv("loc-cli");
  const card  = document.getElementById("loc-cli-card");
  const txt   = document.getElementById("local-cli-end-txt");
  if (!cliId) { if (card) card.style.display = "none"; if (txt) { txt.textContent = "Selecione um cliente para ver o endereco"; txt.style.color = "var(--txt3)"; } return; }
  const c = clientes.find(x => x.id === cliId); if (!c) return;
  if (card) card.style.display = "";
  const nEl = document.getElementById("loc-cli-nome"); if (nEl) nEl.textContent = c.nome || "";
  const iEl = document.getElementById("loc-cli-info"); if (iEl) iEl.textContent = [c.tel, c.email].filter(Boolean).join(" | ") || "";
  if (txt) { const pts = [c.rua ? (c.rua + (c.num ? " " + c.num : "")) : "", c.bairro || "", c.cidade ? (c.cidade + (c.uf ? "/" + c.uf : "")) : ""].filter(Boolean); const end = pts.join(" | ") || c.end || ""; txt.textContent = end || "Cliente sem endereco cadastrado"; txt.style.color = end ? "var(--txt)" : "var(--txt3)"; }
};

function montarLocalFinal() {
  const opt  = document.querySelector(".loc-local-opt.on");
  const tipo = opt ? opt.id : "local-opt-cli";
  if (tipo === "local-opt-cli") {
    const c = clientes.find(x => x.id === gv("loc-cli"));
    if (c) { const pts = [c.rua ? (c.rua + (c.num ? " " + c.num : "")) : "", c.bairro || "", c.cidade ? (c.cidade + (c.uf ? "/" + c.uf : "")) : ""].filter(Boolean); sv("loc-local", pts.join(", ") || c.end || ""); }
  } else {
    const rua = gv("loc-local-rua"), num = gv("loc-local-num"), comp = gv("loc-local-comp"),
          bairro = gv("loc-local-bairro"), cidade = gv("loc-local-cidade"), uf = gv("loc-local-uf"), cep = gv("loc-local-cep");
    sv("loc-local", [rua + (num ? " " + num : "") + (comp ? " - " + comp : ""), bairro, cidade + (uf ? "/" + uf : ""), cep].filter(Boolean).join(", "));
  }
}

// ─── Entrega toggle ───────────────────────────────────────────────────────────
window.toggleEntrega = function () {
  const chk  = document.getElementById("loc-entrega-chk");
  const form = document.getElementById("loc-entrega-form");
  const off  = document.getElementById("loc-entrega-off");
  if (!chk) return;
  if (form) form.style.display = chk.checked ? "" : "none";
  if (off)  off.style.display  = chk.checked ? "none" : "";
  if (!chk.checked) { const v = document.getElementById("loc-entrega-val"); if (v) v.value = ""; sv("loc-entrega-val-hidden", "0"); const inf = document.getElementById("loc-entrega-cep-info"); if (inf) inf.style.display = "none"; }
  else preencherCepEntregaDoLocal();
  calcTotal();
};

function preencherCepEntregaDoLocal() {
  const cepInp  = document.getElementById("loc-entrega-cep");
  const infoDiv = document.getElementById("loc-entrega-cep-info");
  const optAtiva = document.querySelector(".loc-local-opt.on");
  const tL = optAtiva ? optAtiva.id : "";
  let cepEnc = "", descEnc = "";
  if (tL === "local-opt-cli") { const c = clientes.find(x => x.id === gv("loc-cli")); if (c && c.cep) { cepEnc = c.cep; const pts = [c.rua, c.bairro, c.cidade + (c.uf ? "/" + c.uf : "")].filter(Boolean); descEnc = "End. do cliente: " + (pts.join(", ") || c.end || c.cep); } }
  else if (tL === "local-opt-outro") { const cepO = gv("loc-local-cep"), ruaO = gv("loc-local-rua"), cidO = gv("loc-local-cidade"); if (cepO) { cepEnc = cepO; descEnc = "Local do evento: " + [ruaO, cidO].filter(Boolean).join(", "); } }
  if (cepEnc) { if (cepInp) cepInp.value = cepEnc; if (infoDiv) { infoDiv.style.background = "var(--pl)"; infoDiv.style.color = "var(--pd)"; infoDiv.textContent = descEnc; infoDiv.style.display = ""; } window.calcKmEntrega(); }
  else if (infoDiv) { infoDiv.style.background = "var(--bg)"; infoDiv.style.color = "var(--txt2)"; infoDiv.textContent = "Informe o CEP de entrega abaixo"; infoDiv.style.display = ""; }
}

// ─── Tipo de evento ───────────────────────────────────────────────────────────
window.addTipoEvento = function () {
  const val = (document.getElementById("novo-tipo-evento") || {}).value;
  if (!val || !val.trim()) return;
  const s = document.getElementById("loc-evento"); if (!s) return;
  const existe = Array.from(s.options).some(o => o.value === val.trim());
  if (!existe) { const opt = document.createElement("option"); opt.value = val.trim(); opt.textContent = val.trim(); s.insertBefore(opt, s.options[s.options.length - 1]); }
  s.value = val.trim();
  document.getElementById("novo-tipo-evento").value = "";
  closeModal("modal-tipo-evento");
  notif("Tipo de evento adicionado!");
};

// ─── Cálculos de total / saldo ────────────────────────────────────────────────
export function calcTotal() {
  const totalItens = locItens.filter(x => x.tipo !== "kit").reduce((a, b) => a + (b.preco || 0) * b.qtd, 0);
  let totalMont = 0;
  if (gv("loc-tipo") === "montagem") {
    totalMont = (parseFloat(gv("loc-horas")) || 0) * (parseFloat(gv("loc-vh")) || 0);
  }
  const chkEnt = document.getElementById("loc-entrega-chk");
  const entregaHidden = parseFloat(gv("loc-entrega-val-hidden") || gv("loc-entrega-val")) || 0;
  const totalEntrega = (chkEnt && chkEnt.checked)
    ? entregaHidden
    : (window._pendingEntrega || entregaHidden > 0)
      ? (entregaHidden || window._pendingEntregaVal || 0)
      : 0;
  const total = totalItens + totalMont + totalEntrega;
  sv("loc-total", total.toFixed(2));
  if (el("loc-total-display")) el("loc-total-display").textContent = fmtR(total);
}
window.calcTotal = calcTotal;

export function calcSaldo() {
  // loc-total já contém o valor FINAL (com desconto aplicado pelo calcDesc)
  // Nunca subtrair desc novamente — evita desconto duplo
  const total   = parseFloat(gv("loc-total")) || 0;
  const entrada = parseFloat(gv("loc-entrada")) || 0;
  const saldo   = Math.max(0, total - entrada);
  if (el("saldo-entrada"))  el("saldo-entrada").textContent  = fmtR(entrada);
  if (el("saldo-restante")) {
    el("saldo-restante").textContent = (total > 0 && saldo <= 0) ? "Pago" : fmtR(saldo);
    el("saldo-restante").style.color = (total > 0 && saldo <= 0) ? "#166534" : "#9a3412";
  }
}
window.calcSaldo = calcSaldo;

window.calcDesc = function () {
  const baseItens = locItens.filter(x => x.tipo !== "kit").reduce((a, b) => a + (b.preco || 0) * b.qtd, 0);
  const baseMont  = (parseFloat(gv("loc-horas")) || 0) * (parseFloat(gv("loc-vh")) || 0);
  const chkEnt    = document.getElementById("loc-entrega-chk");
  const entrega   = (chkEnt && chkEnt.checked) ? (parseFloat(gv("loc-entrega-val-hidden") || gv("loc-entrega-val")) || 0) : 0;
  const base      = baseItens + baseMont + entrega;
  const desc      = parseFloat(gv("loc-desc")) || 0;
  const total     = Math.max(0, base - desc);
  sv("loc-total", total.toFixed(2));
  if (el("total-desc")) el("total-desc").textContent = fmtR(total);

  // Recalcular entrada (50%) e saldo com base no novo total com desconto
  const metade = Math.round(total * 0.5 * 100) / 100;
  sv("loc-entrada", metade > 0 ? metade.toFixed(2) : "0");
  if (el("saldo-entrada"))  el("saldo-entrada").textContent  = fmtR(metade);
  if (el("total-desc"))     el("total-desc").textContent     = fmtR(total);

  calcSaldo();
};

// ─── Itens na locação ─────────────────────────────────────────────────────────
window.toggleTipo = function () {
  const tipo = gv("loc-tipo");
  const mont = tipo === "montagem";
  const entr = tipo === "entrega";
  if (el("loc-s-itens")) el("loc-s-itens").style.display = "";
  if (el("loc-s-mont"))  el("loc-s-mont").style.display  = mont ? "" : "none";

  // Ativar/desativar toggle de entrega automaticamente
  const chkEnt = document.getElementById("loc-entrega-chk");
  if (chkEnt) {
    if (entr && !chkEnt.checked) {
      chkEnt.checked = true;
      chkEnt.dispatchEvent(new Event("change"));
    } else if (!entr && chkEnt.checked) {
      chkEnt.checked = false;
      chkEnt.dispatchEvent(new Event("change"));
    }
  }

  // Quando o toggle ainda não está visível (step 2 ativo, toggle no step 1),
  // marcar um flag para ativar quando o step 1 aparecer
  window._pendingEntrega = entr;

  calcTotal();
};

window.addItemLoc = function () {
  const id  = gv("loc-item-sel"); if (!id) return;
  const i   = itens.find(x => x.id === id); if (!i) return;
  const ret = gv("loc-ret"), dev = gv("loc-dev");
  const ex  = locItens.find(x => x.id === id && x.tipo === "item");
  const qtdAtual = ex ? ex.qtd : 0;
  const check = validarQtdItem(id, qtdAtual + 1, ret, dev, locItens);
  if (!check.ok) { notif(check.msg, true); return; }
  if (ex) ex.qtd++;
  else locItens.push({ id, nome: i.nome, preco: i.aluguel || 0, custo: i.custo || 0, qtd: 1, tipo: "item" });
  renderLocItens(); sv("loc-item-sel", "");
};

window.addDecLoc = function () {
  const id = gv("loc-dec-sel"); if (!id) return;
  const d  = decoracoes.find(x => x.id === id); if (!d) return;

  // Calcular fator de desconto proporcional
  const valorCheio  = (d.itensInclusos || []).reduce((a, b) => a + (b.aluguel || 0) * (b.qtd || 1), 0);
  const valorFinal  = d.valorTotal || valorCheio;
  const fatorDesc   = valorCheio > 0 ? valorFinal / valorCheio : 1;
  const temDesc     = (d.desconto || 0) > 0;

  // Distribuir desconto sem perda de arredondamento
  let totalDistribuido = 0;
  const novosItens = (d.itensInclusos || []).map((di, idx, arr) => {
    let precoComDesc;
    if (idx === arr.length - 1) {
      // Último item absorve a diferença de arredondamento
      precoComDesc = Math.round((valorFinal - totalDistribuido) * 100) / 100 / (di.qtd || 1);
    } else {
      precoComDesc = Math.round((di.aluguel || 0) * fatorDesc * 100) / 100;
      totalDistribuido += precoComDesc * (di.qtd || 1);
    }
    return { id: di.id, nome: di.nome, preco: precoComDesc, precoOriginal: di.aluguel || 0,
             custo: 0, qtd: di.qtd || 1, tipo: "item", kitId: id };
  });
  novosItens.forEach(ni => {
    const ex = locItens.find(x => x.id === ni.id && x.tipo === "item" && x.kitId === id);
    if (ex) ex.qtd += ni.qtd;
    else locItens.push(ni);
  });

  // Linha de kit (informativa, preco 0 pois já está distribuído)
  const labelDesc = temDesc ? ` (desc. ${fmtR(d.desconto)})` : "";
  locItens.push({ id, nome: "[Kit] " + d.nome + labelDesc, preco: 0, custo: 0, qtd: 1, tipo: "kit" });
  renderLocItens();
  sv("loc-dec-sel", "");
};

function renderLocItens() {
  const div  = el("loc-it-lista"); if (!div) return;
  const real = locItens.filter(x => x.tipo !== "kit");
  div.innerHTML = "";

  if (!real.length) {
    const emp = document.createElement("div");
    emp.style.cssText = "font-size:12px;color:var(--txt3);padding:10px;text-align:center;border:1.5px dashed var(--bdr2);border-radius:9px";
    emp.textContent = "Nenhum item adicionado";
    div.appendChild(emp);
    const lw = el("loc-limpar-wrap"); if (lw) lw.style.display = "none";
    calcTotal(); return;
  }
  const lw = el("loc-limpar-wrap"); if (lw) lw.style.display = "";

  locItens.forEach((it, i) => {
    if (it.tipo === "kit") {
      const k = document.createElement("div");
      k.style.cssText = "font-size:11px;color:var(--txt2);padding:4px 8px;background:var(--bg);border-radius:7px;margin-bottom:4px;border:1px solid var(--bdr)";
      k.innerHTML = `<i class="ti ti-balloon"></i> ${it.nome}`;
      div.appendChild(k); return;
    }
    const row   = document.createElement("div"); row.className = "item-row";
    const nm    = document.createElement("span"); nm.className = "item-row-name"; nm.textContent = it.nome;
    const bMinus = document.createElement("button"); bMinus.className = "qbtn"; bMinus.textContent = "-";
    bMinus.addEventListener("click", (() => idx => () => window.qloc(idx, -1))()(i));
    const qtd   = document.createElement("span"); qtd.className = "item-row-qtd"; qtd.textContent = it.qtd;
    const bPlus = document.createElement("button"); bPlus.className = "qbtn"; bPlus.textContent = "+";
    bPlus.addEventListener("click", (() => idx => () => window.qloc(idx, 1))()(i));
    const preco = document.createElement("span"); preco.className = "item-row-preco";
    const temDescKit = it.precoOriginal && Math.abs(it.preco - it.precoOriginal) > 0.01;
    preco.innerHTML = temDescKit
      ? `<span style="text-decoration:line-through;font-size:10px;color:var(--txt3);display:block">${fmtR(it.precoOriginal * it.qtd)}</span><span style="color:#059669;font-weight:700">${fmtR(it.preco * it.qtd)}</span>`
      : fmtR(it.preco * it.qtd);
    const bDel  = document.createElement("button"); bDel.className = "qbtn"; bDel.style.color = "#991b1b"; bDel.style.borderColor = "#fca5a5";
    bDel.innerHTML = '<i class="ti ti-x"></i>';
    bDel.addEventListener("click", (() => idx => () => window.rloc(idx))()(i));
    row.append(nm, bMinus, qtd, bPlus, preco, bDel);
    div.appendChild(row);
  });
  calcTotal();
  _verificarConflitosCarrinho();
}

// ─── Verificar conflitos em tempo real no carrinho ────────────────────────────
function _verificarConflitosCarrinho() {
  const banner  = document.getElementById("loc-conflito-banner");
  const detalhe = document.getElementById("loc-conflito-detalhe");
  if (!banner || !detalhe) return;

  const ret = gv("loc-ret"), dev = gv("loc-dev");
  if (!ret || !dev) { banner.style.display = "none"; return; }

  const conflitos = [];
  const itensSemKit = locItens.filter(x => x.tipo !== "kit");
  const qtdCarrinho = {};
  for (const it of itensSemKit) {
    qtdCarrinho[it.id] = (qtdCarrinho[it.id] || 0) + it.qtd;
  }

  for (const [itemId, qtdReq] of Object.entries(qtdCarrinho)) {
    const item = itens.find(x => x.id === itemId);
    if (!item) continue;
    const comprometido = window._estoque?.qtdComprometida(itemId, ret, dev) || 0;
    const estoque      = item.qtd || 1;
    const disponivel   = Math.max(0, estoque - comprometido);
    if (qtdReq > disponivel) {
      const locConflito = locacoes
        .filter(l => l.status !== "devolvido" && l.status !== "cancelado"
          && l.retirada && l.devolucao
          && l.retirada <= dev && l.devolucao >= ret
          && (l.itens||[]).some(i => i.id === itemId && i.tipo !== "kit"))
        .map(l => {
          const c = clientes.find(x => x.id === l.clienteId);
          return c?.nome || l.nomeCliente || "outro cliente";
        });
      conflitos.push({
        nome: item.nome,
        solicitado: qtdReq,
        disponivel,
        estoque,
        quem: [...new Set(locConflito)]
      });
    }
  }

  if (!conflitos.length) { banner.style.display = "none"; return; }

  banner.style.display = "";
  detalhe.innerHTML = conflitos.map(c => {
    const quem = c.quem.length
      ? ` — em uso: <strong>${c.quem.slice(0,2).join(", ")}${c.quem.length>2?" e outros":""}</strong>`
      : "";
    return `<div style="margin-top:3px">🔴 <strong>${c.nome}</strong>: precisa ${c.solicitado}, disponível ${c.disponivel}/${c.estoque}${quem}</div>`;
  }).join("");
}


window.qloc = function(i, d) {
  if (d > 0) {
    const it  = locItens[i]; if (!it) return;
    const ret = gv("loc-ret"), dev = gv("loc-dev");
    const check = validarQtdItem(it.id, it.qtd + 1, ret, dev, locItens);
    if (!check.ok) { notif(check.msg, true); return; }
  }
  locItens[i].qtd = Math.max(1, (locItens[i].qtd || 1) + d);
  renderLocItens();
};
window.rloc = (i) => { locItens.splice(i, 1); renderLocItens(); };

window.limparLocItens = async function() {
  if (!await window.confirmar({ titulo: "Limpar itens", msg: "Remover todos os itens e kits desta locação?", tipo: "danger", labelOk: "Limpar tudo" })) return;
  locItens.length = 0;
  renderLocItens();
  notif("Itens removidos");
};

window.selPgto = function (valor, btn) {
  document.querySelectorAll(".pgto-btn").forEach(b => b.classList.remove("sel"));
  if (btn) btn.classList.add("sel");
  sv("loc-pgto", valor);
  calcSaldo();
};

// ─── Abrir formulário de locação ──────────────────────────────────────────────
window.abrirLocacao = function () {
  locItens.length = 0;
  ["loc-tipo","loc-cli","loc-ret","loc-dev","loc-evento","loc-local","loc-obs",
   "loc-horas","loc-vh","loc-desc-mont","loc-desc","loc-entrada","loc-pgto"].forEach(id => sv(id, ""));
  sv("loc-tipo", "aluguel"); sv("loc-total", "0"); sv("loc-desc", "0"); sv("loc-vh", "100");
  if (el("loc-total-display")) el("loc-total-display").textContent = "R$0,00";
  document.querySelectorAll("input[name='pgto']").forEach(r => r.checked = false);
  document.querySelectorAll(".pgto-opt").forEach(o => o.classList.remove("sel"));
  if (el("saldo-entrada"))  el("saldo-entrada").textContent  = "R$0,00";
  if (el("saldo-restante")) el("saldo-restante").textContent = "R$0,00";
  if (el("total-desc"))     el("total-desc").textContent     = "R$0,00";
  renderLocItens();
  window.toggleTipo();
  // Campo de busca de cliente (não precisa preencher — busca é dinâmica)
  const scSearch = el("loc-cli-search"); if (scSearch) scSearch.value = ""; el("loc-cli") && (el("loc-cli").value = "");
  // Selects populados pelo módulo de estoque (mostra disponibilidade pelas datas)
  popularSelectItens(gv("loc-ret"), gv("loc-dev"));
  popularSelectDecs(gv("loc-ret"),  gv("loc-dev"));
  initCalRange();
  // Atualizar selects sempre que as datas forem confirmadas no calendar
  wizGo(1);
  openModal("modal-loc");
};

// ─── Cancelar / limpar ────────────────────────────────────────────────────────
window.cancelarLoc = function () {
  locItens.length = 0;
  ["loc-tipo","loc-cli","loc-ret","loc-dev","loc-evento","loc-local","loc-obs","loc-horas","loc-vh",
   "loc-desc-mont","loc-desc","loc-entrada","loc-pgto","loc-entrega-cep","loc-entrega-km","loc-entrega-val","loc-entrega-end"]
    .forEach(id => sv(id, ""));
  sv("loc-tipo", "aluguel"); sv("loc-total", "0"); sv("loc-desc", "0");
  if (el("loc-total-display")) el("loc-total-display").textContent = "R$0,00";
  if (el("loc-it-lista"))      el("loc-it-lista").innerHTML        = "";
  if (el("saldo-entrada"))     el("saldo-entrada").textContent     = "R$0,00";
  if (el("saldo-restante"))    el("saldo-restante").textContent    = "R$0,00";
  if (el("total-desc"))        el("total-desc").textContent        = "R$0,00";
  document.querySelectorAll(".pgto-btn").forEach(b => b.classList.remove("sel"));
  const chkEnt = document.getElementById("loc-entrega-chk"); if (chkEnt) chkEnt.checked = false;
  const entForm = document.getElementById("loc-entrega-form"); if (entForm) entForm.style.display = "none";
  const entOff  = document.getElementById("loc-entrega-off");  if (entOff)  entOff.style.display  = "";
  const entInfo = document.getElementById("loc-entrega-info"); if (entInfo) entInfo.style.display = "none";
  const entCepInfo = document.getElementById("loc-entrega-cep-info"); if (entCepInfo) entCepInfo.style.display = "none";
  ["loc-local-cep","loc-local-rua","loc-local-num","loc-local-bairro","loc-local-comp","loc-local-cidade","loc-local-uf"].forEach(id => sv(id, ""));
  const eCli   = document.getElementById("local-cli-end");    if (eCli)   eCli.style.display   = "";
  const eOutro = document.getElementById("local-outro-form"); if (eOutro) eOutro.style.display = "none";
  document.querySelectorAll(".loc-local-opt").forEach(b => b.classList.remove("on"));
  const optCli = document.getElementById("local-opt-cli"); if (optCli) optCli.classList.add("on");
  const cliCard = document.getElementById("loc-cli-card"); if (cliCard) cliCard.style.display = "none";
  const endTxt  = document.getElementById("local-cli-end-txt"); if (endTxt) { endTxt.textContent = "Selecione um cliente para ver o endereco"; endTxt.style.color = "var(--txt3)"; }
  wizGo(1);
  closeModal("modal-loc");
};

// ─── Salvar locação ───────────────────────────────────────────────────────────
window.salvarLoc = async function (status) {
  const cliId = gv("loc-cli"), ret = gv("loc-ret"), dev = gv("loc-dev"), tipo = gv("loc-tipo");
  if (!cliId) { notif("Selecione um cliente!", true); return; }
  if (!ret || !dev) { notif("Informe as datas!", true); return; }
  const editId = gv("loc-edit-id"); // ID da locação sendo editada (se houver)

  const total   = parseFloat(gv("loc-total"))   || 0;
  const entrada = parseFloat(gv("loc-entrada")) || 0;
  const desc    = parseFloat(gv("loc-desc"))    || 0;
  // loc-total já tem desconto aplicado (via calcDesc) — não subtrair desc novamente
  const saldo   = Math.max(0, total - entrada);
  const chkEnt  = document.getElementById("loc-entrega-chk");
  const temEnt  = (chkEnt && chkEnt.checked) || window._pendingEntrega === true;
  const valEntrega = temEnt ? (parseFloat(gv("loc-entrega-val-hidden") || gv("loc-entrega-val")) || window._pendingEntregaVal || 0) : 0;

  montarLocalFinal();

  const loc = {
    clienteId: cliId, tipo,
    status: status === "ativo" ? "aguardando_entrada" : status,
    emailCliente: clientes.find(x => x.id === cliId)?.email || "",
    evento:     gv("loc-evento"),
    local:      gv("loc-local"),
    obs:        gv("loc-obs"),
    retirada:   ret,
    devolucao:  dev,
    itens:      JSON.parse(JSON.stringify(locItens)),
    horas:      parseFloat(gv("loc-horas")) || 0,
    valorHora:  parseFloat(gv("loc-vh"))    || 0,
    descMont:   gv("loc-desc-mont"),
    desconto:   desc,
    entrega:    valEntrega,
    temEntrega: temEnt,
    entregaEnd: temEnt ? (gv("loc-entrega-end") || "") : "",
    total, entrada, saldo,
    pagamento:  gv("loc-pgto"),
    solicitacaoId: window._solicitacaoOrigemId || null,
    criadoEm:   serverTimestamp()
  };
  // Limpar após usar
  window._solicitacaoOrigemId = null;

  try {
    let locId;
    if (editId) {
      const { criadoEm: _ignorar, ...locAtualizado } = loc;
      await updateDoc(doc(db, "locacoes", editId), locAtualizado);
      locId = editId;
      // Sincronizar disponibilidade pública (só datas, sem dados do cliente)
      await updateDoc(doc(db, "disponibilidade", editId), {
        retirada: loc.retirada, devolucao: loc.devolucao,
        status: loc.status, kitId: loc.itens?.find(i=>i.tipo==="kit")?.id || null
      }).catch(async () => {
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await setDoc(doc(db, "disponibilidade", editId), {
          retirada: loc.retirada, devolucao: loc.devolucao,
          status: loc.status, kitId: loc.itens?.find(i=>i.tipo==="kit")?.id || null
        });
      });
      sv("loc-edit-id", "");
      notif(status === "orcamento" ? "Orçamento atualizado!" : "Locação atualizada!");
    } else {
      const ref = await addDoc(collection(db, "locacoes"), loc);
      locId = ref.id;
      // Sincronizar disponibilidade pública
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(async m => {
        await m.setDoc(m.doc(db, "disponibilidade", locId), {
          retirada: loc.retirada, devolucao: loc.devolucao,
          status: loc.status, kitId: loc.itens?.find(i=>i.tipo==="kit")?.id || null
        });
      }).catch(()=>{});
      notif(status === "orcamento" ? "Orçamento salvo!" : "Aguardando pagamento da entrada!");
    }
    window.cancelarLoc();
    if (status === "ativo") {
      const locComId = Object.assign({}, loc, { id: locId });
      // Novo fluxo: abrir modal para enviar cobrança de entrada ao cliente
      setTimeout(() => abrirModalCobrancaEntrada(locComId), 400);
    }
  } catch (e) {
    notif("Erro ao salvar: " + e.message, true);
  }
};

// ─── Ações na tabela ──────────────────────────────────────────────────────────
window.devolverLoc = async function (id) {
  const loc = locacoes.find(x => x.id === id); if (!loc) return;

  // ── Bloquear se houver saldo pendente ────────────────────────────────────
  const saldo = loc.saldo || 0;
  if (saldo > 0) {
    const fmtSaldo = "R$ " + saldo.toFixed(2).replace(".", ",");
    // Modal de bloqueio
    const existing = document.getElementById("modal-bloquear-devolucao");
    if (existing) existing.remove();
    const ov = document.createElement("div");
    ov.id = "modal-bloquear-devolucao";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
    ov.innerHTML = `
      <div style="background:#fff;border-radius:20px;width:100%;max-width:400px;padding:28px 24px;font-family:'DM Sans',sans-serif;text-align:center">
        <div style="width:60px;height:60px;background:#fef2f2;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <i class="ti ti-lock" style="font-size:28px;color:#dc2626"></i>
        </div>
        <div style="font-size:17px;font-weight:800;color:#150810;margin-bottom:8px">Pagamento pendente</div>
        <div style="font-size:13px;color:#6b7280;line-height:1.6;margin-bottom:20px">
          Esta locação ainda tem saldo em aberto de<br>
          <strong style="font-size:20px;color:#dc2626">${fmtSaldo}</strong><br><br>
          Confirme o pagamento antes de registrar a devolução.
        </div>
        <div style="display:grid;gap:10px">
          <button onclick="document.getElementById('modal-bloquear-devolucao').remove()"
            style="padding:12px;background:#d4307a;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
            OK, entendido
          </button>
          <button onclick="document.getElementById('modal-bloquear-devolucao').remove();window.devolverLocForcar('${id}')"
            style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;font-size:12px;color:#9ca3af;cursor:pointer;font-family:inherit">
            Devolver mesmo assim (sem receber)
          </button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
    return;
  }

  // Sem saldo — abrir checklist normalmente
  if (typeof window.abrirChecklist === "function") {
    window.abrirChecklist(id);
  } else {
    try {
      await updateDoc(doc(db, "locacoes", id), { status: "devolvido" });
      notif("Devolvido!");
    } catch(e) { notif("Erro: " + e.message, true); }
  }
};

// Devolução forçada (admin ciente do saldo pendente)
window.devolverLocForcar = async function(id) {
  if (typeof window.abrirChecklist === "function") {
    window.abrirChecklist(id);
  } else {
    try {
      await updateDoc(doc(db, "locacoes", id), { status: "devolvido" });
      notif("Devolvido (saldo em aberto registrado).");
    } catch(e) { notif("Erro: " + e.message, true); }
  }
};
window.confirmarLoc = async function (id) {

window.confirmarRetirada = async function(id) {
  const l = locacoes.find(x => x.id === id); if (!l) return;
  if (!l.assinadoEm) {
    const ok = await window.confirmar({ titulo:"Liberar sem assinatura?", msg:"O contrato ainda não foi assinado pelo cliente. Deseja liberar para retirada mesmo assim?", tipo:"warning", labelOk:"Liberar assim mesmo" });
    if (!ok) return;
  }
  try {
    await updateDoc(doc(db, "locacoes", id), { status: "ativo", liberadoEm: new Date().toISOString() });
    notif("✅ Locação liberada para retirada!");
    const c = clientes.find(x => x.id === l.clienteId);
    if (c?.tel) {
      const tel = c.tel.replace(/\D/g,"");
      const nome = c.nome ? c.nome.split(" ")[0] : "Cliente";
      const msgWpp = encodeURIComponent(`🎉 *${cfg.nome||"Katreseli"}* — Sua locação está liberada para retirada!\n\nOlá, *${nome}*! Tudo pronto! Você pode retirar os itens.\n\n📅 Retirada: *${fmtD(l.retirada)}*\n🎉 Evento: ${l.evento||"—"}\n\nQualquer dúvida, estamos à disposição! 😊`);
      setTimeout(() => {
        if (confirm("Enviar aviso de retirada via WhatsApp?")) window.open(`https://wa.me/55${tel}?text=${msgWpp}`,"_blank");
      }, 300);
    }
  } catch(e) { notif("Erro: " + e.message, true); }
};

  try {
    await updateDoc(doc(db, "locacoes", id), { status: "aceito", aceitoEm: new Date().toISOString() });
    const l = locacoes.find(x => x.id === id);
    const c = clientes.find(x => x.id === l?.clienteId);
    window.animRowConfirm?.(id);
    notif("✅ Solicitação aceita! Cliente pode efetuar o pagamento.");

    // Abrir WhatsApp com mensagem de aceite
    if (c?.tel || l?.tel) {
      const tel = (c?.tel || l?.tel || "").replace(/\D/g,"");
      const nome = c?.nome ? c.nome.split(" ")[0] : "Cliente";
      const msg = encodeURIComponent(
        `✅ *${cfg.nome||"Katreseli"} — Solicitação Aceita!*\n\nOlá, *${nome}*! Analisamos sua solicitação e está tudo certo. 🎉\n\n📅 Retirada: ${fmtD(l.retirada)}\n📅 Devolução: ${fmtD(l.devolucao)}\n🎉 Evento: ${l.evento||"—"}\n💰 Total: ${fmtR(l.total||0)}\n\nAcesse sua área do cliente para efetuar o pagamento:\n${cfg.urlCliente||""}\n\n_${cfg.nome||"Katreseli"}_`
      );
      setTimeout(() => {
        if (confirm("Deseja enviar mensagem de aceite via WhatsApp?")) {
          window.open(`https://wa.me/55${tel}?text=${msg}`, "_blank");
        }
      }, 400);
    }
  } catch(e) { notif("Erro: " + e.message, true); }
};
window.delLoc = async function (id) {
  const loc = locacoes.find(x => x.id === id);
  const c   = clientes.find(x => x.id === loc?.clienteId);
  const nome = c?.nome ? `"${c.nome}"` : "esta locação";
  if (!await window.confirmar({ titulo:"Excluir locação", msg:`Deseja excluir a locação de ${nome}? Esta ação não pode ser desfeita.`, tipo:"danger", labelOk:"Excluir" })) return;
  try {
    await deleteDoc(doc(db, "locacoes", id));
    notif("Locação removida.");
  } catch(e) { notif("Erro: " + e.message, true); }
};
window.verContrato = async function (id) {
  try {
    const snap = await getDoc(doc(db, "locacoes", id));
    if (!snap.exists()) return notif("Locação não encontrada.", true);
    const data = snap.data();
    // Debug: verificar se assinatura está no Firestore
    console.log("[verContrato] assinadoEm:", data.assinadoEm, "| assinadoPor:", data.assinadoPor);
    await gerarContrato({ id, ...data });
  } catch(e) {
    console.error("[verContrato]", e);
    const l = locacoes.find(x => x.id === id);
    if (l) {
      console.log("[verContrato fallback] assinadoEm:", l.assinadoEm);
      gerarContrato({ ...l });
    } else notif("Erro ao abrir contrato: " + e.message, true);
  }
};

// ─── Reprocessar / regenerar contrato ────────────────────────────────────────
window.reprocessarContrato = async function(id) {
  const loc = locacoes.find(x => x.id === id);
  if (!loc) return notif("Locação não encontrada.", true);

  // Modal de confirmação com aviso sobre assinatura
  const temAssinatura = !!loc.assinadoEm;
  const msg = temAssinatura
    ? "Este contrato já foi assinado pelo cliente. Reprocessar vai gerar um novo contrato e REMOVER a assinatura existente. Deseja continuar?"
    : "Isso vai gerar um novo contrato com os dados atuais da locação. Deseja continuar?";

  const ok = await window.confirmar({
    titulo: "Reprocessar contrato",
    msg,
    tipo: temAssinatura ? "danger" : "warning",
    labelOk: "Reprocessar"
  });
  if (!ok) return;

  // Se tinha assinatura, limpar
  if (temAssinatura) {
    await updateDoc(doc(db, "locacoes", id), {
      assinadoEm: null,
      assinadoPor: null,
      assinadoEmail: null,
      assinadoIP: null,
      assinadoDevice: null,
      contrato: null
    }).catch(() => {});
  }

  // gerarContrato salva automaticamente no Firestore
  setTimeout(() => {
    gerarContrato({ ...loc, assinadoEm: null });
    notif("✅ Contrato reprocessado! O cliente precisa assinar novamente.");
    window.renderLoc?.();
  }, 300);
};
// Abrir modal de receber saldo
window.receberSaldo = async function (id) {
  const loc = locacoes.find(x => x.id === id); if (!loc) return;
  const saldo = loc.saldo || 0;

  // Preencher resumo no modal
  const sv2 = (i, v) => { const e = document.getElementById(i); if (e) e.textContent = v; };
  sv2("saldo-res-total", fmtR(loc.total || 0));
  sv2("saldo-res-pago",  fmtR(loc.entrada || 0));
  sv2("saldo-res-saldo", fmtR(saldo));

  // Pré-preencher valor com o saldo total
  const inp = document.getElementById("saldo-valor");
  if (inp) { inp.value = saldo.toFixed(2); }

  const idInp = document.getElementById("saldo-loc-id");
  if (idInp) idInp.value = id;

  // Limpar seleção de forma de pagamento
  document.querySelectorAll("#saldo-pgto-grid .pgto-btn").forEach(b => b.classList.remove("sel"));
  const pgtoVal = document.getElementById("saldo-pgto-val"); if (pgtoVal) pgtoVal.value = "";

  // Título
  const titulo = document.getElementById("saldo-modal-titulo");
  if (titulo) titulo.textContent = `Receber saldo — ${fmtR(saldo)}`;

  // Calcular e mostrar restante
  window.calcSaldoRestante();

  // Abrir modal
  const m = document.getElementById("modal-saldo"); if (m) m.classList.add("on");
};

// Atualizar saldo restante ao digitar valor
window.calcSaldoRestante = function () {
  const idInp = document.getElementById("saldo-loc-id");
  if (!idInp) return;
  const loc  = locacoes.find(x => x.id === idInp.value); if (!loc) return;
  const pago  = parseFloat((document.getElementById("saldo-valor") || {}).value) || 0;
  const saldo = loc.saldo || 0;
  const novo  = Math.max(0, saldo - pago);
  const box   = document.getElementById("saldo-novo-box");
  const val   = document.getElementById("saldo-novo-val");
  if (box) box.style.display = pago > 0 ? "" : "none";
  if (val) {
    val.textContent = novo <= 0 ? "Quitado ✓" : fmtR(novo);
    val.style.color = novo <= 0 ? "#059669" : "#b45309";
  }
};

// Selecionar forma de pgto no modal de saldo
window.selSaldoPgto = function (forma, btn) {
  document.querySelectorAll("#saldo-pgto-grid .pgto-btn").forEach(b => b.classList.remove("sel"));
  btn.classList.add("sel");
  const v = document.getElementById("saldo-pgto-val"); if (v) v.value = forma;
};

// Confirmar recebimento
window.confirmarSaldo = async function () {
  const idInp = document.getElementById("saldo-loc-id");
  const id    = idInp?.value; if (!id) return;
  const loc   = locacoes.find(x => x.id === id); if (!loc) return;

  const forma = (document.getElementById("saldo-pgto-val") || {}).value;
  if (!forma) { notif("Selecione a forma de pagamento!", true); return; }

  const pago  = parseFloat((document.getElementById("saldo-valor") || {}).value) || 0;
  if (pago <= 0) { notif("Informe o valor recebido!", true); return; }

  const nova  = (loc.entrada || 0) + pago;
  const novoS = Math.max(0, (loc.total || 0) - nova);
  const pgto  = loc.pagamento ? loc.pagamento + " + " + forma : forma;

  try {
    await updateDoc(doc(db, "locacoes", id), { entrada: nova, saldo: novoS, pagamento: pgto });
    document.getElementById("modal-saldo").classList.remove("on");
    notif(novoS <= 0 ? "✓ Locação quitada!" : "Recebido! Saldo: " + fmtR(novoS));
    // Perguntar se deseja gerar recibo
    setTimeout(async () => {
      if (await window.confirmar({ titulo:"Gerar recibo", msg:"Deseja gerar o recibo de pagamento para esta locação?", tipo:"success", labelOk:"Gerar recibo", labelCancel:"Não" })) {
        gerarRecibo(id, pago, forma, novoS <= 0 ? "quitacao" : "parcial");
      }
    }, 300);
  } catch (e) { notif("Erro: " + e.message, true); }
};

// ─── Menu de ações (dropdown) ─────────────────────────────────────────────────
window.menuAcoes = function(locId, btn) {
  document.querySelectorAll(".acoes-menu").forEach(m => m.remove());

  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  const menu = document.createElement("div");
  menu.className = "acoes-menu";

  const mkSection = (label) => {
    const s = document.createElement("div");
    s.style.cssText = "font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt3);padding:6px 10px 2px;";
    s.textContent = label;
    return s;
  };

  const mkSep = () => {
    const s = document.createElement("div");
    s.className = "acoes-menu-sep";
    return s;
  };

  const mkBtn = (label, fn, icon, color) => {
    const b = document.createElement("button");
    b.innerHTML = `<i class="ti ti-${icon}" style="font-size:14px;flex-shrink:0"></i>${label}`;
    if (color) b.style.color = color;
    b.onclick = () => { menu.remove(); fn(); };
    return b;
  };

  // ── Grupo: Locação ──────────────────────────────────────────────────────
  menu.appendChild(mkSection("Locação"));
  menu.appendChild(mkBtn("Editar",       () => editarLocacao(locId),   "edit",        "var(--txt)"));
  menu.appendChild(mkBtn("Duplicar",     () => duplicarLocacao(locId), "copy",        "#0369a1"));
  if (cfg.linkConfirmacao && loc.status === "orcamento")
    menu.appendChild(mkBtn("Link de confirmação", () => gerarLinkConfirmacao(locId), "link", "#185FA5"));

  // ── Grupo: Financeiro ───────────────────────────────────────────────────
  menu.appendChild(mkSep());
  menu.appendChild(mkSection("Financeiro"));
  if (loc.status === "aguardando_entrada") {
    menu.appendChild(mkBtn("Confirmar entrada paga", () => confirmarEntradaPaga(locId), "circle-check", "#059669"));
    menu.appendChild(mkBtn("Cobrar entrada (WhatsApp)", () => abrirModalCobrancaEntradaPorId(locId), "brand-whatsapp", "#d97706"));
  }
  if (loc.status === "ativo" || loc.status === "devolvido")
    menu.appendChild(mkBtn("Gerar recibo", () => gerarReciboConfirmacao({...loc}), "receipt", "#d4307a"));
  menu.appendChild(mkBtn("Orçamento PDF", () => gerarLinkOrcamento(locId), "file-description", "#15803d"));

  // ── Grupo: Comunicação ──────────────────────────────────────────────────
  menu.appendChild(mkSep());
  menu.appendChild(mkSection("Comunicação"));
  menu.appendChild(mkBtn("WhatsApp", () => menuWhats(locId, btn), "brand-whatsapp", "#16a34a"));
  if (loc.status === "ativo")
    menu.appendChild(mkBtn("Lembrete de devolução", () => window.enviarLembreteDevolucao?.(locId), "bell", "#d97706"));
  if (loc.status === "devolvido")
    menu.appendChild(mkBtn("Pedir avaliação", () => window.enviarAvaliacaoPosEvento?.(locId), "star", "#16a34a"));

  // ── Grupo: Documentos ──────────────────────────────────────────────────
  menu.appendChild(mkSep());
  menu.appendChild(mkSection("Documentos"));
  menu.appendChild(mkBtn("Lista de separação", () => gerarListaSeparacao(locId), "list-check", "#1d4ed8"));
  if (loc.status === "ativo")
    menu.appendChild(mkBtn("Checklist devolução", () => abrirChecklist(locId), "checkbox", "#0f6e56"));
  menu.appendChild(mkBtn("Fotos do evento",    () => abrirFotosEvento(locId),    "photo",    "#9333ea"));
  menu.appendChild(mkBtn("Nota interna",       () => abrirNota(locId),            "notes",    "#854d0e"));
  menu.appendChild(mkBtn("Histórico",          () => verLogAlteracoes(locId),     "history",  "#6d28d9"));
  menu.appendChild(mkSep());
  menu.appendChild(mkSection("Contrato"));
  menu.appendChild(mkBtn("Gerar / Reprocessar contrato", () => reprocessarContrato(locId), "file-text", "#d4307a"));
  if (loc.contrato)
    menu.appendChild(mkBtn("Ver contrato atual", () => verContrato(locId), "eye", "#6d28d9"));

  // ── Excluir ─────────────────────────────────────────────────────────────
  menu.appendChild(mkSep());
  menu.appendChild(mkBtn("Excluir locação", () => delLoc(locId), "trash", "#be123c"));

  // ── Posicionamento ── ancora pelo canto direito do botão ────────────────
  document.body.appendChild(menu);
  const rect  = btn.getBoundingClientRect();
  const mH    = menu.offsetHeight;
  const top   = (window.innerHeight - rect.bottom - 8) >= mH
                ? rect.bottom + 4
                : Math.max(8, rect.top - mH - 4);
  const right = window.innerWidth - rect.right;
  menu.style.cssText = `position:fixed;top:${top}px;right:${right}px;z-index:9999`;

  setTimeout(() => {
    document.addEventListener("click", function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", close); }
    });
  }, 50);
};

window.filtroSol = function(status, chip) {
  document.querySelectorAll("#page-solicitacoes .chip").forEach(c=>c.classList.remove("on"));
  if (chip) chip.classList.add("on");
  window.renderSolicitacoes?.(status);
};

window.limparFiltroData = function() {
  const de  = document.getElementById("loc-filtro-de");
  const ate = document.getElementById("loc-filtro-ate");
  if (de)  de.value  = "";
  if (ate) ate.value = "";
  window.renderLoc?.();
};

// ─── Busca de cliente no wizard ──────────────────────────────────────────────
// ── Dropdown de clientes no BODY (fora do modal-b para evitar stacking context) ──
function _getCliDropdown() {
  let dd = document.getElementById("loc-cli-dropdown");
  if (!dd) {
    dd = document.createElement("div");
    dd.id = "loc-cli-dropdown";
    dd.style.cssText = "display:none;position:fixed;background:var(--sur);border:1.5px solid var(--bdr2);border-radius:9px;max-height:220px;overflow-y:auto;z-index:99999;box-shadow:0 8px 30px rgba(0,0,0,.2);min-width:200px;";
    document.body.appendChild(dd);
  }
  return dd;
}
function _posicionarCliDropdown() {
  const inp = document.getElementById("loc-cli-search");
  const dd  = _getCliDropdown();
  if (!inp || !dd) return;
  const r = inp.getBoundingClientRect();
  dd.style.top   = (r.bottom + 3) + "px";
  dd.style.left  = r.left + "px";
  dd.style.width = r.width + "px";
}
window.filtrarClientesWiz = function(q) {
  const dd = _getCliDropdown();
  const termo = (q || "").toLowerCase();
  const lista = clientes
    .filter(c => !termo || (c.nome||"").toLowerCase().includes(termo) || (c.tel||"").includes(termo))
    .sort((a, b) => (a.nome||"").localeCompare(b.nome||""))
    .slice(0, 12);
  if (!lista.length) {
    dd.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--txt3)">Nenhum cliente encontrado</div>`;
  } else {
    dd.innerHTML = lista.map(c => {
      const nomeEsc = (c.nome||"").replace(/'/g, "’");
      const info    = [c.tel, c.email].filter(Boolean).join(" · ");
      return `<div onclick="selecionarCliWiz('${c.id}','${nomeEsc}','')"
        style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--bdr);transition:background .1s"
        onmouseover="this.style.background='var(--pl)'"
        onmouseout="this.style.background=''">
        <div style="font-weight:600;color:var(--pd)">${c.nome||""}</div>
        <div style="font-size:11px;color:var(--txt3)">${info}</div>
      </div>`;
    }).join("");
  }
  _posicionarCliDropdown();
  dd.style.display = "block";
};
window.mostrarListaCli = function() {
  const q = (document.getElementById("loc-cli-search")||{}).value || "";
  window.filtrarClientesWiz(q);
};

window.selecionarCliWiz = function(id, nome, info) {
  sv("loc-cli", id);
  const inp = el("loc-cli-search"); if (inp) inp.value = nome;
  const dd  = document.getElementById("loc-cli-dropdown"); if (dd) dd.style.display = "none";
  window.onSelecionarCliente?.();
};

// Fechar dropdown ao clicar fora
document.addEventListener("click", e => {
  const dd  = document.getElementById("loc-cli-dropdown");
  const inp = el("loc-cli-search");
  if (dd && inp && !inp.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = "none";
  }
});

// Reposicionar dropdown ao rolar o modal
document.addEventListener("scroll", () => {
  const dd = document.getElementById("loc-cli-dropdown");
  if (dd && dd.style.display !== "none") _posicionarCliDropdown?.();
}, true);

// ─── Toggle visualização tabela / cards ──────────────────────────────────────
let _locView = "tabela";
window.setViewLoc = function(view) {
  _locView = view;
  const tb = document.getElementById("loc-view-tabela");
  const cd = document.getElementById("loc-view-cards");
  const btnT = document.getElementById("view-tabela-btn");
  const btnC = document.getElementById("view-cards-btn");
  const kb = document.getElementById("loc-view-kanban");
  const btnK = document.getElementById("view-kanban-btn");
  if (tb) tb.style.display = view === "tabela" ? "" : "none";
  if (cd) cd.style.display = view === "cards"  ? "" : "none";
  if (kb) kb.style.display = view === "kanban" ? "" : "none";
  if (btnT) { btnT.style.background = view === "tabela" ? "var(--p)" : "none"; btnT.style.color = view === "tabela" ? "#fff" : "var(--txt2)"; }
  if (btnC) { btnC.style.background = view === "cards"  ? "var(--p)" : "none"; btnC.style.color = view === "cards"  ? "#fff" : "var(--txt2)"; }
  if (btnK) { btnK.style.background = view === "kanban" ? "var(--p)" : "none"; btnK.style.color = view === "kanban" ? "#fff" : "var(--txt2)"; }
  if (view === "cards")  renderLocCards();
  if (view === "kanban") renderLocKanban();
};

function renderLocKanban() {
  const div = document.getElementById("loc-view-kanban"); if (!div) return;
  const cols = [
    { key: "orcamento",             label: "Solicitado",        cls: "kanban-col-orc",   icon: "ti-clock" },
    { key: "aceito",               label: "Aceito",            cls: "kanban-col-orc",   icon: "ti-thumb-up" },
    { key: "aguardando_entrada",   label: "Aguard. Pagamento", cls: "kanban-col-orc",   icon: "ti-credit-card" },
    { key: "aguardando_assinatura",label: "Aguard. Assinatura",cls: "kanban-col-orc",   icon: "ti-pen" },
    { key: "ativo",                label: "Aguard. Retirada",  cls: "kanban-col-ativo", icon: "ti-package" },
    { key: "devolvido",            label: "Devolvido",         cls: "kanban-col-dev",   icon: "ti-home-check" },
  ];
  div.innerHTML = `<div class="kanban-board">${
    cols.map(col => {
      const lns = locacoes.filter(l => l.status === col.key)
        .sort((a,b) => (b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
      const cards = lns.map(l => {
        const cli = clientes.find(x => x.id === l.clienteId);
        return `<div class="kanban-card" onclick="menuAcoes('${l.id}', this)">
          <div class="kanban-card-nome">${cli?.nome || "—"}</div>
          <div class="kanban-card-ev">${l.evento || "Sem evento"}</div>
          <div class="kanban-card-ft">
            <span>${fmtD(l.retirada) || "—"}</span>
            <span class="kanban-card-val">${fmtR(l.total)}</span>
          </div>
        </div>`;
      }).join("") || `<div style="text-align:center;padding:20px;color:var(--txt3);font-size:12px">Nenhuma</div>`;
      return `<div class="kanban-col ${col.cls}">
        <div class="kanban-col-hd">
          <span><i class="ti ${col.icon}" style="margin-right:5px"></i>${col.label}</span>
          <span class="kanban-col-cnt">${lns.length}</span>
        </div>
        ${cards}
      </div>`;
    }).join("")
  }</div>`;
}

function renderLocCards() {
  const div = document.getElementById("loc-view-cards"); if (!div) return;
  const q = (document.getElementById("q-loc") || {}).value?.toLowerCase() || "";
  const f = filtros.loc || "";
  const de  = (document.getElementById("loc-filtro-de")  || {}).value || "";
  const ate = (document.getElementById("loc-filtro-ate") || {}).value || "";
  const rows = locacoes.filter(l => {
    const c = clientes.find(x => x.id === l.clienteId);
    const matchQ = !q || (c?.nome||"").toLowerCase().includes(q) || (l.evento||"").toLowerCase().includes(q);
    const matchF = !f || l.status === f;
    const matchDe  = !de  || (l.retirada  && l.retirada  >= de);
    const matchAte = !ate || (l.devolucao && l.devolucao <= ate);
    return matchQ && matchF && matchDe && matchAte;
  }).sort((a, b) => {
    // Prioridade por status: ativos (entrada paga) primeiro, depois aguardando entrada,
    // orçamentos, e devolvidos/cancelados sempre no final
    const prio = { aguardando_entrada: 0, aceito: 0, aguardando_assinatura: 0, ativo: 1, orcamento: 2, devolvido: 3, cancelado: 4 };
    const pa = prio[a.status] ?? 2, pb = prio[b.status] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0);
  });

  const corStatus = { orcamento:"#5F5E5A", aceito:"#4c1d95", aguardando_entrada:"#b45309", aguardando_assinatura:"#d4307a", ativo:"#15803d", devolvido:"#1d4ed8", cancelado:"#9f1239" };
  const bgStatus  = { orcamento:"#f1efe8", aceito:"#f5f3ff", aguardando_entrada:"#fffbeb", aguardando_assinatura:"#fce4f3", ativo:"#f0fdf4", devolvido:"#eff6ff", cancelado:"#fff1f2" };
  const lblStatus = { orcamento:"Solicitado", aceito:"Aceito", aguardando_entrada:"Aguard. Pagamento", aguardando_assinatura:"Aguard. Assinatura", ativo:"Aguard. Retirada", devolvido:"Devolvido", cancelado:"Cancelado" };

  div.innerHTML = rows.length === 0
    ? '<div style="text-align:center;padding:40px;color:var(--txt3)">Nenhuma locação encontrada</div>'
    : '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:4px 2px">' +
      rows.map(l => {
        const c = clientes.find(x => x.id === l.clienteId);
        const iniciais = (c?.nome||"?").split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
        const sts = l.status || "ativo";
        const diasDev = l.devolucao ? Math.round((new Date(l.devolucao) - new Date()) / 864e5) : null;
        const urgente = diasDev !== null && diasDev <= 1 && sts === "ativo";
        return `<div style="background:var(--sur);border:1.5px solid ${urgente ? "#fca5a5" : "var(--bdr2)"};border-radius:14px;padding:14px;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow=''">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:38px;height:38px;border-radius:50%;background:var(--pl);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--pd);flex-shrink:0">${iniciais}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c?.nome || "—"}</div>
              <div style="font-size:11px;color:var(--txt3)">${l.evento || "Sem evento"}</div>
            </div>
            <span style="font-size:10px;font-weight:700;color:${corStatus[sts]};background:${bgStatus[sts]};padding:2px 8px;border-radius:6px;white-space:nowrap">${lblStatus[sts]||sts}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--txt2);margin-bottom:10px">
            <div><i class="ti ti-arrow-up-right" style="font-size:11px;color:var(--p)"></i> ${fmtD(l.retirada)||"?"}</div>
            <div><i class="ti ti-arrow-down-left" style="font-size:11px;color:#60a5fa"></i> ${fmtD(l.devolucao)||"?"}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--bdr)">
            <div>
              <div style="font-weight:700;color:var(--p);font-size:14px">${fmtR(l.total)}</div>
              <div style="font-size:10px;color:${(l.saldo||0)>0?"#b45309":"#15803d"}">${(l.saldo||0)>0 ? "Saldo: "+fmtR(l.saldo) : "Pago ✓"}</div>
            </div>
            <div style="display:flex;gap:5px">
              ${(l.saldo||0)>0 && sts==="ativo" ? `<button onclick="receberSaldo('${l.id}')" style="padding:5px 8px;border-radius:7px;border:none;background:#fef9c3;color:#854d0e;cursor:pointer;font-size:11px;font-weight:600"><i class="ti ti-cash" style="font-size:11px"></i></button>` : ""}
              <button onclick="verContrato('${l.id}')" style="padding:5px 8px;border-radius:7px;border:1.5px solid var(--bdr2);background:none;color:var(--txt2);cursor:pointer;font-size:13px"><i class="ti ti-file-text"></i></button>
              <button onclick="menuAcoes('${l.id}',this)" style="padding:5px 8px;border-radius:7px;border:1.5px solid var(--bdr2);background:none;color:var(--txt2);cursor:pointer;font-size:13px"><i class="ti ti-dots"></i></button>
            </div>
          </div>
        </div>`;
      }).join("") + "</div>";
}

// ─── Renderizar tabela de locacoes ────────────────────────────────────────────
window.renderLoc = function () {
  const q   = (gv("q-loc") || "").toLowerCase();
  const f   = window._filtros?.loc || "";
  const de  = (document.getElementById("loc-filtro-de")  || {}).value || "";
  const ate = (document.getElementById("loc-filtro-ate") || {}).value || "";

  // ── Métricas rápidas ──────────────────────────────────────────────────────
  const metrics = document.getElementById("loc-metrics");
  if (metrics) {
    const todas    = locacoes;
    const ativas   = todas.filter(l => l.status === "ativo").length;
    const waiting  = todas.filter(l => l.status === "aguardando_entrada").length;
    const fat      = todas.filter(l => ["ativo","devolvido","aguardando_entrada"].includes(l.status))
                         .reduce((a, l) => a + (l.total || 0), 0);
    const aReceber = todas.filter(l => (l.saldo || 0) > 0 && !["cancelado","devolvido"].includes(l.status))
                         .reduce((a, l) => a + (l.saldo || 0), 0);
    const devs     = todas.filter(l => l.status === "devolvido").length;
    const f2 = "font-family:'DM Sans',sans-serif;box-sizing:border-box;";

    const mkM = (icon, label, val, sub, bg, iconCor, valCor) =>
      `<div style="${f2}background:${bg};border-radius:14px;padding:14px 16px;position:relative;overflow:hidden">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
          <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="ti ${icon}" style="font-size:14px;color:${iconCor}"></i>
          </div>
          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:${iconCor};opacity:.85">${label}</span>
        </div>
        <div style="font-size:22px;font-weight:700;color:${valCor};line-height:1">${val}</div>
        <div style="font-size:11px;margin-top:4px;color:${iconCor};opacity:.7">${sub}</div>
      </div>`;

    metrics.innerHTML =
      mkM("ti-receipt", "Ativas", String(ativas) + (waiting ? ` <span style="font-size:13px;font-weight:500;opacity:.8">+${waiting}</span>` : ""),
          waiting ? `${waiting} aguardando entrada` : "em andamento",
          "linear-gradient(135deg,#e8f5e2,#d4edcc)", "#2d6a0f", "#2d6a0f") +
      mkM("ti-currency-dollar", "Faturamento", fmtR(fat), "total contratado",
          "linear-gradient(135deg,#fdf2f8,#fce7f3)", "#be185d", "#be185d") +
      mkM("ti-alert-circle", "A receber", fmtR(aReceber), "saldo pendente",
          aReceber > 0 ? "linear-gradient(135deg,#fef3c7,#fde68a)" : "linear-gradient(135deg,#e8f5e2,#d4edcc)",
          aReceber > 0 ? "#92400e" : "#2d6a0f",
          aReceber > 0 ? "#92400e" : "#2d6a0f") +
      mkM("ti-check", "Devolvidas", String(devs), "finalizadas",
          "linear-gradient(135deg,#e8f0fc,#d1e3f8)", "#1e40af", "#1e40af");
  }

  // ── Chips de status coloridos com contadores ──────────────────────────────
  const chipsEl = document.getElementById("loc-status-chips");
  if (chipsEl) {
    const counts = {
      "": locacoes.length,
      aguardando_entrada: locacoes.filter(l => l.status === "aguardando_entrada").length,
      ativo: locacoes.filter(l => l.status === "ativo").length,
      orcamento: locacoes.filter(l => l.status === "orcamento").length,
      devolvido: locacoes.filter(l => l.status === "devolvido").length,
      cancelado: locacoes.filter(l => l.status === "cancelado").length,
    };
    const chipDefs = [
      { key: "", label: "Todos",            bg: f ? "var(--sur)" : "var(--p)",    cor: f ? "var(--txt2)" : "#fff",     bdr: f ? "var(--bdr2)" : "var(--p)" },
      { key: "orcamento",             label: "Solicitados",       bg: f==="orcamento"?"#5F5E5A":"#F1EFE8",       cor: f==="orcamento"?"#fff":"#5F5E5A",       bdr: "#B4B2A9" },
      { key: "aceito",              label: "Aceitos",           bg: f==="aceito"?"#4c1d95":"#f5f3ff",           cor: f==="aceito"?"#fff":"#4c1d95",           bdr: "#c4b5fd" },
      { key: "aguardando_entrada",  label: "Aguard. Pagamento", bg: f==="aguardando_entrada"?"#BA7517":"#FAEEDA",cor: f==="aguardando_entrada"?"#fff":"#854F0B", bdr: "#EF9F27" },
      { key: "aguardando_assinatura",label:"Aguard. Assinatura",bg: f==="aguardando_assinatura"?"#d4307a":"#fce4f3",cor:f==="aguardando_assinatura"?"#fff":"#d4307a",bdr:"#f9a8d4" },
      { key: "ativo",               label: "Aguard. Retirada",  bg: f==="ativo"?"#3B6D11":"#EAF3DE",            cor: f==="ativo"?"#fff":"#3B6D11",            bdr: "#97C459" },
      { key: "devolvido",           label: "Devolvidos",        bg: f==="devolvido"?"#185FA5":"#E6F1FB",        cor: f==="devolvido"?"#fff":"#185FA5",        bdr: "#85B7EB" },
      { key: "cancelado",label: "Cancelados",   bg: f==="cancelado"? "#A32D2D" : "#FCEBEB", cor: f==="cancelado"? "#fff" : "#A32D2D", bdr: "#F09595" },
    ].filter(c => counts[c.key] > 0 || c.key === "");
    chipsEl.innerHTML = chipDefs.map(c =>
      `<span onclick="setF('loc','${c.key}',this)" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:5px 13px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;border:1.5px solid ${c.bdr};background:${c.bg};color:${c.cor};transition:all .15s">
        ${c.label}${counts[c.key] ? `<span style="opacity:.75;font-size:10px">${counts[c.key]}</span>` : ""}
      </span>`
    ).join("");
  }

  // ── Filtrar rows ──────────────────────────────────────────────────────────
  const rows = locacoes.filter(l => {
    const c = clientes.find(x => x.id === l.clienteId);
    const matchQ   = !q   || (c?.nome || "").toLowerCase().includes(q) || (l.evento || "").toLowerCase().includes(q);
    const matchF   = !f   || l.status === f;
    const matchDe  = !de  || (l.retirada  && l.retirada  >= de);
    const matchAte = !ate || (l.devolucao && l.devolucao <= ate);
    return matchQ && matchF && matchDe && matchAte;
  }).sort((a, b) => {
    // Prioridade por status: ativos (entrada paga) primeiro, depois aguardando entrada,
    // orçamentos, e devolvidos/cancelados sempre no final
    const prio = { aguardando_entrada: 0, aceito: 0, aguardando_assinatura: 0, ativo: 1, orcamento: 2, devolvido: 3, cancelado: 4 };
    const pa = prio[a.status] ?? 2, pb = prio[b.status] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0);
  });

  el("cnt-loc").textContent = rows.length;
  const tb = el("tb-loc"); if (!tb) return;

  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><i class="ti ti-receipt"></i><p>Nenhuma locação</p></div></td></tr>';
    document.getElementById("pag-loc") && (document.getElementById("pag-loc").innerHTML = "");
    return;
  }

  const sb = { orcamento: "bgray", aceito: "bv", aguardando_entrada: "bo", aguardando_assinatura: "bp", ativo: "bg", devolvido: "bb", cancelado: "br" };
  const sl = { orcamento: "Solicitado", aceito: "Aceito", aguardando_entrada: "Aguard. Pagamento", aguardando_assinatura: "Aguard. Assinatura", ativo: "Aguard. Retirada", devolvido: "Devolvido", cancelado: "Cancelado" };
  const borderCor = { ativo: "#639922", orcamento: "#888780", devolvido: "#378ADD", cancelado: "#E24B4A", aguardando_entrada: "#EF9F27" };
  const rowBg     = { ativo: "rgba(99,153,34,.04)", orcamento: "transparent", devolvido: "rgba(55,138,221,.03)", cancelado: "rgba(226,75,74,.04)", aguardando_entrada: "rgba(239,159,39,.06)" };
  const avatarBg  = { ativo: "#EAF3DE", orcamento: "#F1EFE8", devolvido: "#E6F1FB", cancelado: "#FCEBEB", aguardando_entrada: "#FAEEDA" };
  const avatarCor = { ativo: "#3B6D11", orcamento: "#5F5E5A", devolvido: "#185FA5", cancelado: "#A32D2D", aguardando_entrada: "#854F0B" };

  window.paginar?.("loc", rows, slice => {
    tb.innerHTML = slice.map(l => {
      const c      = clientes.find(x => x.id === l.clienteId);
      const borda  = borderCor[l.status] || "#e5e7eb";
      const rbg    = rowBg[l.status]     || "transparent";
      const avBg   = avatarBg[l.status]  || "var(--pl)";
      const avCor  = avatarCor[l.status] || "var(--pd)";
      const inic   = (c?.nome || "?").split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
      const dias   = l.retirada && l.devolucao
        ? Math.round((new Date(l.devolucao) - new Date(l.retirada)) / 864e5)
        : null;
      const saldo  = l.saldo || 0;

      // Alertas de data
      const hoje     = new Date(); hoje.setHours(0,0,0,0);
      const retDate  = l.retirada  ? new Date(l.retirada  + "T00:00:00") : null;
      const devDate  = l.devolucao ? new Date(l.devolucao + "T00:00:00") : null;
      const diasRet  = retDate  ? Math.round((retDate  - hoje) / 864e5) : null;
      const diasDev  = devDate  ? Math.round((devDate  - hoje) / 864e5) : null;

      // Retirada: hoje=0, amanhã=1, depois=2 → urgente
      const retUrgente = l.status === "ativo" || l.status === "orcamento" || l.status === "aguardando_entrada"
        ? diasRet !== null && diasRet >= 0 && diasRet <= 2 : false;
      // Devolução: atrasada (<0) ou hoje/amanhã
      const devAtrasada = l.status === "ativo" && diasDev !== null && diasDev < 0;
      const devUrgente  = l.status === "ativo" && diasDev !== null && diasDev >= 0 && diasDev <= 1;

      const mkDataTag = (label, cor, bg) =>
        `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:${cor};background:${bg};padding:1px 7px;border-radius:10px;white-space:nowrap">
          <i class="ti ti-alert-triangle" style="font-size:10px"></i>${label}
        </span>`;

      const retTag = retUrgente
        ? mkDataTag(diasRet === 0 ? "Retirada hoje!" : diasRet === 1 ? "Retirada amanhã" : "Retirada em 2 dias", "#92400e", "#fef3c7")
        : "";
      const devTag = devAtrasada
        ? mkDataTag(`Devol. atrasada ${Math.abs(diasDev)}d`, "#fff", "#E24B4A")
        : devUrgente
          ? mkDataTag(diasDev === 0 ? "Devolução hoje!" : "Devolução amanhã", "#92400e", "#fef3c7")
          : "";
      const kitsLoc  = (l.itens || []).filter(i => i.tipo === "kit");
      const itensAv  = (l.itens || []).filter(i => i.tipo !== "kit");
      const nItens   = itensAv.reduce((a, i) => a + (i.qtd || 1), 0);
      const kitsHtml = kitsLoc.slice(0,1).map(k => {
        const nome = (k.nome || "Kit").replace(/\(.*?\)/g, "").trim(); // remove "(desc. R$X)"
        return `<div style="display:flex;align-items:center;gap:3px;font-size:10px;background:var(--pl);color:var(--pd);padding:2px 7px;border-radius:10px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%">
          <i class="ti ti-gift" style="font-size:10px;flex-shrink:0"></i>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nome)}</span>
        </div>`;
      }).join("") + (kitsLoc.length > 1 ? `<div style="font-size:10px;color:var(--txt3)">+${kitsLoc.length-1} kit${kitsLoc.length>2?"s":""}</div>` : "");

      // Endereço resumido
      const end = l.endEntrega ? `<div style="font-size:11px;color:var(--txt3);display:flex;align-items:center;gap:3px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px"><i class="ti ti-map-pin" style="font-size:11px;flex-shrink:0"></i>${esc(l.endEntrega)}</div>` : "";

      // Telefone do cliente
      const tel = c?.tel ? `<div style="font-size:11px;color:var(--txt3);display:flex;align-items:center;gap:3px;margin-top:2px"><i class="ti ti-phone" style="font-size:11px"></i>${esc(c.tel)}</div>` : "";

      // Entrada paga
      const entradaInfo = l.entrada > 0
        ? `<div style="font-size:11px;color:var(--txt3);margin-top:2px">Entrada: <span style="color:#3B6D11;font-weight:600">${fmtR(l.entrada)}</span></div>`
        : "";

      const pago       = saldo <= 0 && (l.status === "ativo" || l.status === "devolvido");
      const devolvido  = l.status === "devolvido";
      const bordaFinal = devAtrasada ? "#E24B4A" : retUrgente || devUrgente ? "#EF9F27" : pago && !devolvido ? "#3B6D11" : borda;
      const rbgFinal   = devAtrasada ? "rgba(226,75,74,.05)" : devolvido ? "rgba(55,138,221,.08)" : pago ? "rgba(59,109,17,.10)" : rbg;

      return `<tr data-id="${l.id}" style="border-left:3px solid ${bordaFinal};background:${rbgFinal}">
        <td data-label="Cliente">
          <div style="display:flex;align-items:center;gap:9px">
            <div style="width:36px;height:36px;border-radius:50%;background:${avBg};color:${avCor};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${inic}</div>
            <div style="min-width:0">
              <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:5px">
                ${esc(c?.nome || '-')}
                ${l.notaInterna ? `<span class="nota-badge" onclick="abrirNota('${l.id}')" title="${l.notaInterna.slice(0,60)}"><i class="ti ti-note" style="font-size:10px"></i></span>` : ""}
              </div>
              <div style="font-size:11px;color:var(--txt3);display:flex;align-items:center;gap:5px;margin-top:2px;flex-wrap:wrap">
                ${esc(l.evento || '—')}
                <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:#EEEDFE;color:#534AB7;border:1px solid #AFA9EC"><i class="ti ti-gift" style="font-size:10px"></i>Aluguel</span>
                ${l.tipo === "montagem" ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:#E1F5EE;color:#0F6E56;border:1px solid #9FE1CB"><i class="ti ti-tool" style="font-size:10px"></i>Montagem</span>` : ""}
                ${(() => {
                  const ent = l.entrega;
                  const temEnt = l.temEntrega === true ||
                                 (typeof ent === "number" && ent > 0) ||
                                 (typeof ent === "object" && ent && (ent.val > 0 || ent.km > 0)) ||
                                 !!l.entregaEnd ||
                                 (parseFloat(l.entregaKm) > 0);
                  return temEnt ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:#E6F1FB;color:#185FA5;border:1px solid #85B7EB"><i class="ti ti-truck" style="font-size:10px"></i>Entrega</span>` : "";
                })()}
              </div>
              ${tel}
            </div>
          </div>
        </td>
        <td data-label="Datas">
          <div style="font-size:12px;font-weight:600;color:var(--txt)">${fmtD(l.retirada)} → ${fmtD(l.devolucao)}</div>
          ${dias !== null ? `<div style="font-size:11px;color:var(--txt3);margin-top:2px;display:flex;align-items:center;gap:3px"><i class="ti ti-clock" style="font-size:10px"></i> ${dias} dia${dias !== 1 ? "s" : ""}</div>` : ""}
          ${retTag || devTag ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">${retTag}${devTag}</div>` : ""}
          ${end}
        </td>
        <td data-label="Itens" style="overflow:hidden;max-width:0">
          <div style="overflow:hidden;max-width:100%">
          ${kitsLoc.length ? `<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:3px;overflow:hidden">${kitsHtml}</div>` : ""}
          ${nItens > 0 ? `<div style="font-size:11px;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i class="ti ti-box" style="font-size:10px"></i> ${nItens} item${nItens !== 1 ? "s" : ""} avulso${nItens !== 1 ? "s" : ""}</div>` : ""}
          ${!kitsLoc.length && !nItens ? `<span style="font-size:11px;color:var(--txt3)">—</span>` : ""}
          </div>
        </td>
        <td data-label="Valor">
          <div style="font-weight:700;font-size:14px;color:${saldo > 0 ? "var(--p)" : "#3B6D11"}">${fmtR(l.total)}</div>
          ${entradaInfo}
          ${saldo > 0
            ? `<div style="font-size:11px;color:#A32D2D;display:flex;align-items:center;gap:3px;margin-top:2px;font-weight:600"><i class="ti ti-alert-circle" style="font-size:11px"></i> Saldo ${fmtR(saldo)}</div>`
            : `<div style="font-size:11px;color:#3B6D11;display:flex;align-items:center;gap:3px;margin-top:2px;font-weight:600"><i class="ti ti-circle-check" style="font-size:11px"></i> Pago</div>`}
        </td>
        <td data-label="Status"><span class="badge ${sb[l.status] || "bgray"}">${sl[l.status] || l.status}</span></td>
        <td style="text-align:right">
          <div class="loc-acts" style="justify-content:flex-end">

            ${l.status === "orcamento" ? `
            <button class="lac lac-confirmar" onclick="confirmarLoc('${l.id}')" title="Aceitar solicitação">
              <i class="ti ti-thumb-up" style="font-size:14px"></i><span>Aceitar</span>
            </button>` : ""}

            ${l.status === "aceito" ? `
            <button class="lac lac-whats" onclick="abrirModalCobrancaEntradaPorId('${l.id}')" title="Cobrar pagamento">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.133 1.527 5.887L.057 23.996l6.304-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg><span>Cobrar</span>
            </button>` : ""}

            ${l.status === "aguardando_entrada" ? `
            <button class="lac lac-entrada" onclick="confirmarEntradaPaga('${l.id}')" title="Confirmar pagamento recebido">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>Confirmar Pag.</span>
            </button>
            <button class="lac lac-whats" onclick="abrirModalCobrancaEntradaPorId('${l.id}')" title="Cobrar pagamento">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.133 1.527 5.887L.057 23.996l6.304-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg><span>Cobrar</span>
            </button>` : ""}

            ${l.status === "aguardando_assinatura" && l.assinadoEm ? `
            <button class="lac" onclick="confirmarRetirada('${l.id}')" title="Liberar para retirada" style="background:#f0fdf4;color:#15803d;border-color:#86efac">
              <i class="ti ti-package" style="font-size:14px"></i><span>Liberar retirada</span>
            </button>` : ""}

            ${l.status === "ativo" && saldo > 0 ? `
            <button class="lac lac-pagar" onclick="receberSaldo('${l.id}')" title="Receber saldo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg><span>Receber</span>
            </button>` : ""}

            ${l.status === "ativo" ? `
            <button class="lac lac-devolver" onclick="devolverLoc('${l.id}')" title="Marcar devolvido">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg><span>Devolvido</span>
            </button>` : ""}

            <button class="lac lac-contrato" onclick="verContrato('${l.id}')" title="Ver contrato">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Contrato</span>
            </button>
            ${l.assinadoEm ? `<span title="Assinado por ${l.assinadoPor||''} em ${new Date(l.assinadoEm).toLocaleDateString('pt-BR')}" style="display:inline-flex;align-items:center;gap:3px;padding:5px 8px;border-radius:8px;background:#f0fdf4;color:#15803d;border:1.5px solid #86efac;font-size:10px;font-weight:700;white-space:nowrap"><i class="ti ti-rosette-discount-check" style="font-size:12px"></i>Assinado</span>` : ""}
            <button class="lac lac-menu" onclick="menuAcoes('${l.id}',this)" title="Mais ações">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join("");

    // ── Mobile: escrever em cards-loc, esconder tabela ───────
    const isMob   = window.innerWidth < 700;
    const twEl    = document.getElementById("tw-loc");
    const cardsEl = document.getElementById("cards-loc");

    if (isMob && cardsEl && twEl) {
      twEl.style.display = "none";
      cardsEl.style.display = "block";

      cardsEl.innerHTML = slice.map(l => {
        const c      = clientes.find(x => x.id === l.clienteId);
        const borda  = borderCor[l.status] || "#e5e7eb";
        const rbg    = rowBg[l.status]     || "transparent";
        const avBg   = avatarBg[l.status]  || "var(--pl)";
        const avCor  = avatarCor[l.status] || "var(--pd)";
        const inic   = (c?.nome || "?").split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
        const saldo  = l.saldo || 0;
        const dias   = l.retirada && l.devolucao
          ? Math.round((new Date(l.devolucao) - new Date(l.retirada)) / 864e5) : null;
        const kitsLoc = (l.itens || []).filter(i => i.tipo === "kit");
        const nItens  = (l.itens || []).filter(i => i.tipo !== "kit").reduce((a,i) => a+(i.qtd||1),0);
        const kitNome = kitsLoc[0] ? (kitsLoc[0].nome||"Kit").replace(/\(.*?\)/g,"").trim() : "";

        // Botões de ação (mesmos da tabela desktop)
        const acoes = `
          ${l.status === "orcamento" ? `<button class="lac lac-confirmar" onclick="confirmarLoc('${l.id}')"><i class="ti ti-thumb-up" style="font-size:13px"></i><span>Aceitar</span></button>` : ""}
          ${l.status === "aceito" ? `<button class="lac lac-whats" onclick="abrirModalCobrancaEntradaPorId('${l.id}')"><i class="ti ti-brand-whatsapp" style="font-size:13px"></i><span>Cobrar</span></button>` : ""}
          ${l.status === "aguardando_entrada" ? `<button class="lac lac-entrada" onclick="confirmarEntradaPaga('${l.id}')"><i class="ti ti-check" style="font-size:13px"></i><span>Confirmar Pag.</span></button>` : ""}
          ${l.status === "aguardando_assinatura" && l.assinadoEm
            ? `<button class="lac" onclick="confirmarRetirada('${l.id}')" style="background:#f0fdf4;color:#15803d;border-color:#86efac"><i class="ti ti-package" style="font-size:13px"></i><span>Liberar</span></button>`
            : ""}
          ${l.status === "ativo" && saldo > 0 ? `<button class="lac lac-pagar" onclick="receberSaldo('${l.id}')"><i class="ti ti-cash" style="font-size:13px"></i><span>Receber</span></button>` : ""}
          ${l.status === "ativo" ? `<button class="lac lac-devolver" onclick="devolverLoc('${l.id}')"><i class="ti ti-check" style="font-size:13px"></i><span>Devolvido</span></button>` : ""}
          <button class="lac lac-contrato" onclick="verContrato('${l.id}')"><i class="ti ti-file-text" style="font-size:13px"></i><span>Contrato</span></button>
          ${l.assinadoEm ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:5px 8px;border-radius:8px;background:#f0fdf4;color:#15803d;border:1.5px solid #86efac;font-size:10px;font-weight:700"><i class="ti ti-rosette-discount-check" style="font-size:11px"></i>Assinado</span>` : ""}
          <button class="lac lac-menu" onclick="menuAcoes('${l.id}',this)"><i class="ti ti-dots" style="font-size:14px"></i></button>`;

        return `<div class="loc-card-m" style="border-left:3px solid ${borda};background:${rbg}">
          <div class="loc-card-m-top">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:40px;height:40px;border-radius:50%;background:${avBg};color:${avCor};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${inic}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:14px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c?.nome||"—")}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                  <span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:#EEEDFE;color:#534AB7;border:1px solid #AFA9EC">${esc(l.evento||"—")}</span>
                  <span class="badge ${sb[l.status]||"bgray"}" style="font-size:10px">${sl[l.status]||l.status}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="loc-card-m-dados">
            <div class="loc-card-m-dado"><label>Datas</label><span style="font-size:12px">${fmtD(l.retirada)} → ${fmtD(l.devolucao)}</span>${dias!==null?`<span style="font-size:11px;font-weight:500;color:var(--txt3)">${dias} dias</span>`:""}</div>
            <div class="loc-card-m-dado"><label>Valor</label><span style="color:${saldo>0?"var(--p)":"#3B6D11"}">${fmtR(l.total)}</span>${saldo>0?`<span style="font-size:11px;color:#A32D2D;font-weight:600">Saldo ${fmtR(saldo)}</span>`:`<span style="font-size:11px;color:#3B6D11">✓ Pago</span>`}</div>
            ${kitNome?`<div class="loc-card-m-dado" style="grid-column:1/-1"><label>Kit</label><span style="font-size:12px">${esc(kitNome)}${kitsLoc.length>1?` +${kitsLoc.length-1}`:""}</span></div>`:""}
            ${nItens?`<div class="loc-card-m-dado"><label>Itens avulsos</label><span style="font-size:12px">${nItens} item${nItens!==1?"s":""}</span></div>`:""}
            ${c?.tel?`<div class="loc-card-m-dado"><label>Telefone</label><span style="font-size:12px">${esc(c.tel)}</span></div>`:""}
          </div>
          <div class="loc-card-m-acts">${acoes}</div>
        </div>`;
      }).join("");
    } else {
      if (twEl)    twEl.style.display = "";
      if (cardsEl) cardsEl.style.display = "none";
    }
  });
};

// ─── Editar locação existente ────────────────────────────────────────────────
window.editarLocacao = async function(id) {
  const l = locacoes.find(x => x.id === id); if (!l) return;
  if (!await window.confirmar({ titulo:"Reabrir locação", msg:"O contrato atual será substituído ao concluir. Deseja continuar com a edição?", tipo:"warning", labelOk:"Reabrir" })) return;

  // Resetar estado
  locItens.length = 0;

  // Preencher wizard com dados da locação
  sv("loc-tipo",    l.tipo     || "aluguel");
  sv("loc-cli",     l.clienteId || "");
  // Preencher campo de busca de cliente com nome
  const _cliEd = clientes.find(x => x.id === l.clienteId);
  const _srchEd = el("loc-cli-search"); if (_srchEd && _cliEd) _srchEd.value = _cliEd.nome || "";
  sv("loc-ret",     l.retirada  || "");
  sv("loc-dev",     l.devolucao || "");
  sv("loc-evento",  l.evento    || "");
  sv("loc-local",   l.local     || "");
  sv("loc-obs",     l.obs       || "");
  sv("loc-horas",   l.horas     || "");
  sv("loc-vh",      l.valorHora || "");
  sv("loc-desc",    l.desconto  || "0");
  sv("loc-entrada", l.entrada   || "");
  sv("loc-pgto",    l.pagamento || "");
  sv("loc-total",   l.total     || "0");

  // Recarregar itens
  (l.itens || []).forEach(it => locItens.push({ ...it }));

  // Preencher selects
  const sc = el("loc-cli");
  if (sc) sc.innerHTML = '<option value="">Selecione...</option>' +
    [...clientes].sort((a,b) => (a.nome||'').localeCompare(b.nome||'')).map(c =>
      `<option value="${c.id}"${c.id === l.clienteId ? " selected" : ""}>${c.nome}</option>`
    ).join("");

  window.popularSelectItens?.(l.retirada, l.devolucao);
  window.popularSelectDecs?.(l.retirada, l.devolucao);
  window.toggleTipo?.();

  // Restaurar dados de entrega se houver
  if (l.tipo === "entrega" && l.entrega) {
    setTimeout(() => {
      const cepEl = document.getElementById("loc-entrega-cep");
      const pkmEl = document.getElementById("loc-entrega-pkm");
      const kmEl  = document.getElementById("loc-entrega-km");
      const valEl = document.getElementById("loc-entrega-val");
      if (cepEl && l.entrega.cep) cepEl.value = l.entrega.cep;
      if (pkmEl && l.entrega.pkm) pkmEl.value = l.entrega.pkm;
      if (kmEl  && l.entrega.km)  kmEl.value  = l.entrega.km;
      if (valEl && l.entrega.val) valEl.value  = l.entrega.val;
    }, 100);
  }

  // BUG FIX: Restaurar calendário de datas ao editar
  if (l.retirada && l.devolucao) {
    const d = new Date(l.retirada + "T12:00:00");
    // BUG FIX: Atualizar propriedades do _calR interno (não substituir referência)
    const _cr = window._calR || _calR;
    _cr.mes = d.getMonth(); _cr.ano = d.getFullYear();
    _cr.ret = l.retirada; _cr.dev = l.devolucao;
    if (window.renderCalRange) window.renderCalRange();
    const ri = document.getElementById("loc-ret-input"); if (ri) ri.value = _isoParaBr(l.retirada);
    const di = document.getElementById("loc-dev-input"); if (di) di.value = _isoParaBr(l.devolucao);
  }

  // Salvar id original para substituir ao concluir
  sv("loc-edit-id", id);

  // Abrir modal no step 1
  const modal = el("modal-loc"); if (modal) modal.classList.add("on");
  window.wizGo?.(1);
  renderLocItens();
  calcTotal();
};

// ─── Wizard step 2 (chamado via window._wizNext2 pelo navigation.js) ─────────
window._wizNext2 = function () {
  if (window.gv("loc-tipo") === "aluguel" && locItens.filter(x => x.tipo !== "kit").length === 0) {
    window.notif("Adicione pelo menos um item!", true); return;
  }
  const c     = clientes.find(x => x.id === window.gv("loc-cli"));
  const total = parseFloat(window.gv("loc-total")) || 0;
  const ri    = document.getElementById("res-info");
  const rl    = document.getElementById("res-lista");
  if (ri) ri.innerHTML =
    `<div class="res-i"><div class="res-l">Cliente</div><div class="res-v">${c ? c.nome : "-"}</div></div>` +
    `<div class="res-i"><div class="res-l">Evento</div><div class="res-v">${window.gv("loc-evento") || "-"}</div></div>` +
    `<div class="res-i"><div class="res-l">Retirada</div><div class="res-v">${window.fmtD(window.gv("loc-ret"))}</div></div>` +
    `<div class="res-i"><div class="res-l">Devolução</div><div class="res-v">${window.fmtD(window.gv("loc-dev"))}</div></div>`;
  if (rl) {
    let h = locItens.filter(x => x.tipo !== "kit")
      .map(it => `<div class="res-lin"><span>${it.nome} x${it.qtd}</span><span style="font-weight:600;color:var(--p)">${window.fmtR(it.preco * it.qtd)}</span></div>`)
      .join("");

    // Montagem / serviço
    const tipo      = window.gv("loc-tipo");
    const horas     = parseFloat(window.gv("loc-horas")) || 0;
    const vh        = parseFloat(window.gv("loc-vh"))    || 0;
    const totalMont = horas * vh;
    if (tipo === "montagem" && totalMont > 0) {
      h += `<div class="res-lin" style="background:#E1F5EE;border-radius:8px;padding:4px 8px;margin:2px 0">
        <span style="color:#0F6E56;font-weight:600"><i class="ti ti-tool" style="font-size:11px"></i> Serviço de montagem (${horas}h × ${window.fmtR(vh)})</span>
        <span style="font-weight:700;color:#0F6E56">${window.fmtR(totalMont)}</span>
      </div>`;
    }

    // Entrega — usar valor salvo ao avançar do step 1
    const valFrete = window._pendingEntregaVal || parseFloat(window.gv("loc-entrega-val-hidden") || window.gv("loc-entrega-val")) || 0;
    const temFrete = window._pendingEntrega || valFrete > 0;
    if (temFrete && valFrete > 0) {
      const endEnt   = window.gv("loc-entrega-end") || window.gv("loc-entrega-cep") || "";
      const labelEnd = endEnt ? ` — ${endEnt}` : "";
      h += `<div class="res-lin" style="background:#E6F1FB;border-radius:8px;padding:4px 8px;margin:2px 0">
        <span style="color:#185FA5;font-weight:600"><i class="ti ti-truck" style="font-size:11px"></i> Entrega${labelEnd}</span>
        <span style="font-weight:700;color:#185FA5">${window.fmtR(valFrete)}</span>
      </div>`;
    }

    // Desconto
    const desc = parseFloat(window.gv("loc-desc")) || 0;
    if (desc > 0) {
      h += `<div class="res-lin" style="color:#059669"><span>Desconto</span><span style="font-weight:600;color:#059669">- ${window.fmtR(desc)}</span></div>`;
    }

    h += `<div class="res-tot"><span>TOTAL</span><span>${window.fmtR(total)}</span></div>`;
    rl.innerHTML = h;
  }
  if (document.getElementById("total-desc")) document.getElementById("total-desc").textContent = window.fmtR(total);
  // BUG FIX: Só resetar desconto/entrada em locação nova — preservar na edição
  const _isEdicao = !!(window.gv("loc-edit-id"));
  if (!_isEdicao) {
    window.sv("loc-desc", "0");
    const metade = Math.round(total * 0.5 * 100) / 100;
    window.sv("loc-entrada", metade > 0 ? metade.toFixed(2) : "");
  }
  calcSaldo();
  window.wizGo(3);
};

// ─── Fotos do evento ──────────────────────────────────────────────────────────
let _fotosEventoAtual = [];
let _fotosLocId = "";

window.abrirFotosEvento = function(locId) {
  _fotosLocId = locId;
  const loc = locacoes.find(x => x.id === locId);
  _fotosEventoAtual = loc?.fotosEvento ? [...loc.fotosEvento] : [];
  renderFotosEvento();
  document.getElementById("foto-evento-loc-id").value = locId;
  document.getElementById("modal-foto-evento")?.classList.add("on");
};

function renderFotosEvento() {
  const div = document.getElementById("fotos-evento-lista"); if (!div) return;
  if (!_fotosEventoAtual.length) {
    div.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--txt3);font-size:12px;padding:12px">Nenhuma foto adicionada</div>';
    return;
  }
  div.innerHTML = _fotosEventoAtual.map((f, i) =>
    `<div style="position:relative">
      <img src="${f}" style="width:100%;height:80px;object-fit:cover;border-radius:8px">
      <button onclick="removerFotoEvento(${i})" style="position:absolute;top:3px;right:3px;background:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:1">×</button>
    </div>`
  ).join("");
}

window.removerFotoEvento = function(i) {
  _fotosEventoAtual.splice(i, 1);
  renderFotosEvento();
};

window.adicionarFotoEvento = function(input) {
  Array.from(input.files).forEach(file => {
    if (file.size > 3*1024*1024) { notif("Foto "+file.name+" muito grande! Máx 3MB", true); return; }
    const r = new FileReader();
    r.onload = e => { _fotosEventoAtual.push(e.target.result); renderFotosEvento(); };
    r.readAsDataURL(file);
  });
  input.value = "";
};

window.salvarFotosEvento = async function() {
  const locId = document.getElementById("foto-evento-loc-id")?.value; if (!locId) return;
  try {
    await updateDoc(doc(db, "locacoes", locId), { fotosEvento: _fotosEventoAtual });
    document.getElementById("modal-foto-evento")?.classList.remove("on");
    notif("Fotos salvas!");
  } catch(e) { notif("Erro: "+e.message, true); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAÇÃO RECORRENTE — Duplicar com 1 clique
// ═══════════════════════════════════════════════════════════════════════════════
window.duplicarLocacao = async function(locId) {
  const loc = locacoes.find(x => x.id === locId);
  if (!loc) return;
  if (!await window.confirmar({ titulo:"Duplicar locação", msg:"Será criada uma cópia como novo orçamento. Deseja continuar?", tipo:"info", labelOk:"Duplicar" })) return;
  const nova = {
    ...loc,
    status:    "orcamento",
    retirada:  "",
    devolucao: "",
    entrada:   0,
    saldo:     loc.total || 0,
    criadoEm:  { seconds: Math.floor(Date.now()/1000) },
    notaInterna: "",
  };
  delete nova.id;
  try {
    await addDoc(collection(db, "locacoes"), nova);
    notif("Locação duplicada como orçamento!");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOG DE ALTERAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
window.verLogAlteracoes = async function(locId) {
  try {
    const q = query(collection(db, "logs"), where("locId","==",locId), orderBy("ts","desc"));
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => d.data());
    let html = logs.length
      ? logs.map(l => `<div style="padding:8px 0;border-bottom:1px solid var(--bdr);font-size:13px">
          <div style="font-weight:600;color:var(--txt)">${l.acao || "Alteração"}</div>
          <div style="color:var(--txt3);font-size:11px">${l.usuario || "Sistema"} · ${l.ts ? new Date(l.ts.seconds*1000).toLocaleString("pt-BR") : ""}</div>
          ${l.detalhe ? `<div style="color:var(--txt2);margin-top:3px">${l.detalhe}</div>` : ""}
        </div>`).join("")
      : "<p style='color:var(--txt3);font-size:13px'>Nenhuma alteração registrada.</p>";
    const ov = document.createElement("div");
    ov.className = "ov on ov-top";
    ov.innerHTML = `<div class="modal modal-sm"><div class="modal-h"><h3>📋 Histórico de alterações</h3><button class="mclose" onclick="this.closest('.ov').remove()"><i class="ti ti-x"></i></button></div><div class="modal-b" style="max-height:400px;overflow-y:auto">${html}</div></div>`;
    document.body.appendChild(ov);
  } catch(e) { notif("Erro ao carregar log", true); }
};

export async function registrarLog(locId, acao, detalhe, auth) {
  try {
    await addDoc(collection(db, "logs"), {
      locId, acao, detalhe: detalhe || "",
      usuario: auth?.currentUser?.email || "Sistema",
      ts: serverTimestamp()
    });
  } catch(_) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTAR LOCAÇÕES CSV
// ═══════════════════════════════════════════════════════════════════════════════
window.exportarLocacoesCSV = function() {
  const header = ["Cliente","Evento","Tipo","Status","Retirada","Devolução","Total","Entrada","Saldo","Pagamento","Criado em"];
  const rows = locacoes.map(l => {
    const c = clientes.find(x => x.id === l.clienteId);
    return [
      `"${c?.nome || ""}"`,
      `"${l.evento || ""}"`,
      `"${l.tipo || "aluguel"}"`,
      `"${l.status || ""}"`,
      l.retirada || "",
      l.devolucao || "",
      (l.total || 0).toFixed(2).replace(".", ","),
      (l.entrada || 0).toFixed(2).replace(".", ","),
      (l.saldo || 0).toFixed(2).replace(".", ","),
      `"${l.pagamento || ""}"`,
      l.criadoEm?.seconds ? new Date(l.criadoEm.seconds * 1000).toLocaleDateString("pt-BR") : "",
    ].join(";");
  });
  const csv = "\uFEFF" + [header.join(";"), ...rows].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `locacoes_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  notif("Planilha exportada!");
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDADE DE ORÇAMENTO — Alerta de orçamentos prestes a expirar
// ═══════════════════════════════════════════════════════════════════════════════
window.verificarOrcamentosExpirados = function() {
  const hoje = new Date();
  const orcamentos = locacoes.filter(l => l.status === "orcamento" && l.validadeOrc);
  const vencendo = orcamentos.filter(l => {
    const val = new Date(l.validadeOrc + "T23:59:59");
    const diff = Math.ceil((val - hoje) / (1000*60*60*24));
    return diff <= 1 && diff >= 0;
  });
  const vencidos = orcamentos.filter(l => {
    const val = new Date(l.validadeOrc + "T23:59:59");
    return val < hoje;
  });
  if (vencendo.length || vencidos.length) {
    const msgs = [];
    if (vencidos.length) msgs.push(`${vencidos.length} orçamento(s) vencido(s)`);
    if (vencendo.length) msgs.push(`${vencendo.length} orçamento(s) vence hoje`);
    notif("⏰ " + msgs.join(" · "), false);
  }
};



// ═══════════════════════════════════════════════════════════════════════════════
// LONG PRESS para abrir menu de ações (mobile)
// ═══════════════════════════════════════════════════════════════════════════════
(function initLongPress() {
  let _lpTimer = null, _lpMoved = false;
  document.addEventListener("touchstart", e => {
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    _lpMoved = false;
    _lpTimer = setTimeout(() => {
      if (_lpMoved) return;
      window.haptic?.(15);
      const id = row.dataset.id;
      const btn = row.querySelector(".lac-menu, [onclick*='menuAcoes']");
      if (btn) menuAcoes(id, btn);
    }, 500);
  }, { passive: true });
  document.addEventListener("touchmove",  () => { _lpMoved = true; clearTimeout(_lpTimer); }, { passive: true });
  document.addEventListener("touchend",   () => clearTimeout(_lpTimer), { passive: true });
  document.addEventListener("touchcancel",() => clearTimeout(_lpTimer), { passive: true });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// FLUXO AGUARDANDO ENTRADA — Modal de cobrança e confirmação de entrada paga
// ═══════════════════════════════════════════════════════════════════════════════

function abrirModalCobrancaEntrada(loc) {
  const c    = clientes.find(x => x.id === loc.clienteId) || {};
  const pix  = cfg.pixKey || "";
  const num  = String(loc.id || "").slice(-6).toUpperCase();
  const nome = c.nome ? c.nome.split(" ")[0] : "cliente";

  const msg = montarMsgCobrancaEntrada(loc, c, pix, num);

  // Preencher modal
  const elMsg = document.getElementById("cobranca-msg-preview");
  if (elMsg) elMsg.textContent = msg;

  const elPix = document.getElementById("cobranca-pix-display");
  if (elPix) elPix.textContent = pix || "Não configurado — vá em Configurações → Empresa";

  const elNome = document.getElementById("cobranca-cliente-nome");
  if (elNome) elNome.textContent = c.nome || "Cliente";

  const elValor = document.getElementById("cobranca-entrada-valor");
  if (elValor) elValor.textContent = fmtR(loc.entrada || 0);

  const elLocId = document.getElementById("cobranca-loc-id");
  if (elLocId) elLocId.value = loc.id;

  // Guarda a mensagem para envio
  window._cobrancaMsg    = msg;
  window._cobrancaTel    = c.tel || "";
  window._cobrancaLocObj = loc;

  const ov = document.getElementById("modal-cobranca-entrada");
  if (ov) { ov.style.display = "flex"; ov.classList.add("on"); }
}
window.abrirModalCobrancaEntrada = abrirModalCobrancaEntrada;

function montarMsgCobrancaEntrada(loc, c, pix, num) {
  const nome = c.nome ? c.nome.split(" ")[0] : "cliente";
  const itensLista = (loc.itens || [])
    .filter(x => x.tipo !== "kit")
    .map(it => `  • ${it.nome} × ${it.qtd} — ${fmtR((it.preco || 0) * it.qtd)}`)
    .join("\n");

  return `🎀 *${cfg.nome || "Katreseli"} — Locação #${num}*\n\nOlá, *${nome}*! Sua locação foi registrada com sucesso! 🎉\n\n📅 *Retirada:* ${fmtD(loc.retirada)}\n📅 *Devolução:* ${fmtD(loc.devolucao)}\n🎉 *Evento:* ${loc.evento || "—"}\n\n*Itens inclusos:*\n${itensLista || "  (sem itens)"}\n\n${loc.desconto > 0 ? `🏷️ *Desconto:* − ${fmtR(loc.desconto)}\n` : ""}💰 *Valor total:* *${fmtR(loc.total)}*\n\n━━━━━━━━━━━━━━━━━\n💳 *ENTRADA A PAGAR: ${fmtR(loc.entrada || 0)}*\n📌 *Saldo na entrega:* ${fmtR(loc.saldo || 0)}\n━━━━━━━━━━━━━━━━━\n\n${pix ? `✅ *Pagamento via PIX:*\n🔑 Chave: *${pix}*\n\nApós o pagamento, nos envie o comprovante para confirmar a reserva. 📩` : "Solicite a forma de pagamento com nossa equipe."}\n\n_${cfg.nome || "Katreseli"} — ${cfg.slogan || "Locações de Decoração Infantil"}_`;
}

window.enviarCobrancaEntradaWhats = function() {
  const tel  = window._cobrancaTel || "";
  const msg  = window._cobrancaMsg || "";
  const nums = tel.replace(/\D/g, "");
  if (!nums) { notif("Cliente sem telefone cadastrado!", true); return; }
  const cc  = nums.startsWith("55") ? nums : "55" + nums;
  window.open(`https://wa.me/${cc}?text=${encodeURIComponent(msg)}`, "_blank");
  fecharModalCobrancaEntrada();
};

window.fecharModalCobrancaEntrada = function() {
  const ov = document.getElementById("modal-cobranca-entrada");
  if (!ov) return;
  ov.classList.remove("on");
  setTimeout(() => ov.style.display = "none", 200);
};

window.copiarChavePix = function() {
  const pix = cfg.pixKey || "";
  if (!pix) { notif("Chave PIX não configurada!", true); return; }
  navigator.clipboard?.writeText(pix).then(() => notif("Chave PIX copiada!")).catch(() => notif("Erro ao copiar", true));
};

// ─── Confirmar entrada paga (transforma em "ativo" e gera contrato + recibo) ──
window.confirmarEntradaPaga = async function(locId) {
  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  const entrada50 = Math.round((loc.total || 0) * 0.5 * 100) / 100;
  const entradaAtual = loc.entrada || entrada50;
  const saldoAtual   = Math.max(0, (loc.total || 0) - entradaAtual);

  // Modal personalizado com opções
  const escolha = await new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px";

    overlay.innerHTML = `
      <div style="background:var(--sur);border-radius:18px;padding:28px 28px 22px;max-width:400px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div style="width:36px;height:36px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="ti ti-currency-dollar" style="font-size:18px;color:#16a34a"></i>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--txt)">Confirmar entrada recebida</div>
        </div>
        <div style="font-size:13px;color:var(--txt3);margin-bottom:20px;padding-left:46px">
          <b style="color:var(--txt)">${(clientes.find(x=>x.id===loc.clienteId)||{}).nome||'Cliente'}</b> · ${fmtR(loc.total)} total
        </div>

        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--txt3);margin-bottom:10px">Quanto foi pago?</div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
          <label id="opt-50" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid var(--p);border-radius:12px;cursor:pointer;background:var(--pl)">
            <input type="radio" name="entrada-opt" value="50" checked style="accent-color:var(--p);width:16px;height:16px;flex-shrink:0">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--txt)">50% de entrada — ${fmtR(entradaAtual)}</div>
              <div style="font-size:11px;color:var(--txt3)">Saldo restante: ${fmtR(saldoAtual)}</div>
            </div>
          </label>
          <label id="opt-100" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--bdr2);border-radius:12px;cursor:pointer">
            <input type="radio" name="entrada-opt" value="100" style="accent-color:var(--p);width:16px;height:16px;flex-shrink:0">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--txt)">Valor total — ${fmtR(loc.total)}</div>
              <div style="font-size:11px;color:#16a34a;font-weight:600">✓ Locação quitada!</div>
            </div>
          </label>
        </div>

        <div style="display:flex;gap:8px">
          <button id="btn-cancelar-ent" style="flex:1;padding:11px;border-radius:10px;border:1.5px solid var(--bdr2);background:none;font-size:13px;font-weight:600;color:var(--txt2);cursor:pointer">Cancelar</button>
          <button id="btn-confirmar-ent" style="flex:2;padding:11px;border-radius:10px;border:none;background:var(--p);color:#fff;font-size:13px;font-weight:700;cursor:pointer">Confirmar recebimento</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Highlight ao mudar opção
    overlay.querySelectorAll("input[name=entrada-opt]").forEach(inp => {
      inp.addEventListener("change", () => {
        overlay.querySelector("#opt-50").style.cssText = inp.value === "50"
          ? "display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid var(--p);border-radius:12px;cursor:pointer;background:var(--pl)"
          : "display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--bdr2);border-radius:12px;cursor:pointer";
        overlay.querySelector("#opt-100").style.cssText = inp.value === "100"
          ? "display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid var(--p);border-radius:12px;cursor:pointer;background:var(--pl)"
          : "display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--bdr2);border-radius:12px;cursor:pointer";
      });
    });

    overlay.querySelector("#btn-cancelar-ent").onclick  = () => { overlay.remove(); resolve(null); };
    overlay.querySelector("#btn-confirmar-ent").onclick = () => {
      const val = overlay.querySelector("input[name=entrada-opt]:checked")?.value;
      overlay.remove();
      resolve(val);
    };
  });

  if (!escolha) return;

  const novaEntrada = escolha === "100" ? (loc.total || 0) : entradaAtual;
  const novoSaldo   = Math.max(0, (loc.total || 0) - novaEntrada);

  try {
    await updateDoc(doc(db, "locacoes", locId), {
      status: "aguardando_assinatura",
      entrada: novaEntrada,
      saldo:   novoSaldo,
      pagamentoConfirmadoEm: new Date().toISOString()
    });
    const locAtivo = { ...loc, status: "aguardando_assinatura", entrada: novaEntrada, saldo: novoSaldo };

    // Gerar contrato automaticamente e salvar no Firestore para o cliente assinar
    setTimeout(() => gerarContrato(locAtivo, true), 300);  // silent — só salva

    notif(escolha === "100" ? "✅ Pagamento confirmado! Contrato enviado para assinatura." : "✅ Entrada confirmada! Contrato enviado para assinatura.");
    setTimeout(() => abrirModalConfirmacaoAtivo(locAtivo), 600);
  } catch(e) { notif("Erro: " + e.message, true); }
};

function abrirModalConfirmacaoAtivo(loc) {
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  const num = String(loc.id || "").slice(-6).toUpperCase();

  const msg = `✅ *${cfg.nome || "Katreseli"} — Locação Confirmada #${num}*\n\nOlá, *${c.nome ? c.nome.split(" ")[0] : ""}*! Recebemos seu pagamento e sua locação está *confirmada*! 🎉\n\n📅 *Retirada:* ${fmtD(loc.retirada)}\n📅 *Devolução:* ${fmtD(loc.devolucao)} até as 18h\n🎉 *Evento:* ${loc.evento || "—"}\n\n💰 *Total:* ${fmtR(loc.total)}\n✅ *Entrada paga:* ${fmtR(loc.entrada || 0)}\n${(loc.saldo || 0) > 0 ? `📌 *Saldo na entrega:* ${fmtR(loc.saldo)}` : "✅ *Locação quitada!*"}\n\n📎 Em anexo: contrato e comprovante de pagamento.\n\nQualquer dúvida, estamos à disposição! 😊\n\n_${cfg.nome || "Katreseli"}_`;

  window._confirmacaoMsg = msg;
  window._confirmacaoTel = c.tel || "";
  window._confirmacaoLoc = loc; // guardar referência para gerar PDFs sob demanda

  const elMsg = document.getElementById("confirmacao-ativa-msg");
  if (elMsg) elMsg.textContent = msg;

  const elNome = document.getElementById("confirmacao-ativa-nome");
  if (elNome) elNome.textContent = c.nome || "Cliente";

  // Resetar checks de PDF
  ["check-contrato","check-comprovante"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const btnC = document.getElementById("btn-pdf-contrato");
  const btnR = document.getElementById("btn-pdf-comprovante");
  if (btnC) btnC.style.borderColor = "#bfdbfe";
  if (btnR) btnR.style.borderColor = "#fde68a";

  const ov = document.getElementById("modal-confirmacao-ativa");
  if (ov) { ov.style.display = "flex"; ov.classList.add("on"); }
}

// ─── Abrir PDF do contrato sob demanda ───────────────────────────────────────
window.baixarPdfContrato = function() {
  const loc = window._confirmacaoLoc; if (!loc) return;
  gerarContrato(loc);
  // Marcar como aberto
  setTimeout(() => {
    const check = document.getElementById("check-contrato");
    const btn   = document.getElementById("btn-pdf-contrato");
    if (check) { check.style.display = "flex"; }
    if (btn)   { btn.style.borderColor = "#86efac"; btn.style.background = "#f0fdf4"; }
  }, 500);
};

// ─── Abrir PDF do comprovante sob demanda ────────────────────────────────────
window.baixarPdfComprovante = function() {
  const loc = window._confirmacaoLoc; if (!loc) return;
  gerarReciboConfirmacao(loc);
  // Marcar como aberto
  setTimeout(() => {
    const check = document.getElementById("check-comprovante");
    const btn   = document.getElementById("btn-pdf-comprovante");
    if (check) { check.style.display = "flex"; }
    if (btn)   { btn.style.borderColor = "#86efac"; btn.style.background = "#f0fdf4"; }
  }, 500);
};

window.enviarConfirmacaoAtivaWhats = function() {
  const tel  = window._confirmacaoTel || "";
  const msg  = window._confirmacaoMsg || "";
  const nums = tel.replace(/\D/g, "");
  if (!nums) { notif("Cliente sem telefone cadastrado!", true); return; }
  const cc  = nums.startsWith("55") ? nums : "55" + nums;
  window.open(`https://wa.me/${cc}?text=${encodeURIComponent(msg)}`, "_blank");
  fecharModalConfirmacaoAtiva();
};

window.fecharModalConfirmacaoAtiva = function() {
  const ov = document.getElementById("modal-confirmacao-ativa");
  if (!ov) return;
  ov.classList.remove("on");
  setTimeout(() => ov.style.display = "none", 200);
};

window.abrirModalCobrancaEntradaPorId = function(locId) {
  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  abrirModalCobrancaEntrada(loc);
};
