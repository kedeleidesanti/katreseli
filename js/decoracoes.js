import { db, doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp }
  from "./firebase.js";
import { el, gv, sv, notif, fmtR, comprimirImagem } from "./helpers.js";
import { itens, decoracoes }        from "./state.js";
import { closeModal, openModal }    from "./navigation.js";

export let decItens = [];

// ─── Preencher select de itens (alfabético) ───────────────────────────────────
export function preencherSelDec() {
  const s = el("dec-sel"); if (!s) return;
  const sorted = [...itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  s.innerHTML = '<option value="">Selecione item...</option>' +
    sorted.map(i => `<option value="${i.id}">${i.nome} — ${fmtR(i.aluguel)}</option>`).join("");
}

// ─── Renderizar lista de itens do kit ─────────────────────────────────────────
export function renderDecLista() {
  const div = el("dec-lista"); if (!div) return;
  const soma = decItens.reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);

  // Atualizar campo de valor cheio
  const cheio = el("dec-valor-cheio");
  if (cheio) cheio.value = fmtR(soma);

  // Calcular valor final com desconto
  calcValorKit();

  if (!decItens.length) {
    div.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:6px 0">Nenhum item adicionado</div>';
    return;
  }

  div.innerHTML = decItens.map((it, i) => {
    const itemCat = itens.find(x => x.id === it.id);
    const estoqueMax = itemCat?.qtd ?? 999;
    const noLimite = it.qtd >= estoqueMax;
    const estoqueLabel = itemCat
      ? `<span title="Estoque disponível" style="font-size:10px;color:${noLimite ? '#dc2626' : 'var(--txt3)'};white-space:nowrap;flex-shrink:0">(${it.qtd}/${estoqueMax})</span>`
      : "";
    return `<div class="dec-item-row" draggable="true" data-idx="${i}"
        style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--bdr);font-size:12px;cursor:default;border-radius:6px;transition:background .12s,opacity .15s">
      <span class="dec-drag-handle" title="Arraste para reordenar"
        style="cursor:grab;color:var(--txt3);font-size:15px;flex-shrink:0;padding:0 2px;user-select:none;touch-action:none">⠿</span>
      <span style="flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.nome}</span>
      ${estoqueLabel}
      <button class="qbtn" onclick="qdec(${i},-1)">−</button>
      <span style="min-width:20px;text-align:center;font-weight:700">${it.qtd}</span>
      <button class="qbtn" onclick="qdec(${i},1)" ${noLimite ? `disabled title="Limite de estoque atingido" style="opacity:.35;cursor:not-allowed"` : ""}>+</button>
      <span style="color:var(--p);font-weight:600;min-width:62px;text-align:right">${fmtR((it.aluguel || 0) * it.qtd)}</span>
      <button class="qbtn" onclick="rdec(${i})" style="color:#991b1b;border-color:#fca5a5">×</button>
    </div>`;
  }).join("");

  // ── Drag-and-drop para reordenar ──────────────────────────────────────────
  _initDecDragDrop(div);
}

// ─── Lógica de drag-and-drop da lista de itens do kit ─────────────────────────
let _dragIdx = null;

function _initDecDragDrop(container) {
  const rows = container.querySelectorAll(".dec-item-row");

  rows.forEach(row => {
    // Mouse drag
    row.addEventListener("dragstart", e => {
      _dragIdx = parseInt(row.dataset.idx);
      row.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.style.opacity = "";
      container.querySelectorAll(".dec-item-row").forEach(r => {
        r.style.background = "";
        r.style.borderTop  = "";
      });
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      container.querySelectorAll(".dec-item-row").forEach(r => r.style.background = "");
      row.style.background = "var(--pl)";
    });
    row.addEventListener("dragleave", () => {
      row.style.background = "";
    });
    row.addEventListener("drop", e => {
      e.preventDefault();
      const dropIdx = parseInt(row.dataset.idx);
      if (_dragIdx === null || _dragIdx === dropIdx) return;
      // Reordenar array
      const [moved] = decItens.splice(_dragIdx, 1);
      decItens.splice(dropIdx, 0, moved);
      _dragIdx = null;
      renderDecLista();
    });

    // Touch drag (mobile)
    const handle = row.querySelector(".dec-drag-handle");
    if (handle) {
      handle.addEventListener("touchstart", _touchDragStart, { passive: false });
    }
  });
}

// ── Touch drag ────────────────────────────────────────────────────────────────
let _touchDragRow = null, _touchDragIdx = null, _touchClone = null;

