/**
 * ux.js — Melhorias de experiência de uso
 *
 * 1. confirmar()   — Modal de confirmação elegante (substitui confirm() nativo)
 * 2. Atalhos de teclado — N, C, I, F, D, L, ?, Esc
 * 3. Paginação     — renderPaginacao() para todas as tabelas principais
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MODAL DE CONFIRMAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * confirmar({ titulo, msg, subtitulo, tipo, labelOk, labelCancel })
 * Retorna uma Promise<boolean> — true se confirmou, false se cancelou.
 *
 * tipo: "danger" (vermelho, padrão), "warning" (amarelo), "info" (azul), "success" (verde)
 */
export function confirmar({
  titulo      = "Confirmar ação",
  msg         = "",
  subtitulo   = "",
  tipo        = "danger",
  labelOk     = "Confirmar",
  labelCancel = "Cancelar",
} = {}) {
  return new Promise(resolve => {
    const modal    = document.getElementById("modal-confirm");
    const tituloEl = document.getElementById("confirm-titulo");
    const msgEl    = document.getElementById("confirm-msg");
    const subEl    = document.getElementById("confirm-subtitulo");
    const iconWrap = document.getElementById("confirm-icon-wrap");
    const iconEl   = document.getElementById("confirm-icon");
    const okBtn    = document.getElementById("confirm-ok-btn");
    const cancelBtn= document.getElementById("confirm-cancel-btn");
    if (!modal) { resolve(window.confirm(msg)); return; }

    // Aparência por tipo
    const tipos = {
      danger:  { bg: "var(--dk-red,#fee2e2)",    cor: "#991b1b", icon: "ti-trash",           btnBg: "#dc2626", btnBgHov: "#b91c1c" },
      warning: { bg: "var(--dk-yellow,#fef9c3)", cor: "#854f0b", icon: "ti-alert-triangle",   btnBg: "#d97706", btnBgHov: "#b45309" },
      info:    { bg: "var(--dk-blue,#eff6ff)",   cor: "#1d4ed8", icon: "ti-info-circle",      btnBg: "#2563eb", btnBgHov: "#1d4ed8" },
      success: { bg: "var(--dk-green,#f0fdf4)",  cor: "#15803d", icon: "ti-circle-check",     btnBg: "#16a34a", btnBgHov: "#15803d" },
    };
    const t = tipos[tipo] || tipos.danger;

    if (tituloEl) tituloEl.textContent = titulo;
    if (msgEl)    msgEl.textContent    = msg;
    if (subEl)    subEl.textContent    = subtitulo;
    if (iconWrap) { iconWrap.style.background = t.bg; iconWrap.style.color = t.cor; }
    if (iconEl)   iconEl.className = `ti ${t.icon}`;
    if (okBtn) {
      okBtn.textContent = labelOk;
      okBtn.style.cssText = `background:${t.btnBg};color:#fff;border:none;padding:9px 20px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background .15s`;
      okBtn.onmouseover = () => { okBtn.style.background = t.btnBgHov; };
      okBtn.onmouseout  = () => { okBtn.style.background = t.btnBg; };
    }
    if (cancelBtn) cancelBtn.textContent = labelCancel;

    // Callbacks
    window._confirmAceitar = () => { _fecharConfirm(); resolve(true);  };
    window._confirmRejeitar = () => { _fecharConfirm(); resolve(false); };

    // Abrir
    modal.classList.add("on");
    okBtn?.focus();
  });
}

function _fecharConfirm() {
  const modal = document.getElementById("modal-confirm");
  if (modal) modal.classList.remove("on");
  window._confirmAceitar  = null;
  window._confirmRejeitar = null;
}

// Fechar no Escape — adiciona ao MODAIS_PROTEGIDOS não, mas escuta aqui
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    const modal = document.getElementById("modal-confirm");
    if (modal?.classList.contains("on")) { e.stopImmediatePropagation(); _fecharConfirm(); window._confirmRejeitar?.(); }
  }
  if (e.key === "Enter") {
    const modal = document.getElementById("modal-confirm");
    if (modal?.classList.contains("on")) { e.preventDefault(); window._confirmAceitar?.(); }
  }
});

window.confirmar = confirmar;


