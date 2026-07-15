/**
 * navigation.js — Roteamento de páginas, modais, menu mobile, wizard.
 * Chama renders via window.* para evitar imports circulares.
 */
import { el } from "./helpers.js";

// ─── Títulos de página ────────────────────────────────────────────────────────
const pgTitles = {
  dashboard:     ["Dashboard",     "Visao geral"],
  calendario:    ["Calendario",    "Disponibilidade"],
  locacoes:      ["Locacoes",      "Todos os contratos"],
  itens:         ["Itens",         "Catalogo de pecas"],
  decoracoes:    ["Decoracoes",    "Kits prontos"],
  clientes:      ["Clientes",      "Base de clientes"],
  financeiro:    ["Financeiro",    "Controle financeiro"],
  pagamentos:    ["Pagamentos",    "Pagamento online — InfinitePay"],
  relatorios:    ["Relatorios",    "Analises"],
  configuracoes:  ["Configuracoes",  "Personalização"],
  solicitacoes:   ["Solicitações",   "Pedidos do catálogo online"],
};

const pgTopbar = {
  // locacoes: removido — botão fixo no topbar via btn-loc-rapida
  // itens: botão Cadastrar movido para dentro da toolbar da seção
  decoracoes: '<button class="btn btn-p" onclick="abrirDecModal()"><i class="ti ti-plus"></i> Criar kit</button> <button class="btn btn-s" onclick="gerarCatalogo()" title="Gerar catálogo dos kits"><i class="ti ti-world"></i> Catálogo</button>',
  clientes:   '<button class="btn btn-p" onclick="openModal(\'modal-cli\')"><i class="ti ti-plus"></i> Novo cliente</button>',
  financeiro:   '<button class="btn btn-s" onclick="abrirCaixa()"><i class="ti ti-cash"></i> Caixa do dia</button>',
  solicitacoes:  '<button class="btn btn-s btn-sm" onclick="window.open(\'index.html#catalogo\',\'_blank\')"><i class="ti ti-layout-grid"></i> Ver catálogo</button>',
};

// ─── Navegação principal ──────────────────────────────────────────────────────
export function navTo(pg) {
  closeMobMenu();
  document.querySelectorAll(".page").forEach(p => p.classList.remove("on"));
  document.querySelectorAll(".nb").forEach(b => b.classList.remove("on"));

  const pgEl  = el("page-" + pg); if (pgEl)  pgEl.classList.add("on");
  const btnEl = document.querySelector(`.nb[data-pg="${pg}"]`); if (btnEl) btnEl.classList.add("on");

  const [title, sub] = pgTitles[pg] || [pg, ""];
  if (el("pg-title")) el("pg-title").textContent = title;
  if (el("pg-sub"))   el("pg-sub").textContent   = sub;
  if (el("tb-r"))     el("tb-r").innerHTML        = pgTopbar[pg] || "";

  // Usar window.* para evitar imports circulares
  if (pg === "calendario")    window.renderCal?.();
  if (pg === "relatorios")    window.renderRel?.();
  if (pg === "financeiro")    window.renderFin?.();
  if (pg === "pagamentos")    { _initPagamentos(); window.mudarAbaPag?.("transacoes"); }
  if (pg === "configuracoes") { window.aplicarCfg?.(); window.carregarGatewayUI?.(); }
  if (pg === "dashboard")     window.renderDash?.();
  if (pg === "solicitacoes")  window.renderSolicitacoes?.();
}
window.navTo = navTo;

// ─── Modais ───────────────────────────────────────────────────────────────────
export function openModal(id) {
  // Push state para botão voltar nativo fechar o modal
  history.pushState(null, "", location.href);
  const ham = document.getElementById("mob-menu-btn");
  if (ham) ham.style.display = "none";
  if (id === "modal-item") window.limparItem?.();
  if (id === "modal-cli")  window.limparCli?.();
  if (id === "modal-dec") {
    // Chamar via window para evitar import circular
    window._decItens && (window._decItens.length = 0);
    window.renderDecLista?.();
    window.preencherSelDec?.();
  }
  const e = el(id); if (e) {
    e.classList.add("on");
    // Garantir z-index correto para modais dentro de outro modal
    if (id === "modal-rcli" || id === "modal-ritem" || id === "modal-tipo-evento") {
      e.style.zIndex = "8000";
      e.style.setProperty("z-index", "8000", "important");
    }
    // Scroll to top do conteúdo (após render)
    const mb = e.querySelector(".modal-b");
    if (mb) {
      mb.scrollTop = 0;
      requestAnimationFrame(() => { mb.scrollTop = 0; });
    }
    // Scroll do modal .modal também
    const m = e.querySelector(".modal");
    if (m) { m.scrollTop = 0; requestAnimationFrame(() => { m.scrollTop = 0; }); }
  }
}