function _touchDragStart(e) {
  e.preventDefault();
  const row = e.currentTarget.closest(".dec-item-row");
  if (!row) return;
  _touchDragIdx = parseInt(row.dataset.idx);
  _touchDragRow = row;
  row.style.opacity = "0.4";

  // Clone visual
  _touchClone = row.cloneNode(true);
  _touchClone.style.cssText = `position:fixed;z-index:99999;pointer-events:none;opacity:.85;background:var(--sur);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.18);width:${row.offsetWidth}px;transition:none`;
  document.body.appendChild(_touchClone);

  const touch = e.touches[0];
  _touchClone.style.left = (touch.clientX - row.offsetWidth / 2) + "px";
  _touchClone.style.top  = (touch.clientY - row.offsetHeight / 2) + "px";

  document.addEventListener("touchmove",  _touchDragMove,  { passive: false });
  document.addEventListener("touchend",   _touchDragEnd,   { passive: true  });
  document.addEventListener("touchcancel",_touchDragCancel,{ passive: true  });
}

function _touchDragMove(e) {
  e.preventDefault();
  if (!_touchClone) return;
  const touch = e.touches[0];
  _touchClone.style.left = (touch.clientX - _touchClone.offsetWidth  / 2) + "px";
  _touchClone.style.top  = (touch.clientY - _touchClone.offsetHeight / 2) + "px";

  // Highlight target row
  const div = el("dec-lista"); if (!div) return;
  div.querySelectorAll(".dec-item-row").forEach(r => r.style.background = "");
  _touchClone.style.display = "none";
  const under = document.elementFromPoint(touch.clientX, touch.clientY);
  _touchClone.style.display = "";
  const targetRow = under?.closest(".dec-item-row");
  if (targetRow) targetRow.style.background = "var(--pl)";
}

function _touchDragEnd(e) {
  if (!_touchClone) return;
  const touch = e.changedTouches[0];
  _touchClone.style.display = "none";
  const under = document.elementFromPoint(touch.clientX, touch.clientY);
  _touchClone.remove(); _touchClone = null;

  if (_touchDragRow) { _touchDragRow.style.opacity = ""; _touchDragRow = null; }
  const targetRow = under?.closest(".dec-item-row");
  if (targetRow) {
    const dropIdx = parseInt(targetRow.dataset.idx);
    if (_touchDragIdx !== null && _touchDragIdx !== dropIdx) {
      const [moved] = decItens.splice(_touchDragIdx, 1);
      decItens.splice(dropIdx, 0, moved);
      renderDecLista();
    }
  }
  _touchDragIdx = null;
  document.removeEventListener("touchmove",   _touchDragMove);
  document.removeEventListener("touchend",    _touchDragEnd);
  document.removeEventListener("touchcancel", _touchDragCancel);
}

function _touchDragCancel() {
  if (_touchClone) { _touchClone.remove(); _touchClone = null; }
  if (_touchDragRow) { _touchDragRow.style.opacity = ""; _touchDragRow = null; }
  _touchDragIdx = null;
  document.removeEventListener("touchmove",   _touchDragMove);
  document.removeEventListener("touchend",    _touchDragEnd);
  document.removeEventListener("touchcancel", _touchDragCancel);
}

// ─── Calcular valor final com desconto ────────────────────────────────────────
window.calcValorKit = function() {
  const soma = decItens.reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);
  const desc = parseFloat(gv("dec-desconto")) || 0;
  const final = Math.max(0, soma - desc);
  sv("dec-valor", final.toFixed(2));

  const dEl = el("dec-desconto");
  if (dEl) {
    dEl.style.borderColor = desc > 0 ? "#059669" : "";
    dEl.style.background  = desc > 0 ? "#f0fdf4" : "";
  }

  const vEl = el("dec-valor");
  if (vEl) { vEl.style.borderColor = ""; vEl.style.background = ""; }
};

// ─── Abrir modal — novo kit ───────────────────────────────────────────────────
export function abrirDecModal() {
  decItens.length = 0;
  _limparDecModal();
  preencherSelDec();
  renderDecLista();
  if (el("dec-titulo")) el("dec-titulo").textContent = "Criar kit";
  openModal("modal-dec");
}
window.abrirDecModal = abrirDecModal;

function _limparDecModal() {
  window._decValorManual = false;
  const vEl = el("dec-valor");
  if (vEl) { vEl.style.borderColor = ""; vEl.style.background = ""; }
  ["dec-id","dec-nome","dec-tema","dec-desc","dec-valor","dec-desconto"].forEach(id => sv(id, ""));
  sv("dec-desconto", "0");
  sv("dec-status", "Disponivel");
  const prev = el("dec-foto-prev"); if (prev) prev.innerHTML = "🎀";
  const fi   = el("dec-foto-file"); if (fi)   fi.value       = "";
  sv("dec-foto", "");
  const cheio = el("dec-valor-cheio"); if (cheio) cheio.value = "";
}

// ─── Adicionar item ao kit ────────────────────────────────────────────────────
window.addItemDec = function() {
  const id = gv("dec-sel"); if (!id) return;
  const i  = itens.find(x => x.id === id); if (!i) return;
  const ex = decItens.find(x => x.id === id);
  if (ex) ex.qtd++;
  else decItens.push({ id, nome: i.nome, aluguel: i.aluguel || 0, qtd: 1 });
  renderDecLista();
  sv("dec-sel", "");
};