// ═══════════════════════════════════════════════════════════════════════════════
// 2. ATALHOS DE TECLADO
// ═══════════════════════════════════════════════════════════════════════════════

let _atalhosToastTimer = null;

window.fecharAtalhosToast = function() {
  const t = document.getElementById("atalhos-toast");
  if (t) t.style.display = "none";
  clearTimeout(_atalhosToastTimer);
};

function _mostrarAtalhosToast() {
  const t = document.getElementById("atalhos-toast");
  if (!t) return;
  t.style.display = "block";
  clearTimeout(_atalhosToastTimer);
  _atalhosToastTimer = setTimeout(() => { t.style.display = "none"; }, 6000);
}

document.addEventListener("keydown", e => {
  // Não disparar quando está digitando em input/textarea/select ou modal aberto
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (document.querySelector(".ov.on")) return;

  // Não disparar com Ctrl/Meta (exceto Ctrl+K já existente)
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key.toLowerCase()) {
    case "n":
      e.preventDefault();
      window.navTo?.("locacoes");
      setTimeout(() => window.openModal?.("modal-loc"), 100);
      break;

    case "c":
      e.preventDefault();
      window.navTo?.("clientes");
      setTimeout(() => window.openModal?.("modal-cli"), 100);
      break;

    case "i":
      e.preventDefault();
      window.navTo?.("itens");
      setTimeout(() => window.openModal?.("modal-item"), 100);
      break;

    case "f":
      e.preventDefault();
      window.abrirBuscaGlobal?.();
      break;

    case "d":
      e.preventDefault();
      window.navTo?.("dashboard");
      break;

    case "l":
      e.preventDefault();
      window.navTo?.("locacoes");
      break;

    case "a":
      e.preventDefault();
      window.navTo?.("agenda");
      break;

    case "?":
      e.preventDefault();
      _mostrarAtalhosToast();
      break;
  }
});

