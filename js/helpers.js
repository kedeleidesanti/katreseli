// Funções utilitárias reutilizáveis em toda a aplicação

/** Retorna elemento pelo ID */
export function el(id) {
  return document.getElementById(id);
}

/** Retorna o valor trimado de um input pelo ID */
export function gv(id) {
  const e = el(id);
  return e ? e.value.trim() : "";
}

/** Define o valor de um input pelo ID */
export function sv(id, v) {
  const e = el(id);
  if (e) e.value = (v == null ? "" : v);
}

/** Formata número como moeda BRL */
export function fmtR(v) {
  return "R$ " + (parseFloat(v) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Formata data de YYYY-MM-DD para DD/MM/YYYY */
export function fmtD(ds) {
  if (!ds) return "-";
  const [y, m, d] = ds.split("-");
  return `${d}/${m}/${y}`;
}

/** Exibe notificação toast */
export function notif(msg, err = false) {
  const n = el("notif");
  if (!n) return;
  n.textContent = msg;
  n.style.borderLeftColor = err ? "#ef4444" : "#d4307a";
  n.style.display = "block";
  clearTimeout(n._t);
  n._t = setTimeout(() => (n.style.display = "none"), 3200);
}

/** Cria e dispara download de um arquivo texto */
export function dl(nome, conteudo) {
  const mime = nome.endsWith(".csv") ? "text/csv" : nome.endsWith(".json") ? "application/json" : "text/plain";
  const blob = new Blob([conteudo], { type: mime + ";charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Expor globalmente para uso em onclick inline do HTML
window.el    = el;
window.gv    = gv;
window.sv    = sv;
window.fmtR  = fmtR;
window.fmtD  = fmtD;
window.notif = notif;
window.dl    = dl;

// ─── Máscaras de input ────────────────────────────────────────────────────────

/** Telefone: (99) 99999-9999 ou (99) 9999-9999 */
export function maskTel(inp) {
  let v = inp.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 10) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  inp.value = v;
}

/** CPF: 999.999.999-99 | CNPJ: 99.999.999/9999-99 (auto-detecta) */
export function maskCpfCnpj(inp) {
  let v = inp.value.replace(/\D/g, "").slice(0, 14);
  if (v.length <= 11) {
    if (v.length > 9) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
    else if (v.length > 6) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
    else if (v.length > 3) v = `${v.slice(0,3)}.${v.slice(3)}`;
  } else {
    if (v.length > 12) v = `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8,12)}-${v.slice(12)}`;
    else if (v.length > 8) v = `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8)}`;
    else if (v.length > 5) v = `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5)}`;
    else if (v.length > 2) v = `${v.slice(0,2)}.${v.slice(2)}`;
  }
  inp.value = v;
}

/** CEP: 99999-999 */
export function maskCep(inp) {
  let v = inp.value.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = `${v.slice(0,5)}-${v.slice(5)}`;
  inp.value = v;
}

/** Valor R$: aceita decimais livres */
export function maskMoeda(inp) {
  let v = inp.value.replace(/[^\d,]/g, "");
  inp.value = v;
}

window.maskTel      = maskTel;
window.maskCpfCnpj  = maskCpfCnpj;
window.maskCep      = maskCep;
window.maskMoeda    = maskMoeda;

// ─── Feedback visual de ação imediato (Optimistic UI) ─────────────────────────
export function notifSaving(msg = "Salvando...") {
  const id = "saving-toast-" + Date.now();
  const el = document.createElement("div");
  el.id = id;
  el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(20,10,30,.85);color:#fff;padding:8px 18px;border-radius:20px;font-size:12px;font-weight:600;z-index:9997;display:flex;align-items:center;gap:7px;backdrop-filter:blur(8px);pointer-events:none";
  el.innerHTML = `<div class="spin" style="width:14px;height:14px;border-width:2px;margin:0"></div>${msg}`;
  document.body.appendChild(el);
  return () => el.remove();
}
window.notifSaving = notifSaving;

/**
 * esc(str) — Escapa caracteres HTML para evitar XSS em innerHTML.
 * Use sempre que inserir texto do usuário via template literal.
 */
export function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
window.esc = esc;