window.qdec = (i, d) => {
  const it = decItens[i];
  if (!it) return;
  const itemCat = itens.find(x => x.id === it.id);
  const estoqueMax = itemCat?.qtd ?? 999;
  it.qtd = Math.min(estoqueMax, Math.max(1, it.qtd + d));
  if (d > 0 && it.qtd >= estoqueMax) notif(`Limite de estoque atingido: ${estoqueMax} unidade${estoqueMax > 1 ? "s" : ""}`, true);
  renderDecLista();
};
window.rdec = (i)    => { decItens.splice(i, 1); renderDecLista(); };

// ─── Visualizar itens do kit (painel expandido) ───────────────────────────────
window.verItensKit = function() {
  if (!decItens.length) { notif("Nenhum item no kit ainda!", true); return; }
  const soma  = decItens.reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);
  const desc  = parseFloat(gv("dec-desconto")) || 0;
  const final = Math.max(0, soma - desc);
  const nome  = gv("dec-nome") || "Kit";

  const linhas = decItens.map(it =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px">${it.nome}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:600">${it.qtd}</td>
      <td style="padding:8px 12px;text-align:right;color:var(--p);font-weight:600">${fmtR((it.aluguel||0)*it.qtd)}</td>
    </tr>`
  ).join("");

  // Criar painel temporário
  let painel = el("kit-preview-painel");
  if (!painel) {
    painel = document.createElement("div");
    painel.id = "kit-preview-painel";
    painel.style.cssText = "position:fixed;inset:0;background:#0006;z-index:99999;display:flex;align-items:center;justify-content:center";
    painel.addEventListener("click", e => { if (e.target === painel) painel.remove(); });
    document.body.appendChild(painel);
  }

  painel.innerHTML = `
    <div style="background:#fff;border-radius:16px;box-shadow:0 8px 40px #0003;width:460px;max-width:95vw;overflow:hidden">
      <div style="padding:16px 20px;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:space-between">
        <strong style="font-size:15px">🎀 ${nome}</strong>
        <button onclick="document.getElementById('kit-preview-painel').remove()" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1">×</button>
      </div>
      <div style="max-height:50vh;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--pl)">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--pd);text-transform:uppercase">Item</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--pd);text-transform:uppercase">Qtd</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--pd);text-transform:uppercase">Valor</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--bdr)">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span style="color:var(--txt2)">Soma dos itens</span>
          <span style="font-weight:600">${fmtR(soma)}</span>
        </div>
        ${desc > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span style="color:#059669">Desconto</span>
          <span style="font-weight:600;color:#059669">− ${fmtR(desc)}</span>
        </div>` : ""}
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:var(--p);padding-top:8px;border-top:1.5px solid var(--bdr)">
          <span>Total do kit</span>
          <span>${fmtR(final)}</span>
        </div>
      </div>
    </div>`;
};

// ─── Salvar kit ───────────────────────────────────────────────────────────────
window.salvarDec = async function() {
  const nome = gv("dec-nome");
  if (!nome) { notif("Informe o nome!", true); return; }
  if (!decItens.length) { notif("Adicione pelo menos um item ao kit!", true); return; }

  const soma  = decItens.reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);
  const desc  = parseFloat(gv("dec-desconto")) || 0;

  // Valor final: usa o que o usuário digitou, senão calcula
  const valorDigitado = parseFloat(gv("dec-valor"));
  const final = isNaN(valorDigitado) ? Math.max(0, soma - desc) : Math.max(0, valorDigitado);

  // Se o valor final é maior que a soma, dilui a diferença nos itens proporcionalmente
  // (só dentro deste kit — não altera o catálogo)
  let itensParaSalvar = JSON.parse(JSON.stringify(decItens));
  if (final > soma && soma > 0) {
    const fator = final / soma;
    let acumulado = 0;
    itensParaSalvar = itensParaSalvar.map((it, idx) => {
      const isUltimo = idx === itensParaSalvar.length - 1;
      let novoAluguel;
      if (isUltimo) {
        // Último item absorve o arredondamento para bater exatamente o total
        const somaAntes = itensParaSalvar.slice(0, idx).reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);
        novoAluguel = Math.max(0, (final - somaAntes) / (it.qtd || 1));
      } else {
        novoAluguel = Math.round((it.aluguel || 0) * fator * 100) / 100;
        acumulado += novoAluguel * (it.qtd || 1);
      }
      return { ...it, aluguel: novoAluguel };
    });
  }

  const dados = {
    nome,
    tema:          gv("dec-tema"),
    desc:          gv("dec-desc"),
    itensInclusos: itensParaSalvar,
    valorCheio:    soma,
    desconto:      desc,
    valorTotal:    final,
    status:        gv("dec-status"),
    foto:          gv("dec-foto"),
    fotos:         JSON.parse((el("dec-fotos-json")?.value) || "[]"),
    atualizadoEm:  serverTimestamp()
  };

  const id = gv("dec-id");
  try {
    if (id) {
      await updateDoc(doc(db, "decoracoes", id), dados);
      notif("Kit atualizado!");
    } else {
      dados.criadoEm = serverTimestamp();
      await addDoc(collection(db, "decoracoes"), dados);
      notif("Kit criado!");
    }
    closeModal("modal-dec");
  } catch (e) {
    notif("Erro: " + e.message, true);
  }
};

