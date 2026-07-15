/**
 * financeiro-extra.js — Contas a receber, custos operacionais e gráfico mensal
 */
import { db, collection, addDoc, deleteDoc, doc, serverTimestamp }
  from "./firebase.js";
import { el, fmtR, fmtD, notif, gv, sv } from "./helpers.js";
import { locacoes, clientes, cfg }        from "./state.js";

// ─── Estado ───────────────────────────────────────────────────────────────────
export let custos = [];
export function setCustos(v) { custos.length = 0; custos.push(...v); }

// ─── Contas a receber ─────────────────────────────────────────────────────────
export function renderContasReceber() {
  const div = el("fin-contas"); if (!div) return;
  const hoje = new Date().toISOString().split("T")[0];

  const pendentes = locacoes
    .filter(l => (["ativo","aceito","aguardando_entrada","aguardando_assinatura"].includes(l.status)) && (l.saldo || 0) > 0)
    .sort((a, b) => (a.devolucao || "").localeCompare(b.devolucao || ""));

  const total = pendentes.reduce((a, b) => a + (b.saldo || 0), 0);
  const el2 = el("fin-total-receber"); if (el2) el2.textContent = fmtR(total);

  if (!pendentes.length) {
    div.innerHTML = `<div style="padding:20px;text-align:center;color:var(--txt3)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32" style="display:block;margin:0 auto 8px;opacity:.3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Nenhum saldo pendente!
    </div>`;
    return;
  }

  div.innerHTML = pendentes.map(l => {
    const c = clientes.find(x => x.id === l.clienteId) || {};
    const dias = Math.round((new Date(l.devolucao) - new Date(hoje)) / (1000*60*60*24));
    const cor  = dias < 0 ? "#ef4444" : dias === 0 ? "#f97316" : dias <= 2 ? "#eab308" : "#059669";
    const label = dias < 0 ? `${Math.abs(dias)}d atrasado` : dias === 0 ? "Hoje" : `${dias}d`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--bdr)">
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${c.nome || "—"}</div>
        <div style="font-size:11px;color:var(--txt2)">${l.evento || "—"} &bull; Dev: ${fmtD(l.devolucao)}</div>
      </div>
      <span style="font-size:11px;font-weight:700;color:${cor};background:${cor}15;padding:2px 8px;border-radius:8px">${label}</span>
      <div style="text-align:right">
        <div style="font-weight:800;color:#b45309">${fmtR(l.saldo)}</div>
        <button class="btn btn-s btn-xs" style="margin-top:3px" onclick="receberSaldo('${l.id}')">Receber</button>
      </div>
    </div>`;
  }).join("");
}
window.renderContasReceber = renderContasReceber;

// ─── Custos operacionais ──────────────────────────────────────────────────────
export function renderCustos() {
  const div = el("fin-custos-lista"); if (!div) return;
  const totalEl = el("fin-custos-total");
  const total = custos.reduce((a, b) => a + (b.valor || 0), 0);
  if (totalEl) totalEl.textContent = fmtR(total);

  if (!custos.length) {
    div.innerHTML = `<div style="padding:16px;text-align:center;color:var(--txt3);font-size:13px">Nenhum custo registrado</div>`;
    return;
  }
  div.innerHTML = custos
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .map(c => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--bdr);font-size:13px">
      <div style="flex:1">
        <div style="font-weight:500">${c.descricao}</div>
        <div style="font-size:11px;color:var(--txt3)">${c.categoria || "Geral"} &bull; ${fmtD(c.data)}</div>
      </div>
      <span style="font-weight:700;color:#ef4444">${fmtR(c.valor)}</span>
      <button class="btn btn-d btn-xs" onclick="delCusto('${c.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>`).join("");
}
window.renderCustos = renderCustos;

window.salvarCusto = async function() {
  const desc = gv("custo-desc"), val = parseFloat(gv("custo-val")) || 0;
  if (!desc || !val) { notif("Preencha descrição e valor!", true); return; }
  const dados = {
    descricao: desc, valor: val,
    categoria: gv("custo-cat") || "Geral",
    data: gv("custo-data") || new Date().toISOString().split("T")[0],
    criadoEm: serverTimestamp()
  };
  try {
    await addDoc(collection(db, "custos"), dados);
    sv("custo-desc",""); sv("custo-val",""); sv("custo-cat","Geral");
    notif("Custo registrado!");
    document.getElementById("modal-custo")?.classList.remove("on");
  } catch(e) { notif("Erro: "+e.message, true); }
};

