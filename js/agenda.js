/**
 * agenda.js — Agenda visual: quais itens estão fora em cada dia
 */
import { locacoes, clientes, itens } from "./state.js";
import { fmtR, fmtD, el }            from "./helpers.js";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

let _agMes = new Date().getMonth();
let _agAno = new Date().getFullYear();

export function renderAgenda() {
  const lbl  = el("ag-label"); if (lbl) lbl.textContent = `${MESES[_agMes]} ${_agAno}`;
  const grid = el("ag-grid");  if (!grid) return;

  const prim = new Date(_agAno, _agMes, 1).getDay();
  const tot  = new Date(_agAno, _agMes + 1, 0).getDate();
  const hoje = new Date().toISOString().split("T")[0];

  // Montar mapa: dia → locações ativas
  const mapa = {};
  for (let d = 1; d <= tot; d++) {
    const ds = `${_agAno}-${String(_agMes+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    mapa[ds] = locacoes.filter(l =>
      l.status !== "cancelado" && l.retirada && l.devolucao &&
      l.retirada <= ds && l.devolucao >= ds
    );
  }

  let html = '<div class="ag-dias-hdr">';
  ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].forEach(d => {
    html += `<div class="ag-hdr-cel">${d}</div>`;
  });
  html += "</div><div class='ag-dias-grid'>";

  // Células vazias antes do dia 1
  for (let i = 0; i < prim; i++) html += `<div class="ag-cel ag-vazio"></div>`;

  for (let d = 1; d <= tot; d++) {
    const ds   = `${_agAno}-${String(_agMes+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const lns  = mapa[ds] || [];
    const eHj  = ds === hoje;
    const ocup = lns.length;

    let cor = "";
    if (ocup >= 3)     cor = "ag-cheio";
    else if (ocup > 0) cor = "ag-parcial";
    if (eHj)           cor += " ag-hoje";

    const chips = lns.slice(0, 3).map(l => {
      const c = clientes.find(x => x.id === l.clienteId) || {};
      return `<div class="ag-chip" title="${c.nome || ""} — ${l.evento || ""}">${(c.nome || "").split(" ")[0]}</div>`;
    }).join("") + (lns.length > 3 ? `<div class="ag-chip ag-mais">+${lns.length-3}</div>` : "");

    html += `<div class="ag-cel ${cor}" onclick="agendaVerDia('${ds}')">
      <div class="ag-cel-num">${d}</div>
      <div class="ag-cel-chips">${chips}</div>
    </div>`;
  }
  html += "</div>";
  grid.innerHTML = html;
}
window.renderAgenda = renderAgenda;

// ─── Detalhe do dia ──────────────────────────────────────────────────────────
window.agendaVerDia = function(ds) {
  const lns  = locacoes.filter(l =>
    l.status !== "cancelado" && l.retirada <= ds && l.devolucao >= ds
  );
  const det  = el("ag-det");
  const tit  = el("ag-det-titulo");
  if (tit) tit.textContent = `📅 ${fmtD(ds)}`;
  if (!det) return;

  if (!lns.length) {
    det.innerHTML = `<div style="padding:20px;text-align:center;color:var(--txt3)">
      <i class="ti ti-calendar-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      Nenhuma locação neste dia
    </div>`;
    return;
  }

  det.innerHTML = lns.map(l => {
    const c     = clientes.find(x => x.id === l.clienteId) || {};
    const isFim = l.devolucao === ds;
    const isIni = l.retirada  === ds;
    const badge = isIni && isFim ? "🔁 Retirada e devolução"
                : isIni          ? "📤 Retirada hoje"
                : isFim          ? "📥 Devolução hoje"
                : "📦 Em andamento";
    const corBadge = isFim ? "#b45309" : isIni ? "#059669" : "var(--p)";

    // Itens desta locação
    const itensHtml = (l.itens || []).filter(x => x.tipo !== "kit")
      .map(it => `<span class="ag-item-chip">${it.nome} ×${it.qtd}</span>`)
      .join("");

    return `<div class="ag-det-card">
      <div class="ag-det-top">
        <div>
          <div style="font-weight:700;font-size:14px">${c.nome || "—"}</div>
          <div style="font-size:12px;color:var(--txt2)">${l.evento || "Sem evento"} &bull; ${fmtD(l.retirada)} → ${fmtD(l.devolucao)}</div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${corBadge};white-space:nowrap">${badge}</span>
      </div>
      <div class="ag-itens-wrap">${itensHtml}</div>
      <div class="ag-det-acts">
        <span style="font-weight:700;color:var(--p)">${fmtR(l.total)}</span>
        ${(l.saldo||0) > 0 ? `<span style="font-size:11px;color:#b45309">Saldo: ${fmtR(l.saldo)}</span>` : `<span style="font-size:11px;color:#059669">✓ Quitado</span>`}
        <div style="display:flex;gap:6px;margin-left:auto">
          <button class="btn btn-s btn-xs" onclick="verContrato('${l.id}')"><i class="ti ti-file-text"></i></button>
          <button class="btn btn-s btn-xs" onclick="menuWhats('${l.id}',this)"><svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.133 1.527 5.887L.057 23.996l6.304-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374A9.856 9.856 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118S21.882 6.533 21.882 12 17.467 21.882 12 21.882z"/></svg></button>
        </div>
      </div>
    </div>`;
  }).join("");
};

// ─── Navegação ────────────────────────────────────────────────────────────────
window.agendaPrev = function() { _agMes--; if (_agMes < 0) { _agMes = 11; _agAno--; } renderAgenda(); };
window.agendaNext = function() { _agMes++; if (_agMes > 11){ _agMes = 0;  _agAno++; } renderAgenda(); };
window.agendaHoje = function() { _agMes = new Date().getMonth(); _agAno = new Date().getFullYear(); renderAgenda(); };
