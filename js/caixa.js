/**
 * caixa.js — Controle de caixa diário: entradas e saídas por forma de pagamento
 */
import { db, collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp }
  from "./firebase.js";
import { el, fmtR, fmtD, notif, gv, sv } from "./helpers.js";
import { locacoes, clientes }              from "./state.js";

let _lancamentos = [];
let _unsubCaixa  = null;

// ─── Abrir modal de caixa ─────────────────────────────────────────────────────
window.abrirCaixa = function() {
  const hoje = new Date().toISOString().split("T")[0];
  // Escutar lançamentos de hoje
  if (_unsubCaixa) _unsubCaixa();
  _unsubCaixa = onSnapshot(collection(db, "caixa"), snap => {
    _lancamentos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x => (x.data || "").startsWith(hoje))
      .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
    renderCaixaModal();
  });
  document.getElementById("modal-caixa")?.classList.add("on");
};

// ─── Render resumo e lista no modal ──────────────────────────────────────────
function renderCaixaModal() {
  const hoje = new Date().toISOString().split("T")[0];
  const todayStr = new Date().toLocaleDateString("pt-BR");

  // Calcular totais por forma
  const totForma = {};
  let totalEntr = 0, totalSaid = 0;
  _lancamentos.forEach(l => {
    const v = l.valor || 0;
    if (l.tipo === "entrada") { totalEntr += v; totForma[l.forma] = (totForma[l.forma] || 0) + v; }
    else { totalSaid += v; }
  });
  const saldo = totalEntr - totalSaid;

  // Também incluir recebimentos de locações de hoje (automático)
  const recLocHoje = locacoes
    .filter(l => l.status === "ativo" || l.status === "devolvido")
    .filter(l => l.retirada === hoje || l.devolucao === hoje)
    .reduce((a, b) => a + (b.entrada || 0), 0);

  const resumo = el("caixa-resumo"); if (resumo) {
    resumo.innerHTML = `
      <div style="font-size:12px;color:var(--txt3);margin-bottom:8px">📅 ${todayStr}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:#f0fdf4;border-radius:9px;padding:10px;text-align:center">
          <div style="font-size:10px;color:#15803d;text-transform:uppercase;letter-spacing:.5px">Entradas</div>
          <div style="font-size:16px;font-weight:700;color:#15803d">${fmtR(totalEntr)}</div>
        </div>
        <div style="background:#fff1f2;border-radius:9px;padding:10px;text-align:center">
          <div style="font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.5px">Saídas</div>
          <div style="font-size:16px;font-weight:700;color:#b91c1c">${fmtR(totalSaid)}</div>
        </div>
        <div style="background:${saldo >= 0 ? "var(--pl)" : "#fff1f2"};border-radius:9px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--pd);text-transform:uppercase;letter-spacing:.5px">Saldo</div>
          <div style="font-size:16px;font-weight:700;color:${saldo >= 0 ? "var(--pd)" : "#b91c1c"}">${fmtR(saldo)}</div>
        </div>
      </div>
      ${Object.entries(totForma).length ? `
      <div style="font-size:11px;color:var(--txt2);display:flex;flex-wrap:wrap;gap:6px">
        ${Object.entries(totForma).map(([f,v]) => `<span style="background:var(--bg);border:1px solid var(--bdr2);border-radius:6px;padding:2px 8px">${f}: <strong>${fmtR(v)}</strong></span>`).join("")}
      </div>` : ""}`;
  }

  const lista = el("caixa-lista"); if (!lista) return;
  if (!_lancamentos.length) {
    lista.innerHTML = `<div style="text-align:center;color:var(--txt3);padding:16px;font-size:13px">Nenhum lançamento hoje</div>`;
    return;
  }
  lista.innerHTML = _lancamentos.map(l => `
    <div class="caixa-item">
      <span style="font-size:18px">${l.tipo === "entrada" ? "↑" : "↓"}</span>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500">${l.descricao || l.forma}</div>
        <div style="font-size:10px;color:var(--txt3)">${l.forma}${l.hora ? " · " + l.hora : ""}</div>
      </div>
      <span class="${l.tipo === "entrada" ? "caixa-entrada" : "caixa-saida"}">${l.tipo === "entrada" ? "+" : "−"}${fmtR(l.valor)}</span>
      <button onclick="delLancamento('${l.id}')" style="background:none;border:none;color:var(--txt3);cursor:pointer;font-size:16px;padding:2px 6px" title="Remover">×</button>
    </div>`).join("");
}

// ─── Lançar entrada/saída ─────────────────────────────────────────────────────
window.lancarCaixa = async function() {
  const tipo  = (document.getElementById("caixa-tipo")  || {}).value || "entrada";
  const valor = parseFloat((document.getElementById("caixa-valor") || {}).value) || 0;
  const forma = (document.getElementById("caixa-forma") || {}).value || "Dinheiro";
  const desc  = (document.getElementById("caixa-desc")  || {}).value || "";
  if (valor <= 0) { notif("Informe o valor!", true); return; }
  const agora = new Date();
  try {
    await addDoc(collection(db, "caixa"), {
      tipo, valor, forma, descricao: desc,
      data: agora.toISOString().split("T")[0],
      hora: agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      criadoEm: serverTimestamp()
    });
    sv("caixa-valor", ""); sv("caixa-desc", "");
    notif("Lançado!");
  } catch(e) { notif("Erro: " + e.message, true); }
};

window.delLancamento = async function(id) {
  if (!await window.confirmar({ titulo:"Remover lançamento", msg:"Deseja remover este lançamento do caixa?", tipo:"danger", labelOk:"Remover" })) return;
  try { await deleteDoc(doc(db, "caixa", id)); } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Exportar caixa do dia ────────────────────────────────────────────────────
window.exportarCaixa = function() {
  const hoje   = new Date().toLocaleDateString("pt-BR");
  const linhas = _lancamentos.map(l => `${l.hora||""},"${l.tipo}","${l.forma}","${l.descricao||""}","${fmtR(l.valor)}"`);
  const csv    = ["Hora,Tipo,Forma,Descrição,Valor", ...linhas].join("\n");
  const a = document.createElement("a");
  a.href     = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `caixa_${hoje.replace(/\//g,"-")}.csv`;
  a.click();
  notif("Caixa exportado!");
};

// ─── Inicializar listeners ────────────────────────────────────────────────────
export function initCaixa() {} // vazio — caixa é lazy (só carrega ao abrir)