// ─── Editar kit ───────────────────────────────────────────────────────────────
window.editDec = function(id) {
  const d = decoracoes.find(x => x.id === id); if (!d) return;

  _limparDecModal();
  sv("dec-id",       id);
  sv("dec-nome",     d.nome       || "");
  sv("dec-tema",     d.tema       || "");
  sv("dec-desc",     d.desc       || "");
  sv("dec-status",   d.status     || "Disponivel");
  sv("dec-desconto", d.desconto   || 0);
  sv("dec-foto",     d.foto       || "");
  const fotosEdit = d.fotos || (d.foto ? [d.foto] : []);
  const jElEdit   = el("dec-fotos-json"); if (jElEdit) jElEdit.value = JSON.stringify(fotosEdit);
  setTimeout(() => renderDecFotosGrid(fotosEdit), 50);

  const prevEdit = el("dec-foto-prev");
  if (prevEdit) prevEdit.innerHTML = d.foto
    ? `<img src="${d.foto}" style="width:100%;height:100%;object-fit:cover">`
    : "🎀";

  // Carregar subitens ANTES de abrir o modal
  decItens.length = 0;
  decItens.push(...JSON.parse(JSON.stringify(d.itensInclusos || [])));

  if (el("dec-titulo")) el("dec-titulo").textContent = "Editar kit";

  // Abrir modal diretamente (sem passar por openModal que chama _decItens.length = 0)
  const modal = el("modal-dec"); if (modal) modal.classList.add("on");

  // Setar valor final salvo (sem ativar flag de override manual)
  window._decValorManual = false;
  if (d.valorTotal != null) sv("dec-valor", parseFloat(d.valorTotal).toFixed(2));

  // Popular selects e renderizar APÓS o modal estar visível
  setTimeout(() => {
    preencherSelDec();
    renderDecLista();
  }, 30);
};

// ─── Excluir kit ──────────────────────────────────────────────────────────────
window.delDec = async function(id) {
  if (!await window.confirmar({ titulo:"Excluir kit", msg:`Tem certeza que deseja excluir o kit "${(decoracoes.find(x=>x.id===id)||{}).nome||""}"? Esta ação não pode ser desfeita.`, tipo:"danger", labelOk:"Excluir" })) return;
  deleteDoc(doc(db, "decoracoes", id))
    .then(() => notif("Removido."))
    .catch(e => notif("Erro: " + e.message, true));
};