window.delCusto = async function(id) {
  if (!await window.confirmar({ titulo:"Remover custo", msg:"Deseja remover este custo operacional?", tipo:"danger", labelOk:"Remover" })) return;
  await deleteDoc(doc(db, "custos", id));
  notif("Removido.");
};

window.abrirModalCusto = function() {
  sv("custo-data", new Date().toISOString().split("T")[0]);
  document.getElementById("modal-custo")?.classList.add("on");
};

// ─── Gráfico de faturamento mensal ────────────────────────────────────────────
export function renderGraficoMensal() {
  const canvas = el("grafico-faturamento"); if (!canvas) return;

  const agora = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({ mes: d.getMonth(), ano: d.getFullYear(),
      label: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][d.getMonth()] + "/" + String(d.getFullYear()).slice(2)
    });
  }

  const dados = meses.map(m => {
    const fat = locacoes
      .filter(l => {
        if (!l.retirada || (l.status !== "ativo" && l.status !== "devolvido")) return false;
        const d = new Date(l.retirada + "T12:00:00");
        return d.getMonth() === m.mes && d.getFullYear() === m.ano;
      })
      .reduce((a, b) => a + (b.total || 0), 0);
    const cst = custos
      .filter(c => {
        if (!c.data) return false;
        const d = new Date(c.data + "T12:00:00");
        return d.getMonth() === m.mes && d.getFullYear() === m.ano;
      })
      .reduce((a, b) => a + (b.valor || 0), 0);
    return { ...m, fat, cst };
  });

  const maxVal = Math.max(...dados.map(d => d.fat), 1);
  const cor    = cfg.cor || "#d4307a";
  const W = canvas.offsetWidth || 400;
  const H = 180;
  canvas.style.height = H + "px";

  const barW = Math.floor((W - 40) / meses.length);
  const pad  = Math.floor(barW * 0.18);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">`;

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = 10 + (140 - 10) * i / 4;
    const val = maxVal * (1 - i/4);
    svg += `<line x1="36" y1="${y}" x2="${W-4}" y2="${y}" stroke="#f0e0eb" stroke-width="1"/>`;
    svg += `<text x="32" y="${y+4}" text-anchor="end" font-size="8" fill="#ccc">${val >= 1000 ? (val/1000).toFixed(0)+"k" : val.toFixed(0)}</text>`;
  }

  dados.forEach((d, i) => {
    const x   = 40 + i * barW;
    const h   = d.fat > 0 ? Math.max(4, (d.fat / maxVal) * 130) : 0;
    const hc  = d.cst > 0 ? Math.max(2, (d.cst / maxVal) * 130) : 0;
    const y   = 150 - h;
    const yc  = 150 - hc;
    const bw  = barW - pad * 2;
    const bw2 = Math.floor(bw / 2) - 1;

    // Faturamento bar
    if (h > 0) svg += `<rect x="${x+pad}" y="${y}" width="${bw2}" height="${h}" rx="3" fill="${cor}" opacity=".85"/>`;
    // Custo bar
    if (hc > 0) svg += `<rect x="${x+pad+bw2+2}" y="${yc}" width="${bw2}" height="${hc}" rx="3" fill="#ef4444" opacity=".7"/>`;
    // Label
    svg += `<text x="${x + barW/2}" y="165" text-anchor="middle" font-size="9" fill="#aaa">${d.label}</text>`;
    // Valor
    if (h > 16) svg += `<text x="${x+pad+bw2/2}" y="${y-3}" text-anchor="middle" font-size="8" fill="${cor}" font-weight="bold">${d.fat >= 1000 ? (d.fat/1000).toFixed(1)+"k" : d.fat.toFixed(0)}</text>`;
  });

  // Legenda
  svg += `<rect x="40" y="${H-14}" width="8" height="8" rx="2" fill="${cor}"/>`;
  svg += `<text x="52" y="${H-7}" font-size="9" fill="#aaa">Faturamento</text>`;
  svg += `<rect x="120" y="${H-14}" width="8" height="8" rx="2" fill="#ef4444"/>`;
  svg += `<text x="132" y="${H-7}" font-size="9" fill="#aaa">Custos</text>`;

  svg += `</svg>`;
  canvas.innerHTML = svg;
}
window.renderGraficoMensal = renderGraficoMensal;
