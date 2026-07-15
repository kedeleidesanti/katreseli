/**
 * nota-checklist.js — Notas internas por locação + Checklist de devolução
 */
import { db, doc, updateDoc } from "./firebase.js";
import { locacoes, clientes, itens } from "./state.js";
import { fmtR, fmtD, notif }         from "./helpers.js";

// ─── Estado do checklist ─────────────────────────────────────────────────────
let _chkStatus = {}; // { itemIdx: "ok" | "avaria" | "" }

// ─── NOTAS INTERNAS ───────────────────────────────────────────────────────────
window.abrirNota = function(locId) {
  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  document.getElementById("nota-loc-id").value = locId;
  document.getElementById("nota-texto").value  = loc.notaInterna || "";
  document.getElementById("modal-nota")?.classList.add("on");
};

window.salvarNota = async function() {
  const id   = document.getElementById("nota-loc-id")?.value; if (!id) return;
  const nota = document.getElementById("nota-texto")?.value || "";
  try {
    await updateDoc(doc(db, "locacoes", id), { notaInterna: nota });
    document.getElementById("modal-nota")?.classList.remove("on");
    notif("Nota salva!");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── CHECKLIST DE DEVOLUÇÃO ───────────────────────────────────────────────────
window.abrirChecklist = function(locId) {
  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  _chkStatus = {};

  // Resumo
  const res = document.getElementById("checklist-resumo"); if (res) {
    res.innerHTML = `<strong>${c.nome || "—"}</strong> &bull; ${loc.evento || "—"} &bull; ${fmtD(loc.retirada)} → ${fmtD(loc.devolucao)}
      ${(loc.saldo||0) > 0 ? `<div style="margin-top:6px;padding:6px 10px;background:#fef3c7;border-radius:8px;color:#92400e;font-size:12px;font-weight:600">⚠ Saldo pendente: ${fmtR(loc.saldo)} — cobrar antes de devolver!</div>` : ""}`;
  }

  // Progresso
  const itensFiltrados = (loc.itens || []).filter(x => x.tipo !== "kit");
  const total = itensFiltrados.reduce((a, i) => a + (i.qtd || 1), 0);
  const progDiv = document.getElementById("checklist-progresso");
  if (progDiv) {
    progDiv.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:12px;color:var(--txt3)">Itens conferidos</span>
        <span id="chk-contador" style="font-size:12px;font-weight:700;color:var(--txt)">0 / ${total}</span>
      </div>
      <div style="height:6px;background:var(--bdr);border-radius:3px;overflow:hidden">
        <div id="chk-barra" style="height:100%;background:var(--p);border-radius:3px;width:0%;transition:width .3s"></div>
      </div>`;
  }

  // Itens com qtd individual
  const div = document.getElementById("checklist-itens"); if (!div) return;
  div.innerHTML = itensFiltrados.map((it, i) => {
    const rows = Array.from({length: it.qtd || 1}, (_, q) => `
      <div class="chk-item" id="chk-row-${i}-${q}">
        <div class="chk-nome">${it.nome} <span style="color:var(--txt3);font-size:11px">#${q+1}</span></div>
        <div class="chk-btns">
          <button class="chk-btn ok" onclick="setChk(${i},${q},'ok')">✓ OK</button>
          <button class="chk-btn av" onclick="setChk(${i},${q},'avaria')">⚠ Avaria</button>
        </div>
      </div>`).join("");
    return rows;
  }).join("");

  document.getElementById("checklist-obs").value  = "";
  document.getElementById("checklist-loc-id").value = locId;
  document.getElementById("modal-checklist")?.classList.add("on");
  _atualizarProgressoChk(total);
};

function _atualizarProgressoChk(total) {
  const conferidos = Object.values(_chkStatus).filter(v => v).length;
  const pct = total > 0 ? Math.round((conferidos / total) * 100) : 0;
  const contador = document.getElementById("chk-contador");
  const barra    = document.getElementById("chk-barra");
  if (contador) contador.textContent = `${conferidos} / ${total}`;
  if (barra) {
    barra.style.width = pct + "%";
    barra.style.background = pct === 100 ? "#16a34a" : "var(--p)";
  }
}

window.setChk = function(i, q, status) {
  const key = `${i}-${q}`;
  _chkStatus[key] = status;
  const row = document.getElementById(`chk-row-${i}-${q}`); if (!row) return;
  row.className = "chk-item " + status;
  row.querySelectorAll(".chk-btn").forEach(b => b.classList.remove("sel"));
  row.querySelector(`.chk-btn.${status === "ok" ? "ok" : "av"}`)?.classList.add("sel");
  // Atualizar progresso
  const id = document.getElementById("checklist-loc-id")?.value;
  const loc = locacoes.find(x => x.id === id);
  const total = (loc?.itens||[]).filter(x=>x.tipo!=="kit").reduce((a,i)=>a+(i.qtd||1),0);
  _atualizarProgressoChk(total);
};

window.confirmarDevolucao = async function() {
  const id  = document.getElementById("checklist-loc-id")?.value; if (!id) return;
  const loc = locacoes.find(x => x.id === id); if (!loc) return;
  const obs = document.getElementById("checklist-obs")?.value || "";

  // ── Barreira: bloquear se saldo pendente (sem a opção de forçar) ──────────
  const saldo = loc.saldo || 0;
  if (saldo > 0) {
    const fmtSaldo = "R$ " + saldo.toFixed(2).replace(".", ",");
    notif(`⛔ Saldo pendente de ${fmtSaldo}. Confirme o pagamento antes de devolver.`, true);
    return;
  }

  // Verificar itens com avaria — chave formato "itemIdx-qtdIdx"
  const itensFiltrados = (loc.itens || []).filter(x => x.tipo !== "kit");
  const avarias = Object.entries(_chkStatus)
    .filter(([,v]) => v === "avaria")
    .map(([key]) => {
      const itemIdx = parseInt(key.split("-")[0]);
      return itensFiltrados[itemIdx]?.nome;
    })
    .filter((v, i, arr) => v && arr.indexOf(v) === i); // únicos

  const nota = [
    obs,
    avarias.length ? `⚠ Avarias: ${avarias.join(", ")}` : ""
  ].filter(Boolean).join(" | ");

  try {
    await updateDoc(doc(db, "locacoes", id), {
      status: "devolvido",
      obsDevol: nota || "Itens conferidos.",
      dataDevol: new Date().toISOString().split("T")[0]
    });
    document.getElementById("modal-checklist")?.classList.remove("on");
    if (avarias.length) {
      notif(`Devolvido! ⚠ ${avarias.length} item(ns) com avaria registrado(s).`);
    } else {
      notif("Devolução confirmada! Todos os itens OK ✓");
    }
  } catch(e) { notif("Erro: " + e.message, true); }
};