export function closeModal(id) {
  // Show hamburger again if no other modal is open
  setTimeout(() => {
    const anyOpen = document.querySelector(".ov.on");
    if (!anyOpen) {
      const ham = document.getElementById("mob-menu-btn");
      if (ham) ham.style.display = "";
    }
  }, 50);
  const e = el(id); if (e) e.classList.remove("on");
}

window.openModal  = openModal;
window.closeModal = closeModal;

// ─── Eventos de modal (overlay + Escape) ─────────────────────────────────────
// IDs de modais que NÃO devem fechar ao clicar fora ou pressionar Escape
const MODAIS_PROTEGIDOS = ["modal-loc", "modal-item", "modal-dec"];

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".ov").forEach(ov => {
    ov.addEventListener("click", e => {
      if (e.target === ov && !MODAIS_PROTEGIDOS.includes(ov.id))
        ov.classList.remove("on");
    });
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape")
      document.querySelectorAll(".ov.on").forEach(o => {
        if (!MODAIS_PROTEGIDOS.includes(o.id)) o.classList.remove("on");
      });
  });
  document.querySelectorAll(".nb[data-pg]").forEach(btn => {
    btn.addEventListener("click", () => navTo(btn.dataset.pg));
  });
});

// ─── Menu mobile ──────────────────────────────────────────────────────────────
export function closeMobMenu() {
  const sidebar = el("sidebar");
  const overlay = el("mob-overlay");
  if (sidebar) sidebar.classList.remove("mob-open");
  if (overlay) overlay.classList.remove("on");
}

export function toggleMobMenu() {
  const sidebar = el("sidebar");
  const overlay = el("mob-overlay");
  if (!sidebar) return;
  const open = sidebar.classList.toggle("mob-open");
  if (overlay) overlay.classList.toggle("on", open);
}

window.toggleMobMenu = toggleMobMenu;
window.closeMobMenu  = closeMobMenu;

window.setActiveBottomNav = function (btn) {
  document.querySelectorAll(".bnav-btn").forEach(b => b.classList.remove("on"));
  if (btn) btn.classList.add("on");
};

// ─── Wizard (3 etapas) ────────────────────────────────────────────────────────
let _wizStep = 1;
export { _wizStep };

export function wizGo(step) {
  const show = (id, v) => { const e = el(id); if (e) e.style.display = v ? "" : "none"; };
  show("wiz-voltar", step > 1);
  show("wiz-prox",   step < 3);
  show("wiz-orc",    step === 3);
  show("wiz-conf",   step === 3);

  // Ajustar grid-column para botões ocuparem 2 colunas quando sozinhos
  const cancelar = document.querySelector("#wiz-footer .btn[onclick*='cancelarLoc']");
  if (cancelar) cancelar.style.gridColumn = step > 1 ? "" : "1 / -1";
  const prox = el("wiz-prox");
  if (prox) prox.style.gridColumn = step < 3 ? "1 / -1" : "";
  const conf = el("wiz-conf");
  if (conf) conf.style.gridColumn = "";
  _wizStep = step;
  [1, 2, 3].forEach(s => {
    const pg = el("wiz-" + s); if (pg) pg.style.display = s === step ? "block" : "none";
    const tb = el("wt" + s);   if (tb) tb.classList.toggle("on", s === step);
  });
  // Re-renderizar calendário ao voltar para step 1
  if (step === 1 && window.renderCalRange) window.renderCalRange();
  // Ao entrar no step 2, popular selects com as datas selecionadas
  if (step === 2) {
    const ret = window.gv?.("loc-ret") || "";
    const dev = window.gv?.("loc-dev") || "";
    window.popularSelectItens?.(ret, dev);
    window.popularSelectDecs?.(ret, dev);
  }
}
window.wizGo = wizGo;