// Hint discreto na primeira vez que o usuário abre o app
if (!localStorage.getItem("ux_atalhos_visto")) {
  setTimeout(() => {
    _mostrarAtalhosToast();
    localStorage.setItem("ux_atalhos_visto", "1");
  }, 3000);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. PAGINAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

// Estado de paginação por tabela
const _pag = {
  loc: { pagina: 1, perPage: 10 },
  it:  { pagina: 1, perPage: 30 },
  dec: { pagina: 1, perPage: 10 },
  cli: { pagina: 1, perPage: 25 },
};

/**
 * Aplica paginação a um array de linhas já filtradas.
 * Renderiza os controles no container #pag-{id}.
 * Retorna o slice da página atual.
 *
 * @param {string} id    — "loc" | "it" | "dec" | "cli"
 * @param {Array}  rows  — Array completo já filtrado e ordenado
 * @param {function} renderFn — Função que recebe o slice e atualiza o tbody
 */
export function paginar(id, rows, renderFn) {
  const state = _pag[id];
  if (!state) { renderFn(rows); return; }

  const total   = rows.length;
  const pages   = Math.max(1, Math.ceil(total / state.perPage));
  state.pagina  = Math.min(state.pagina, pages);

  const inicio  = (state.pagina - 1) * state.perPage;
  const fim     = Math.min(inicio + state.perPage, total);
  const slice   = rows.slice(inicio, fim);

  renderFn(slice);
  _renderControlesPaginacao(id, state, total, pages, inicio, fim);
}

function _renderControlesPaginacao(id, state, total, pages, inicio, fim) {
  const wrap = document.getElementById(`pag-${id}`);
  if (!wrap) return;

  if (total <= state.perPage && state.pagina === 1 && total <= 10) { wrap.innerHTML = ""; return; }

  // Quais números mostrar
  const pArr = [];
  if (pages <= 5) {
    for (let i = 1; i <= pages; i++) pArr.push(i);
  } else {
    pArr.push(1);
    if (state.pagina > 3) pArr.push("…");
    for (let i = Math.max(2, state.pagina - 1); i <= Math.min(pages - 1, state.pagina + 1); i++) pArr.push(i);
    if (state.pagina < pages - 2) pArr.push("…");
    pArr.push(pages);
  }

  const perOpts = [10, 20, 30, 50, 100]
    .map(v => `<option value="${v}"${state.perPage === v ? " selected" : ""}>${v}</option>`)
    .join("");

  // ── Estilos ───────────────────────────────────────────────────────────────
  const f = "font-family:'DM Sans',sans-serif;box-sizing:border-box;";

  const mkChevBtn = (icon, onclick, disabled, titulo) => disabled
    ? `<button disabled title="${titulo}" style="${f}display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--bdr);background:var(--sur);color:var(--txt3);opacity:.35;cursor:default"><i class="ti ${icon}" style="font-size:15px"></i></button>`
    : `<button onclick="${onclick}" title="${titulo}" style="${f}display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--bdr2);background:var(--sur);color:var(--txt2);cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--p)';this.style.color='var(--p)';this.style.background='var(--pl)'" onmouseout="this.style.borderColor='var(--bdr2)';this.style.color='var(--txt2)';this.style.background='var(--sur)'"><i class="ti ${icon}" style="font-size:15px;pointer-events:none"></i></button>`;

  const mkNumBtn = (p) => p === state.pagina
    ? `<button style="${f}display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 8px;border-radius:9px;border:none;background:var(--p);color:#fff;font-size:13px;font-weight:700;cursor:default;box-shadow:0 2px 6px rgba(0,0,0,.12)">${p}</button>`
    : `<button onclick="window._pagIr('${id}',${p})" style="${f}display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 8px;border-radius:9px;border:none;background:none;color:var(--txt2);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s" onmouseover="this.style.background='var(--pl)';this.style.color='var(--p)'" onmouseout="this.style.background='none';this.style.color='var(--txt2)'">${p}</button>`;

  const nums = pArr.map(p =>
    p === "…"
      ? `<span style="${f}color:var(--txt3);font-size:13px;min-width:20px;text-align:center;line-height:32px;user-select:none">···</span>`
      : mkNumBtn(p)
  ).join("");

  // Layout: contagem à esquerda · navegação ao centro · itens/página à direita
  wrap.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;box-sizing:border-box;flex-wrap:wrap;padding:4px 2px;";

  wrap.innerHTML =
    `<span style="${f}font-size:12.5px;color:var(--txt3);white-space:nowrap">` +
      `<b style="color:var(--txt);font-weight:600">${inicio+1}–${fim}</b> de <b style="color:var(--txt);font-weight:600">${total}</b>` +
    `</span>` +
    `<div style="${f}display:flex;align-items:center;gap:4px">` +
      mkChevBtn("ti-chevron-left",  `window._pagIr('${id}',${state.pagina-1})`, state.pagina <= 1,     "Página anterior") +
      `<div style="display:flex;align-items:center;gap:2px;margin:0 4px">${nums}</div>` +
      mkChevBtn("ti-chevron-right", `window._pagIr('${id}',${state.pagina+1})`, state.pagina >= pages, "Próxima página") +
    `</div>` +
    `<label style="${f}display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--txt3);white-space:nowrap;cursor:pointer">` +
      `<select style="${f}height:32px;padding:0 8px;border-radius:9px;border:1px solid var(--bdr2);background:var(--sur);color:var(--txt);font-size:13px;font-weight:600;cursor:pointer;outline:none" onchange="window._pagPerPage('${id}',+this.value)">${perOpts}</select>` +
      `por página` +
    `</label>`;
}

window._pagIr = function(id, pagina) {
  if (!_pag[id]) return;
  _pag[id].pagina = pagina;
  // Disparar re-render da tabela correspondente
  const renders = {
    loc: () => window.renderLoc?.(),
    it:  () => window.renderItens?.(),
    dec: () => window.renderDecs?.(),
    cli: () => window.renderClis?.(),
  };
  renders[id]?.();
  // Scroll suave para o topo da tabela
  const tbId = { loc: "tb-loc", it: "tb-item", dec: "tb-dec", cli: "tb-cli" }[id];
  document.getElementById(tbId)?.closest(".card, .tw")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

window._pagPerPage = function(id, val) {
  if (!_pag[id]) return;
  _pag[id].perPage = val;
  _pag[id].pagina  = 1;
  window._pagIr(id, 1);
};

// Resetar para página 1 quando o filtro/busca muda
export function resetPag(id) {
  if (_pag[id]) _pag[id].pagina = 1;
}

window.paginar   = paginar;
window.resetPag  = resetPag;
window._pag      = _pag;