// ─── Renderizar tabela de decorações ─────────────────────────────────────────
// ─── Cor automática por tema ──────────────────────────────────────────────────
function _temaHue(tema) {
  let h = 0;
  for (let i = 0; i < tema.length; i++) h = (h * 31 + tema.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}
function _temaBadgeStyle(tema) {
  const hue = _temaHue(tema);
  return `display:inline-block;padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:600;white-space:nowrap;` +
    `background:hsl(${hue},55%,88%);color:hsl(${hue},45%,32%);border:1.5px solid hsl(${hue},45%,75%)`;
}

window.renderDecs = function() {
  const q      = (gv("q-dec") || "").toLowerCase();
  const tema   = window._decTemaAtivo || "";

  // ── Chips de tema ─────────────────────────────────────────────────────────
  const chipsEl = el("dec-tema-chips");
  if (chipsEl) {
    const temas = [...new Set(decoracoes.map(d => d.tema).filter(Boolean))].sort();
    chipsEl.innerHTML =
      `<span onclick="window._decTemaAtivo='';resetPag('dec');renderDecs()" style="cursor:pointer;display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid ${!tema ? 'var(--p)' : 'var(--bdr2)'};background:${!tema ? 'var(--p)' : 'transparent'};color:${!tema ? '#fff' : 'var(--txt2)'};transition:all .15s">Todos</span>` +
      temas.map(t => {
        const hue = _temaHue(t);
        const ativo = tema === t;
        return `<span onclick="window._decTemaAtivo='${t.replace(/'/g,"\\'")}';resetPag('dec');renderDecs()" style="cursor:pointer;display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;transition:all .15s;${ativo
          ? `background:hsl(${hue},55%,60%);color:#fff;border:1.5px solid hsl(${hue},45%,50%)`
          : `background:hsl(${hue},55%,92%);color:hsl(${hue},45%,30%);border:1.5px solid hsl(${hue},45%,78%)`}">${t}</span>`;
      }).join("");
  }

  // ── Filtrar rows ──────────────────────────────────────────────────────────
  const rows = decoracoes.filter(d => {
    const matchQ    = !q    || d.nome.toLowerCase().includes(q) || (d.tema || "").toLowerCase().includes(q);
    const matchTema = !tema || (d.tema || "") === tema;
    return matchQ && matchTema;
  });

  const cnt = el("cnt-dec"); if (cnt) cnt.textContent = rows.length;
  const tb  = el("tb-dec");  if (!tb) return;

  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><i class="ti ti-balloon"></i><p>Nenhuma decoração</p></div></td></tr>';
    document.getElementById("pag-dec") && (document.getElementById("pag-dec").innerHTML = "");
    return;
  }

  // Agrupar ANTES de paginar para não quebrar grupos entre páginas
  const grupos = {};
  for (const d of rows) {
    const t = d.tema || "Sem tema";
    if (!grupos[t]) grupos[t] = [];
    grupos[t].push(d);
  }

  // Limpar paginação — decorações renderizam tudo de uma vez agrupado por tema
  const pagWrap = document.getElementById("pag-dec");
  if (pagWrap) pagWrap.innerHTML = "";

  let html = "";
  for (const [tema, kits] of Object.entries(grupos)) {
    const hue = _temaHue(tema);
    const temFiltro = !!window._decTemaAtivo;
    if (!temFiltro) {
      html += `<tr style="background:hsl(${hue},50%,94%);border-left:3px solid hsl(${hue},50%,65%)">
        <td colspan="6" style="padding:6px 14px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:hsl(${hue},55%,55%);flex-shrink:0"></div>
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:hsl(${hue},45%,30%)">${tema}</span>
            <span style="font-size:11px;color:hsl(${hue},40%,50%)">${kits.length} kit${kits.length>1?"s":""}</span>
          </div>
        </td>
      </tr>`;
    }
      for (const d of kits) {
        const thumb = d.foto
          ? `<div class="dec-thumb-wrap"><img src="${d.foto}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;display:block;cursor:zoom-in"><div class="dec-thumb-hover"><img src="${d.foto}" alt="${d.nome}"><span>${d.nome}</span></div></div>`
          : `<div style="width:44px;height:44px;border-radius:10px;background:var(--pl);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🎀</div>`;
        const temDesc = (d.desconto || 0) > 0;
        html += `<tr style="${!temFiltro ? `border-left:3px solid hsl(${hue},45%,75%)` : ""}">
          <td><div style="display:flex;align-items:center;gap:8px">
            ${thumb}
            <div>
              <div style="font-weight:500">${d.nome}</div>
              <div style="font-size:10px;color:var(--txt2)">${d.desc || ""}</div>
            </div>
          </div></td>
          <td>${d.tema ? `<span style="${_temaBadgeStyle(d.tema)}">${d.tema}</span>` : '<span style="color:var(--txt3);font-size:12px">−</span>'}</td>
          <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${(d.itensInclusos || []).map(i => i.nome).join(", ")}
          </td>
          <td>
            ${temDesc ? `<div style="font-size:10px;color:var(--txt3);text-decoration:line-through">${fmtR(d.valorCheio||d.valorTotal)}</div>` : ""}
            <div style="font-weight:700;color:var(--p)">${fmtR(d.valorTotal)}</div>
            ${temDesc ? `<div style="font-size:10px;color:#059669">− ${fmtR(d.desconto)} desc.</div>` : ""}
          </td>
          <td><span class="badge ${d.status === "Disponivel" ? "bg" : "br"}">${d.status || "Disponivel"}</span></td>
          <td><div class="acts">
            <button class="btn btn-b btn-xs" onclick="verItensKitTabela('${d.id}')" title="Visualizar itens">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Ver itens
            </button>
            <button class="btn btn-s btn-xs" onclick="editDec('${d.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar
            </button>
            <button class="btn btn-xs" onclick="duplicarKit('${d.id}')" title="Duplicar kit" style="background:#ede9fe;color:#6d28d9;border:1.5px solid #c4b5fd">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="btn btn-d btn-xs" onclick="delDec('${d.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div></td>
        </tr>`;
      }
    }
    // Mobile: cards
    const isMob = window.innerWidth < 700;
    const twEl = document.getElementById("tw-dec");
    const cardsEl = document.getElementById("cards-dec");
    if (isMob && twEl) twEl.style.display = "none";
    if (!isMob && twEl) twEl.style.display = "";
    if (isMob && cardsEl) {
      cardsEl.style.display = "block";
      let cardHtml = "";
      for (const [temaKey, kits] of Object.entries(grupos)) {
        const hue = _temaHue(temaKey);
        const temFiltro = !!window._decTemaAtivo;
        if (!temFiltro) {
          cardHtml += `<div style="display:flex;align-items:center;gap:8px;padding:8px 4px 4px"><div style="width:8px;height:8px;border-radius:50%;background:hsl(${hue},55%,55%)"></div><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:hsl(${hue},45%,30%)">${temaKey}</span><span style="font-size:11px;color:hsl(${hue},40%,50%)">${kits.length} kit${kits.length>1?"s":""}</span></div>`;
        }
        for (const d of kits) {
          const temDesc = (d.desconto || 0) > 0;
          const itensStr = (d.itensInclusos || []).slice(0,3).map(i=>i.nome).join(", ") + ((d.itensInclusos||[]).length > 3 ? " ..." : "");
          cardHtml += `<div class="dec-card-m">
            <div class="dec-card-m-top">
              ${d.foto ? `<img src="${d.foto}" alt="${d.nome}">` : `<div class="dec-ph">🎀</div>`}
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.nome}</div>
                <div style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap">
                  ${d.tema ? `<span style="${_temaBadgeStyle(d.tema)};font-size:10px">${d.tema}</span>` : ""}
                  <span class="badge ${d.status==="Disponivel"?"bg":"br"}" style="font-size:10px">${d.status||"Disponivel"}</span>
                </div>
              </div>
            </div>
            <div class="dec-card-m-dados">
              <div style="font-size:11px;color:var(--txt3)">${itensStr||"—"}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                ${temDesc ? `<span style="font-size:11px;color:var(--txt3);text-decoration:line-through">${fmtR(d.valorCheio||d.valorTotal)}</span>` : ""}
                <span style="font-size:16px;font-weight:800;color:var(--p)">${fmtR(d.valorTotal)}</span>
                ${temDesc ? `<span style="font-size:11px;color:#059669">−${fmtR(d.desconto)}</span>` : ""}
              </div>
            </div>
            <div class="dec-card-m-acts">
              <button class="btn btn-b btn-xs" onclick="verItensKitTabela('${d.id}')"><i class="ti ti-eye" style="font-size:13px"></i> Ver itens</button>
              <button class="btn btn-s btn-xs" onclick="editDec('${d.id}')"><i class="ti ti-edit" style="font-size:13px"></i> Editar</button>
              <button class="btn btn-xs" onclick="duplicarKit('${d.id}')" style="background:#ede9fe;color:#6d28d9;border:1.5px solid #c4b5fd"><i class="ti ti-copy" style="font-size:14px"></i></button>
              <button class="btn btn-d btn-xs" onclick="delDec('${d.id}')"><i class="ti ti-trash" style="font-size:14px"></i></button>
            </div>
          </div>`;
        }
      }
      cardsEl.innerHTML = cardHtml;
    } else if (cardsEl) {
      cardsEl.style.display = "none";
      tb.innerHTML = html;
    } else {
      tb.innerHTML = html;
    }
};