window.wizNext = function () {
  if (_wizStep === 1) {
    if (!window.gv?.("loc-cli")) { window.notif?.("Selecione um cliente!", true); return; }
    if (!window.gv?.("loc-ret")) { window.notif?.("Informe a retirada!",  true); return; }
    if (!window.gv?.("loc-dev")) { window.notif?.("Informe a devolução!", true); return; }
    // Salvar estado da entrega antes de esconder o step 1
    const chk = document.getElementById("loc-entrega-chk");
    const valEl = document.getElementById("loc-entrega-val");
    const valHidEl = document.getElementById("loc-entrega-val-hidden");
    const valEnt = parseFloat(valEl?.value) || parseFloat(valHidEl?.value) || 0;
    window._pendingEntrega    = chk ? chk.checked : false;
    window._pendingEntregaVal = valEnt;
    // Garantir que o hidden tem o valor correto
    if (valHidEl && valEnt > 0) valHidEl.value = valEnt.toFixed(2);
    wizGo(2); return;
  }
  if (_wizStep === 2) {
    // Sincronizar toggle de entrega antes de avançar
    if (window._pendingEntrega !== undefined) {
      const chk = document.getElementById("loc-entrega-chk");
      if (chk && chk.checked !== window._pendingEntrega) {
        chk.checked = window._pendingEntrega;
        chk.dispatchEvent(new Event("change"));
      }
    }
    // Guardar valor da entrega para o resumo — não sobrescrever se já foi salvo no step 1
    const valEntStep2 = parseFloat(window.gv?.("loc-entrega-val-hidden") || window.gv?.("loc-entrega-val")) || 0;
    if (valEntStep2 > 0) window._pendingEntregaVal = valEntStep2;
    // Delegado para locacoes.js via window
    window._wizNext2?.();
  }
};

window.wizBack = function () {
  if (_wizStep > 1) {
    wizGo(_wizStep - 1);
    // Ao voltar ao step 1, sincronizar toggle de entrega
    if (_wizStep === 1 && window._pendingEntrega !== undefined) {
      setTimeout(() => {
        const chk = document.getElementById("loc-entrega-chk");
        if (chk && chk.checked !== window._pendingEntrega) {
          chk.checked = window._pendingEntrega;
          chk.dispatchEvent(new Event("change"));
        }
      }, 50);
    }
  }
};

window.wizStep = function (step, force) {
  if (force) { wizGo(step); return; }
  window.wizNext();
};

// ─── Alternar view do calendário ──────────────────────────────────────────────
window.trocarViewCal = function(view, chip) {
  document.querySelectorAll("#page-calendario .chips .chip").forEach(c => c.classList.remove("on"));
  chip.classList.add("on");
  const vc = document.getElementById("view-calendario");
  const va = document.getElementById("view-agenda");
  if (vc) vc.style.display = view === "calendario" ? "" : "none";
  if (va) va.style.display = view === "agenda"    ? "" : "none";
  if (view === "agenda") window.renderAgenda?.();
  else window.renderCal?.();
};

// ═══════════════════════════════════════════════════════════════════════════════
// BUSCA GLOBAL (Ctrl+K)
// ═══════════════════════════════════════════════════════════════════════════════
window.toggleBuscaGlobal = function() {
  const ov = document.getElementById("busca-global-ov");
  if (!ov) return;
  const abrir = !ov.classList.contains("on");
  ov.classList.toggle("on", abrir);
  if (abrir) {
    const inp = document.getElementById("busca-global-input");
    if (inp) { inp.value = ""; inp.focus(); }
    window.renderBuscaGlobal();
  }
};
window.fecharBuscaGlobal = function() {
  document.getElementById("busca-global-ov")?.classList.remove("on");
};

// Atalho Ctrl+K
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    window.toggleBuscaGlobal();
  }
  if (e.key === "Escape") window.fecharBuscaGlobal();
});

