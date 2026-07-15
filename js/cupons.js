/**
 * cupons.js — Sistema de cupons de desconto para o catálogo online
 */
import { db, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp }
  from "./firebase.js";
import { notif, fmtR } from "./helpers.js";

let _cupons = [];
let _unsubCupons = null;

// ─── Iniciar listener ─────────────────────────────────────────────────────────
export function iniciarCupons() {
  if (_unsubCupons) return;
  _unsubCupons = onSnapshot(collection(db, "cupons"), snap => {
    _cupons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCupons();
  });
}

// ─── Renderizar lista de cupons ───────────────────────────────────────────────
function renderCupons() {
  const div = document.getElementById("cupons-lista"); if (!div) return;
  if (!_cupons.length) {
    div.innerHTML = '<div style="text-align:center;padding:20px;color:var(--txt3);font-size:13px">Nenhum cupom criado ainda.</div>';
    return;
  }
  div.innerHTML = _cupons.map(c => {
    const ativo = c.ativo !== false;
    const usos  = c.usos || 0;
    const max   = c.usosMax || "∞";
    const desc  = c.tipo === "pct" ? `${c.valor}%` : fmtR(c.valor);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--bdr2);background:var(--sur);flex-wrap:wrap">
      <span style="font-size:13px;font-weight:700;color:var(--txt);font-family:monospace;background:var(--pl);padding:2px 10px;border-radius:6px;color:var(--pd)">${c.codigo}</span>
      <span style="font-size:12px;font-weight:600;color:${c.tipo==="pct"?"#15803d":"#1d4ed8"};background:${c.tipo==="pct"?"#f0fdf4":"#eff6ff"};padding:2px 8px;border-radius:20px">${desc} de desconto</span>
      <span style="font-size:11px;color:var(--txt3)">${usos}/${max} usos</span>
      <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
          <input type="checkbox" ${ativo?"checked":""} onchange="window.toggleCupom('${c.id}',this.checked)" style="accent-color:var(--p)">
          ${ativo?"Ativo":"Inativo"}
        </label>
        <button onclick="window.deletarCupom('${c.id}')" class="btn btn-d btn-xs" title="Excluir"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join("");
}

// ─── Criar cupom ──────────────────────────────────────────────────────────────
window.salvarCupom = async function() {
  const codigo = (document.getElementById("cupom-novo-codigo")?.value || "").trim().toUpperCase();
  const valor  = parseFloat(document.getElementById("cupom-novo-valor")?.value) || 0;
  const tipo   = document.getElementById("cupom-novo-tipo")?.value || "pct";
  const usosM  = parseInt(document.getElementById("cupom-novo-uso")?.value) || 0;

  if (!codigo) { notif("Informe o código!", true); return; }
  if (!valor)  { notif("Informe o valor do desconto!", true); return; }
  if (_cupons.find(c => c.codigo === codigo)) { notif("Código já existe!", true); return; }

  await addDoc(collection(db, "cupons"), {
    codigo, valor, tipo, ativo: true,
    usos: 0,
    usosMax: usosM || null,
    criadoEm: serverTimestamp()
  });
  document.getElementById("cupom-novo-codigo").value = "";
  document.getElementById("cupom-novo-valor").value  = "";
  notif("Cupom criado!");
};

// ─── Toggle ativo ─────────────────────────────────────────────────────────────
window.toggleCupom = async function(id, ativo) {
  await updateDoc(doc(db, "cupons", id), { ativo }).catch(() => {});
};

// ─── Deletar ─────────────────────────────────────────────────────────────────
window.deletarCupom = async function(id) {
  if (!await window.confirmar({ titulo:"Excluir cupom", msg:"Tem certeza?", tipo:"danger", labelOk:"Excluir" })) return;
  await deleteDoc(doc(db, "cupons", id));
  notif("Cupom removido");
};

// ─── Validar cupom (usado pelo solicitar.html) ─────────────────────────────
window.validarCupomPublico = async function(codigo) {
  const { getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const snap = await getDocs(query(collection(db, "cupons"), where("codigo","==",codigo.toUpperCase())));
  if (snap.empty) return null;
  const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
  if (!data.ativo) return null;
  if (data.usosMax && data.usos >= data.usosMax) return null;
  return data;
};

// ─── Registrar uso do cupom ───────────────────────────────────────────────────
window.registrarUsoCupom = async function(cupomId) {
  const ref = doc(db, "cupons", cupomId);
  const snap = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
    .then(m => m.getDoc(ref));
  const usos = (snap.data()?.usos || 0) + 1;
  await updateDoc(ref, { usos });
};

window.renderCupons = renderCupons;