// ─── Upload de múltiplas fotos ────────────────────────────────────────────────
// As fotos do kit ficam salvas juntas no mesmo documento do Firestore, que tem
// limite de 1MB. Por isso cada foto é comprimida (redimensionada + reduzida a
// qualidade) antes de entrar na lista — evita o erro "document ... exceeds the
// maximum allowed size".
window.uploadFotosDec = window.uploadFotoDec = async function(input) {
  if (!input.files.length) return;
  const jEl   = el("dec-fotos-json");
  const fotos = jEl ? JSON.parse(jEl.value || "[]") : [];
  const MAX   = 6;
  const pendentes = Math.min(input.files.length, MAX - fotos.length);
  if (pendentes <= 0) { notif("Máximo de 6 fotos atingido!", true); return; }

  const arquivos = Array.from(input.files).slice(0, pendentes);
  input.value = "";

  let carregadas = 0;
  for (const file of arquivos) {
    if (file.size > 12 * 1024 * 1024) { notif("Foto muito grande! Máx. 12MB.", true); continue; }
    try {
      const b64 = await comprimirImagem(file, { maxDim: 900, maxBytes: 110 * 1024 });
      fotos.push(b64);
      if (jEl) jEl.value = JSON.stringify(fotos);
      const cf = el("dec-foto"); if (cf && fotos.length === 1) cf.value = fotos[0];
      carregadas++;
      renderDecFotosGrid(fotos);
    } catch (err) {
      notif("Erro ao processar foto: " + err.message, true);
    }
  }
  if (carregadas) notif(`${carregadas} foto(s) adicionada(s)!`);
};

function renderDecFotosGrid(fotos) {
  const grid = el("dec-fotos-grid"); if (!grid) return;
  grid.innerHTML = fotos.map((f, i) => `
    <div style="position:relative;border-radius:10px;overflow:hidden;aspect-ratio:1;border:1.5px solid var(--bdr2)">
      <img src="${f}" style="width:100%;height:100%;object-fit:cover">
      ${i === 0 ? '<div style="position:absolute;bottom:4px;left:4px;background:var(--p);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px">CAPA</div>' : ""}
      <button onclick="removerFotoDec(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center">×</button>
    </div>`).join("") +
    (fotos.length < 6 ? `
    <div onclick="document.getElementById('dec-foto-file').click()" style="border-radius:10px;border:2px dashed var(--bdr2);aspect-ratio:1;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--txt3);font-size:28px;transition:border-color .15s;background:var(--bg)" onmouseover="this.style.borderColor='var(--p)'" onmouseout="this.style.borderColor='var(--bdr2)'">+</div>` : "");
}
window.renderDecFotosGrid = renderDecFotosGrid;