window.renderBuscaGlobal = function() {
  const div = document.getElementById("busca-global-res"); if (!div) return;
  const q = (document.getElementById("busca-global-input")?.value || "").toLowerCase().trim();
  if (!q || q.length < 2) {
    div.innerHTML = `<div class="bg-res-empty"><i class="ti ti-search" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>Digite para buscar clientes, locações ou itens</div>`;
    return;
  }
  const { locacoes, clientes, itens } = window._stateSearch || {};
  let html = "";

  // Clientes
  const clis = (clientes || []).filter(c =>
    (c.nome||"").toLowerCase().includes(q) || (c.tel||"").includes(q) || (c.email||"").toLowerCase().includes(q)
  ).slice(0, 4);
  if (clis.length) {
    html += `<div class="bg-res-sec">Clientes</div>`;
    html += clis.map(c => `<div class="bg-res-item" onclick="fecharBuscaGlobal();navTo('clientes');setTimeout(()=>document.getElementById('q-cli') && (document.getElementById('q-cli').value='${c.nome.replace(/'/g,"")}') && window.renderClientes?.(),300)">
      <div class="bg-res-ico" style="background:#fce4f3;color:#d4307a"><i class="ti ti-user"></i></div>
      <div><div class="bg-res-main">${c.nome}</div><div class="bg-res-sub">${c.tel || c.email || "Sem contato"}</div></div>
    </div>`).join("");
  }

  // Locações
  const locs = (locacoes || []).filter(l => {
    const cli = (clientes||[]).find(x => x.id === l.clienteId);
    return (cli?.nome||"").toLowerCase().includes(q) || (l.evento||"").toLowerCase().includes(q);
  }).slice(0, 4);
  if (locs.length) {
    html += `<div class="bg-res-sec">Locações</div>`;
    const sb = { ativo:"#d1fae5", orcamento:"#fef3c7", devolvido:"#dbeafe", cancelado:"#fee2e2" };
    const sl = { ativo:"Ativo", orcamento:"Orçamento", devolvido:"Devolvido", cancelado:"Cancelado" };
    html += locs.map(l => {
      const cli = (clientes||[]).find(x => x.id === l.clienteId);
      return `<div class="bg-res-item" onclick="fecharBuscaGlobal();navTo('locacoes');setTimeout(()=>document.getElementById('q-loc') && (document.getElementById('q-loc').value='${(cli?.nome||"").replace(/'/g,"")}') && window.renderLoc?.(),300)">
        <div class="bg-res-ico" style="background:#fce4f3;color:#d4307a"><i class="ti ti-receipt"></i></div>
        <div style="flex:1"><div class="bg-res-main">${cli?.nome || "—"} · ${l.evento || "Sem evento"}</div><div class="bg-res-sub">${l.retirada || ""} · R$${(l.total||0).toFixed(2).replace(".",",")}</div></div>
        <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${sb[l.status]||"#eee"};color:${l.status==="ativo"?"#065f46":l.status==="orcamento"?"#92400e":l.status==="devolvido"?"#1e3a8a":"#666"}">${sl[l.status]||l.status}</span>
      </div>`;
    }).join("");
  }

  // Itens
  const its = ((itens||[]).filter(i => (i.nome||"").toLowerCase().includes(q) || (i.tags||"").toLowerCase().includes(q))).slice(0, 4);
  if (its.length) {
    html += `<div class="bg-res-sec">Itens</div>`;
    html += its.map(i => `<div class="bg-res-item" onclick="fecharBuscaGlobal();navTo('itens')">
      <div class="bg-res-ico" style="background:#ede9fe;color:#7c3aed">${i.foto ? `<img src="${i.foto}" style="width:100%;height:100%;border-radius:8px;object-fit:cover">` : '<i class="ti ti-package"></i>'}</div>
      <div><div class="bg-res-main">${i.nome}</div><div class="bg-res-sub">${i.categoria||""} · ${i.qtd||0} em estoque</div></div>
    </div>`).join("");
  }

  div.innerHTML = html || `<div class="bg-res-empty">Nenhum resultado para "<strong>${q}</strong>"</div>`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SWIPE PARA FECHAR MODAIS (iOS/Android)
// ═══════════════════════════════════════════════════════════════════════════════
export function initSwipeToClose() {
  document.addEventListener("touchstart", _swipeTouchStart, { passive: true });
  document.addEventListener("touchmove",  _swipeTouchMove,  { passive: false });
  document.addEventListener("touchend",   _swipeTouchEnd,   { passive: true });
}
window.initSwipeToClose = initSwipeToClose;

let _swipeStartY = 0, _swipeModal = null, _swipeDragging = false;

function _swipeTouchStart(e) {
  const modal = e.target.closest(".modal");
  if (!modal) return;
  _swipeStartY   = e.touches[0].clientY;
  _swipeModal    = modal;
  _swipeDragging = false;
  modal.style.transition = "none";
}

function _swipeTouchMove(e) {
  if (!_swipeModal) return;
  const dy = e.touches[0].clientY - _swipeStartY;
  if (dy < 0) return;
  _swipeDragging = true;
  _swipeModal.style.transform = `translateY(${dy}px)`;
  if (dy > 30) e.preventDefault();
}

function _swipeTouchEnd(e) {
  if (!_swipeModal || !_swipeDragging) { _swipeModal = null; return; }
  const dy = e.changedTouches[0].clientY - _swipeStartY;
  _swipeModal.style.transition = "";
  if (dy > 120) {
    _swipeModal.style.transform = `translateY(100%)`;
    setTimeout(() => {
      const ov = _swipeModal?.closest(".ov");
      if (ov) {
        ov.classList.remove("on");
        _swipeModal.style.transform = "";
        const ham = document.getElementById("mob-menu-btn");
        if (ham) ham.style.display = "";
      }
    }, 220);
  } else {
    _swipeModal.style.transform = "";
  }
  _swipeModal    = null;
  _swipeDragging = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK na bottom nav
// ═══════════════════════════════════════════════════════════════════════════════
window.haptic = function(ms = 8) {
  if (navigator.vibrate) navigator.vibrate(ms);
};

// ═══════════════════════════════════════════════════════════════════════════════
// BOTÃO VOLTAR NATIVO fecha modal em vez de navegar
// ═══════════════════════════════════════════════════════════════════════════════
window.addEventListener("popstate", () => {
  const aberto = document.querySelector(".ov.on");
  if (aberto) {
    aberto.classList.remove("on");
    history.pushState(null, "", location.href);
    const ham = document.getElementById("mob-menu-btn");
    if (ham) ham.style.display = "";
  }
});

// Push state integrado diretamente em openModal (acima)

// ═══════════════════════════════════════════════════════════════════════════════
// SCROLL INTO VIEW ao focar input (iOS empurra campo para trás do teclado)
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener("focusin", e => {
  if (["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName)) {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PULL TO REFRESH
// ═══════════════════════════════════════════════════════════════════════════════
export function initPullToRefresh() {
  let startY = 0, pulling = false;
  const indicator = document.createElement("div");
  indicator.id = "ptr-indicator";
  indicator.innerHTML = '<i class="ti ti-refresh" style="font-size:20px;color:var(--p)"></i>';
  indicator.style.cssText = "position:fixed;top:-50px;left:50%;transform:translateX(-50%);width:40px;height:40px;border-radius:50%;background:var(--sur);box-shadow:0 2px 12px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;z-index:999;transition:top .2s";
  document.body.appendChild(indicator);

  document.addEventListener("touchstart", e => {
    if (window.scrollY > 0) return;
    if (document.querySelector(".ov.on")) return;
    startY  = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener("touchmove", e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 10 && dy < 100) {
      indicator.style.top = (dy - 40) + "px";
      indicator.querySelector("i").style.transform = `rotate(${dy * 3}deg)`;
    }
  }, { passive: true });

  document.addEventListener("touchend", e => {
    if (!pulling) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - startY;
    indicator.style.top = "-50px";
    if (dy > 70) {
      window.haptic?.(20);
      indicator.querySelector("i").style.animation = "rot .7s linear infinite";
      indicator.style.top = "12px";
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
  }, { passive: true });
}
window.initPullToRefresh = initPullToRefresh;
