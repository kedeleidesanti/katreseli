/**
 * manutencao.js — Controle de manutenção de itens
 */
import { db, collection, addDoc, updateDoc, doc, serverTimestamp }
  from "./firebase.js";
import { el, fmtR, fmtD, notif, gv, sv } from "./helpers.js";
import { itens }                           from "./state.js";

export let manutencoes = [];
export function setManutencoes(v) { manutencoes.length = 0; manutencoes.push(...v); }

// ─── Abrir modal de manutenção ────────────────────────────────────────────────
window.abrirManutencao = function(itemId) {
  const item = itens.find(x => x.id === itemId); if (!item) return;
  sv("manut-item-id", itemId);
  sv("manut-item-nome", item.nome);
  sv("manut-desc", "");
  sv("manut-custo", "");
  sv("manut-data-entrada", new Date().toISOString().split("T")[0]);
  sv("manut-data-saida", "");
  document.getElementById("modal-manutencao")?.classList.add("on");
};

// ─── Registrar entrada em manutenção ─────────────────────────────────────────
window.salvarManutencao = async function() {
  const itemId = gv("manut-item-id");
  const desc   = gv("manut-desc");
  const custo  = parseFloat(gv("manut-custo")) || 0;
  const dtEnt  = gv("manut-data-entrada");
  if (!itemId || !desc) { notif("Preencha a descrição!", true); return; }

  try {
    // Registrar manutenção
    await addDoc(collection(db, "manutencoes"), {
      itemId, descricao: desc, custo, dataEntrada: dtEnt,
      dataSaida: "", status: "em_manutencao", criadoEm: serverTimestamp()
    });
    // Atualizar estado do item
    await updateDoc(doc(db, "itens", itemId), { estado: "Manutenção", atualizadoEm: serverTimestamp() });
    document.getElementById("modal-manutencao")?.classList.remove("on");
    notif("Item registrado em manutenção!");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Registrar retorno da manutenção ─────────────────────────────────────────
window.concluirManutencao = async function(manutId, itemId) {
  const dtSaida = prompt("Data de retorno (AAAA-MM-DD):", new Date().toISOString().split("T")[0]);
  if (!dtSaida) return;
  try {
    await updateDoc(doc(db, "manutencoes", manutId), { dataSaida: dtSaida, status: "concluida" });
    await updateDoc(doc(db, "itens", itemId), { estado: "Bom", atualizadoEm: serverTimestamp() });
    notif("Item retornou da manutenção!");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Renderizar histórico de manutenções ──────────────────────────────────────
export function renderManutencoes() {
  const div = el("manut-lista"); if (!div) return;

  if (!manutencoes.length) {
    div.innerHTML = `<div style="padding:20px;text-align:center;color:var(--txt3);font-size:13px">
      Nenhuma manutenção registrada
    </div>`;
    return;
  }

  const sorted = [...manutencoes].sort((a,b) => (b.criadoEm?.seconds||0) - (a.criadoEm?.seconds||0));

  div.innerHTML = sorted.map(m => {
    const item   = itens.find(x => x.id === m.itemId);
    const ativa  = !m.dataSaida || m.status === "em_manutencao";
    const cor    = ativa ? "#b45309" : "#059669";
    const badge  = ativa ? "🔧 Em manutenção" : "✓ Concluída";
    return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--bdr)">
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${item?.nome || "Item removido"}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:2px">${m.descricao}</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:2px">
          Entrada: ${fmtD(m.dataEntrada)}
          ${m.dataSaida ? ` &bull; Saída: ${fmtD(m.dataSaida)}` : ""}
          ${m.custo > 0 ? ` &bull; Custo: ${fmtR(m.custo)}` : ""}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span style="font-size:11px;font-weight:700;color:${cor};background:${cor}15;padding:2px 8px;border-radius:8px">${badge}</span>
        ${ativa ? `<button class="btn btn-s btn-xs" onclick="concluirManutencao('${m.id}','${m.itemId}')">Concluir</button>` : ""}
      </div>
    </div>`;
  }).join("");
}
window.renderManutencoes = renderManutencoes;