window.removerFotoDec = function(idx) {
  const jEl   = el("dec-fotos-json"); if (!jEl) return;
  const fotos = JSON.parse(jEl.value || "[]");
  fotos.splice(idx, 1);
  jEl.value = JSON.stringify(fotos);
  const cf = el("dec-foto"); if (cf) cf.value = fotos[0] || "";
  renderDecFotosGrid(fotos);
};

window.limparFotoDec = function() {
  const jEl = el("dec-fotos-json"); if (jEl) jEl.value = "[]";
  const cf  = el("dec-foto");       if (cf)  cf.value  = "";
  const fi  = el("dec-foto-file");  if (fi)  fi.value  = "";
  renderDecFotosGrid([]);
};

// ─── Hover tooltip do thumbnail ───────────────────────────────────────────────
document.addEventListener("mousemove", function(e) {
  const tooltip = document.querySelector(".dec-thumb-wrap:hover .dec-thumb-hover");
  if (!tooltip) return;
  const x = e.clientX + 16;
  const tw = 280, th = 240;
  const left = x + tw > window.innerWidth  ? e.clientX - tw - 16 : x;
  const top  = e.clientY - th/2 < 8       ? 8
             : e.clientY + th/2 > window.innerHeight - 8 ? window.innerHeight - th - 8
             : e.clientY - th/2;
  tooltip.style.left = left + "px";
  tooltip.style.top  = top  + "px";
});

// ─── Visualizar itens diretamente da tabela ──────────────────────────────────
window.verItensKitTabela = function(id) {
  const d = decoracoes.find(x => x.id === id); if (!d) return;
  const soma  = (d.itensInclusos || []).reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);
  const desc  = d.desconto || 0;
  const final = d.valorTotal || soma;

  const linhas = (d.itensInclusos || []).map(it =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px">${it.nome}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:600">${it.qtd}</td>
      <td style="padding:8px 12px;text-align:right;color:var(--p);font-weight:600">${fmtR((it.aluguel||0)*it.qtd)}</td>
    </tr>`
  ).join("");

  const painel = document.createElement("div");
  painel.style.cssText = "position:fixed;inset:0;background:#0006;z-index:99999;display:flex;align-items:center;justify-content:center";
  painel.addEventListener("click", e => { if (e.target === painel) painel.remove(); });

  painel.innerHTML = `
    <div style="background:#fff;border-radius:16px;box-shadow:0 8px 40px #0003;width:480px;max-width:95vw;overflow:hidden">
      <div style="padding:16px 20px;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          ${d.foto ? `<img src="${d.foto}" style="width:36px;height:36px;border-radius:8px;object-fit:cover">` : `<span style="font-size:24px">🎀</span>`}
          <div>
            <div style="font-weight:700;font-size:15px">${d.nome}</div>
            ${d.tema ? `<div style="font-size:11px;opacity:.8">${d.tema}</div>` : ""}
          </div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1">×</button>
      </div>
      ${d.desc ? `<div style="padding:10px 20px;background:var(--pl);font-size:12px;color:var(--pd)">${d.desc}</div>` : ""}
      <div style="max-height:52vh;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--pl)">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--pd);text-transform:uppercase;letter-spacing:.5px">Item</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--pd);text-transform:uppercase;letter-spacing:.5px">Qtd</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--pd);text-transform:uppercase;letter-spacing:.5px">Valor</th>
            </tr>
          </thead>
          <tbody>${linhas || '<tr><td colspan="3" style="padding:16px;text-align:center;color:var(--txt3)">Nenhum item</td></tr>'}</tbody>
        </table>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--bdr)">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--txt2);margin-bottom:4px">
          <span>Soma dos itens</span><span style="font-weight:600">${fmtR(soma)}</span>
        </div>
        ${desc > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span style="color:#059669">Desconto aplicado</span>
          <span style="font-weight:600;color:#059669">− ${fmtR(desc)}</span>
        </div>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1.5px solid var(--bdr)">
          <span style="font-size:15px;font-weight:800;color:var(--p)">Total do kit</span>
          <span style="font-size:20px;font-weight:800;color:var(--p)">${fmtR(final)}</span>
        </div>
      </div>
      <div style="padding:10px 20px 14px;display:flex;justify-content:flex-end">
        <button class="btn btn-p" onclick="editDec('${id}');this.closest('[style*=fixed]').remove()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar kit
        </button>
      </div>
    </div>`;

  document.body.appendChild(painel);
};

// ─── Duplicar kit ─────────────────────────────────────────────────────────────
window.duplicarKit = async function(id) {
  const d = decoracoes.find(x => x.id === id); if (!d) return;
  const novoNome = (d.nome || "Kit") + " (cópia)";
  if (!await window.confirmar({ titulo:"Duplicar kit", msg:`Deseja duplicar "${d.nome}"? Será criado como "${novoNome}".`, tipo:"info", labelOk:"Duplicar" })) return;
  const novo = {
    nome:          novoNome,
    tema:          d.tema          || "",
    desc:          d.desc          || "",
    itensInclusos: JSON.parse(JSON.stringify(d.itensInclusos || [])),
    valorCheio:    d.valorCheio    || 0,
    desconto:      d.desconto      || 0,
    valorTotal:    d.valorTotal    || 0,
    status:        "Disponivel",
    foto:          d.foto          || "",
    fotos:         JSON.parse(JSON.stringify(d.fotos || [])),
    criadoEm:      serverTimestamp(),
    atualizadoEm:  serverTimestamp(),
  };
  try {
    await addDoc(collection(db, "decoracoes"), novo);
    notif(`Kit duplicado como "${novoNome}"!`);
  } catch(e) { notif("Erro ao duplicar: " + e.message, true); }
};

// ─── Sincronizar preços dos itens nos kits ────────────────────────────────────
// Chamado pelo onSnapshot de itens (main.js) para manter os kits atualizados
export async function sincronizarPrecoItensKit(itemId, novoAluguel) {
  if (!itemId) return;
  const kitsAfetados = decoracoes.filter(d =>
    (d.itensInclusos || []).some(i => i.id === itemId)
  );
  if (!kitsAfetados.length) return;

  let atualizados = 0;
  for (const kit of kitsAfetados) {
    const novosItens = (kit.itensInclusos || []).map(i =>
      i.id === itemId ? { ...i, aluguel: novoAluguel } : i
    );
    const novasSoma  = novosItens.reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);
    const novoTotal  = Math.max(0, novasSoma - (kit.desconto || 0));
    try {
      await updateDoc(doc(db, "decoracoes", kit.id), {
        itensInclusos: novosItens,
        valorCheio:    novasSoma,
        valorTotal:    novoTotal,
        atualizadoEm:  serverTimestamp(),
      });
      atualizados++;
    } catch(e) { console.warn("Erro ao sincronizar kit", kit.nome, e); }
  }
  if (atualizados > 0)
    notif(`${atualizados} kit(s) atualizado(s) com o novo valor do item.`);
}

// ─── Expor para navigation.js ─────────────────────────────────────────────────
window._decItens       = decItens;
window.renderDecLista  = renderDecLista;
window.preencherSelDec = preencherSelDec;

// ─── Câmera ao vivo para foto do kit ─────────────────────────────────────────
let _cameraKitStream = null;
let _cameraKitFacing = "environment";

window.abrirCameraKit = async function() {
  const modal = document.getElementById("modal-camera-kit");
  const video = document.getElementById("camera-kit-video");
  if (!modal || !video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment";
    inp.onchange = () => uploadFotosDec(inp);
    inp.click(); return;
  }
  try {
    _cameraKitStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: _cameraKitFacing, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = _cameraKitStream;
    modal.style.display = "flex";
    modal.style.flexDirection = "column";
  } catch(e) {
    notif("Câmera indisponível. Selecione uma foto.", true);
    document.getElementById("dec-foto-file")?.click();
  }
};

window.fecharCameraKit = function() {
  if (_cameraKitStream) { _cameraKitStream.getTracks().forEach(t => t.stop()); _cameraKitStream = null; }
  const modal = document.getElementById("modal-camera-kit");
  if (modal) modal.style.display = "none";
};

window.alternarCameraKit = async function() {
  _cameraKitFacing = _cameraKitFacing === "environment" ? "user" : "environment";
  fecharCameraKit();
  await abrirCameraKit();
};

window.capturarFotoKit = function() {
  const video  = document.getElementById("camera-kit-video");
  const canvas = document.getElementById("camera-kit-canvas");
  if (!video || !canvas) return;

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const b64 = canvas.toDataURL("image/jpeg", 0.85);

  // Inserir na grade de fotos do kit (mesmo fluxo do uploadFotosDec)
  const jEl   = document.getElementById("dec-fotos-json");
  const fotos = jEl ? JSON.parse(jEl.value || "[]") : [];
  if (fotos.length >= 6) { notif("Máximo de 6 fotos atingido!", true); fecharCameraKit(); return; }
  fotos.push(b64);
  if (jEl) jEl.value = JSON.stringify(fotos);
  const cf = document.getElementById("dec-foto"); if (cf && fotos.length === 1) cf.value = b64;
  if (typeof renderDecFotosGrid === "function") renderDecFotosGrid(fotos);

  fecharCameraKit();
  notif("Foto capturada! ✓");
};
