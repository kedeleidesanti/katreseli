import { db, doc, addDoc, updateDoc, deleteDoc, collection, getDoc, setDoc, serverTimestamp }
  from "./firebase.js";
import { el, gv, sv, notif, fmtR, esc, comprimirImagem } from "./helpers.js";
import { itens, categorias, filtros, setCategorias } from "./state.js";
import { closeModal }               from "./navigation.js";

// ─── Limpar formulário ────────────────────────────────────────────────────────
let compostoItens = []; // subitens do item composto

export function limparItem() {
  ["item-id","item-nome","item-custo","item-aluguel","item-lucro","item-tags","item-obs"]
    .forEach(id => sv(id, ""));
  sv("item-pct",    "30");
  sv("item-qtd",    "1");
  sv("item-estado", "Otimo");
  sv("item-foto", "");
  if (categorias.length) sv("item-cat", categorias[0]);
  const titulo = el("item-titulo"); if (titulo) titulo.textContent = "Cadastrar item";
  const fp = document.getElementById("item-foto-prev"); if (fp) fp.innerHTML = "📦";
  const fi = document.getElementById("item-foto-file"); if (fi) fi.value = "";
  // Reset composto
  compostoItens = [];
  const chk = el("item-composto-chk"); if (chk) chk.checked = false;
  const form = el("item-composto-form"); if (form) form.style.display = "none";
  const lista = el("item-comp-lista"); if (lista) lista.innerHTML = "";
  sv("item-comp-desc", "0");
  sv("item-comp-preco-cheio", "");
  const pfReset = el("item-comp-preco-final"); if (pfReset) pfReset.textContent = "R$ 0,00";
}
window.limparItem = limparItem;

// ─── Cálculos automáticos ─────────────────────────────────────────────────────
window.calcItem = function () {
  const c = parseFloat(gv("item-custo")) || 0;
  const p = parseFloat(gv("item-pct"))   || 0;
  const a = c * (p / 100);
  sv("item-aluguel", a > 0 ? a.toFixed(2) : "");
  el("item-lucro").value = a > 0 ? fmtR(a) : "";
};

window.calcItemInv = function () {
  const c = parseFloat(gv("item-custo"))   || 0;
  const a = parseFloat(gv("item-aluguel")) || 0;
  if (c > 0 && a > 0) sv("item-pct", ((a / c) * 100).toFixed(0));
  el("item-lucro").value = a > 0 ? fmtR(a) : "";
};

// ─── Salvar (criar ou atualizar) ──────────────────────────────────────────────
window.salvarItem = async function () {
  const nome = gv("item-nome");
  if (!nome) { notif("Informe o nome!", true); return; }

  const aluguel = parseFloat(gv("item-aluguel")) || 0;
  const dados = {
    nome,
    categoria:    gv("item-cat")    || categorias[0],
    estado:       gv("item-estado") || "Otimo",
    custo:        parseFloat(gv("item-custo")) || 0,
    pct:          parseFloat(gv("item-pct"))   || 30,
    aluguel,
    lucro:        aluguel,
    qtd:          parseInt(gv("item-qtd")) || 1,
    tags:         gv("item-tags") ? gv("item-tags").split(",").map(t => t.trim()).filter(Boolean) : [],
    obs:          gv("item-obs"),
    foto:         gv("item-foto") || "",
    composto:     compostoItens.length > 0,
    subitens:     compostoItens.length > 0 ? JSON.parse(JSON.stringify(compostoItens)) : [],
    descCombo:    compostoItens.length > 0 ? (parseFloat(gv("item-comp-desc")) || 0) : 0,
    atualizadoEm: serverTimestamp()
  };

  const id = gv("item-id");
  try {
    if (id) {
      await updateDoc(doc(db, "itens", id), dados);
      notif("Atualizado!");
    } else {
      dados.criadoEm = serverTimestamp();
      await addDoc(collection(db, "itens"), dados);
      notif("Cadastrado!");
    }
    closeModal("modal-item");
    limparItem();
    // Recalcular itens compostos que contêm este item como subitem
    await recalcularCompostos(id || null, dados.aluguel, dados.custo);
  } catch (e) {
    notif("Erro: " + e.message, true);
  }
};

// ─── Recalcular compostos que contêm um subitem atualizado ───────────────────
async function recalcularCompostos(itemId, novoAluguel, novoCusto) {
  if (!itemId) return;
  const compostos = itens.filter(i =>
    i.composto && (i.subitens || []).some(s => s.id === itemId)
  );
  if (!compostos.length) return;

  for (const comp of compostos) {
    const subAtualizados = (comp.subitens || []).map(s =>
      s.id === itemId ? { ...s, aluguel: novoAluguel } : s
    );
    const soma  = subAtualizados.reduce((a, s) => a + (s.aluguel || 0) * s.qtd, 0);
    const final = soma * (1 - (comp.descCombo || 0) / 100);
    const custoNovo = subAtualizados.reduce((a, s) => {
      const it = itens.find(x => x.id === s.id);
      return a + (s.id === itemId ? novoCusto : (it?.custo || 0)) * s.qtd;
    }, 0);

    try {
      await updateDoc(doc(db, "itens", comp.id), {
        subitens: subAtualizados,
        aluguel:  final,
        lucro:    final,
        custo:    custoNovo,
        atualizadoEm: serverTimestamp()
      });
    } catch(e) { console.warn("Erro ao recalcular composto", comp.nome, e); }
  }
  if (compostos.length) notif(`${compostos.length} kit(s) composto(s) atualizado(s) automaticamente`);
}

// ─── Editar ───────────────────────────────────────────────────────────────────
window.editItem = function (id) {
  const i = itens.find(x => x.id === id);
  if (!i) return;

  limparItem();
  sv("item-id",     id);
  sv("item-nome",   i.nome      || "");
  sv("item-cat",    i.categoria || categorias[0]);
  sv("item-estado", i.estado    || "Otimo");
  sv("item-custo",  i.custo     || "");
  sv("item-pct",    i.pct       || 30);
  sv("item-aluguel",i.aluguel   || "");
  el("item-lucro").value = i.aluguel ? fmtR(i.aluguel) : "";
  sv("item-qtd",    i.qtd       || 1);
  sv("item-tags",   Array.isArray(i.tags) ? i.tags.join(", ") : (i.tags || ""));
  sv("item-obs",    i.obs       || "");
  sv("item-foto",   i.foto      || "");
  // Carregar subitens se item composto
  compostoItens = i.subitens ? JSON.parse(JSON.stringify(i.subitens)) : [];
  const chkE  = el("item-composto-chk");
  const formE = el("item-composto-form");
  if (chkE)  chkE.checked = i.composto || false;
  if (formE) formE.style.display = i.composto ? "" : "none";
  if (i.composto) { sv("item-comp-desc", i.descCombo || 0); renderCompostoLista(); calcItemComposto(); popularSelectComposto(); }
  const fp2 = document.getElementById("item-foto-prev");
  if (fp2) fp2.innerHTML = i.foto ? `<img src="${i.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : "📦";

  const titulo = el("item-titulo"); if (titulo) titulo.textContent = "Editar item";
  // Abre modal diretamente (sem limparItem novamente)
  const modal = el("modal-item"); if (modal) modal.classList.add("on");
};

// ─── Excluir ──────────────────────────────────────────────────────────────────
window.delItem = async function (id, nome) {
  if (!await window.confirmar({ titulo:"Excluir item", msg:`Tem certeza que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`, tipo:"danger", labelOk:"Excluir" })) return;
  deleteDoc(doc(db, "itens", id))
    .then(() => notif("Removido."))
    .catch(e => notif("Erro: " + e.message, true));
};

// ─── Renderizar tabela de itens ───────────────────────────────────────────────
window.renderItens = function () {
  const q  = (gv("q-item") || "").toLowerCase();
  const fc = filtros.item;
  const rows = itens
    .filter(i =>
      (!q  || (i.nome || "").toLowerCase().includes(q) || (Array.isArray(i.tags) ? i.tags.join(",") : (i.tags || "")).toLowerCase().includes(q)) &&
      (!fc || i.categoria === fc)
    )
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  el("si-tot").textContent = itens.length;
  el("si-dp").textContent  = itens.filter(i => !(i.estado || "").toLowerCase().includes("manut")).length;
  el("si-mn").textContent  = itens.filter(i => (i.estado || "").toLowerCase().includes("manut")).length;

  const vm = itens.length ? itens.reduce((a, b) => a + (parseFloat(b.aluguel) || 0), 0) / itens.length : 0;
  el("si-vm").textContent = "R$" + Math.round(vm);
  el("bdg-it").textContent = itens.length;
  el("cnt-it").textContent = `${rows.length} ${rows.length === 1 ? "item" : "itens"}`;

  const tb = el("tb-item");
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="8"><div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg><p>Nenhum item encontrado</p></div></td></tr>';
    document.getElementById("pag-it") && (document.getElementById("pag-it").innerHTML = "");
    return;
  }

  const badgeE = e => {
    if (!e || e.toLowerCase().includes("otimo") || e === "Otimo") return "bg";
    if (e === "Bom")    return "bg";
    if (e === "Regular") return "bo";
    if (e.toLowerCase().includes("manut")) return "br";
    return "bp";
  };

  // Mobile: renderizar como cards puros em #cards-item
  const isMobile = window.innerWidth < 700;
  const cardsEl = document.getElementById("cards-item");
  const twEl    = document.getElementById("tw-item");

  window.paginar?.("it", rows, slice => {
    const html = slice.map(i => {
      const qtd    = i.qtd || 1;
      const corQtd = qtd <= 1 ? "#ef4444" : qtd <= 3 ? "#eab308" : "var(--p)";
      const clsQtd = qtd <= 1 ? "zero" : qtd <= 3 ? "low" : "";
      const tags   = Array.isArray(i.tags) ? i.tags.join(", ") : (i.tags || "");
      const nomeEsc = (i.nome || "-").replace(/'/g, "\'").replace(/"/g, "&quot;");

      if (isMobile) {
        // ── Card mobile puro (div) ─────────────────────────────────
        return `<div class="item-card-m">
          <div class="item-card-m-top">
            ${i.foto
              ? `<img src="${i.foto}" alt="${nomeEsc}" onclick="this.closest('.item-card-m').querySelector('.item-card-m-nome').click()">`
              : `<div class="item-foto-ph">📦</div>`}
            <div style="flex:1;min-width:0">
              <div class="item-card-m-nome">${esc(i.nome || "-")}${i.composto ? ' <span style="font-size:10px;background:var(--pl);color:var(--p);border-radius:6px;padding:1px 6px;font-weight:700">Composto</span>' : ""}</div>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">
                <span class="badge bp" style="font-size:10px">${i.categoria || "-"}</span>
                <span class="badge ${badgeE(i.estado)}" style="font-size:10px">${i.estado || "Ótimo"}</span>
              </div>
              ${tags ? `<div class="item-card-m-tags">${tags}</div>` : ""}
            </div>
          </div>
          <div class="item-card-m-dados">
            <div class="item-card-m-dado"><label>Custo</label><span>${fmtR(i.custo)}</span></div>
            <div class="item-card-m-dado"><label>Aluguel</label><span style="color:var(--p)">${fmtR(i.aluguel)}</span></div>
            <div class="item-card-m-dado"><label>% Cobrado</label><span>${i.pct || 30}%</span></div>
            <div class="item-card-m-dado"><label>Quantidade</label>
              <div style="display:flex;align-items:center;gap:7px">
                <span style="color:${corQtd}">${qtd}</span>
                <div class="estoque-prog" style="flex:1"><div class="estoque-prog-f ${clsQtd}" style="width:100%"></div></div>
              </div>
            </div>
          </div>
          <div class="item-card-m-acoes">
            <button class="btn btn-s btn-xs" onclick="gerarQRItem('${i.id}')" title="QR Code"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3"/><rect x="16" y="5" width="3" height="3"/><rect x="5" y="16" width="3" height="3"/></svg></button>
            <button class="btn btn-s btn-xs" onclick="abrirManutencao('${i.id}')" title="Manutenção">🔧</button>
            <button class="btn btn-s btn-xs" onclick="editItem('${i.id}')"><i class="ti ti-edit"></i> Editar</button>
            <button class="btn btn-d btn-xs" onclick="delItem('${i.id}','${nomeEsc}')"><i class="ti ti-trash"></i></button>
          </div>
        </div>`;
      }

      // ── Linha de tabela (desktop) ──────────────────────────────────
      return `<tr>
    <td data-label="Item">
      <div style="display:flex;align-items:center;gap:8px">
        ${i.foto ? `<div class="dec-thumb-wrap"><img src="${i.foto}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;cursor:zoom-in"><div class="dec-thumb-hover"><img src="${i.foto}" alt="${nomeEsc}"><span>${i.nome}</span></div></div>` : `<div style="width:36px;height:36px;border-radius:8px;background:var(--pl);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📦</div>`}
        <div>
          <div style="font-weight:500">${esc(i.nome || "-")}${i.composto ? ' <span style="font-size:10px;background:var(--pl);color:var(--p);border-radius:6px;padding:1px 7px;font-weight:700">Composto</span>' : ""}</div>
          ${tags ? `<div style="font-size:11px;color:var(--txt2)">${tags}</div>` : ""}
        </div>
      </div>
    </td>
    <td data-label="Categoria"><span class="badge bp">${i.categoria || "-"}</span></td>
    <td data-label="Custo">${fmtR(i.custo)}</td>
    <td data-label="Aluguel" style="font-weight:600;color:var(--p)">${fmtR(i.aluguel)}</td>
    <td data-label="%">${i.pct || 30}%</td>
    <td data-label="Qtd">
      <div class="estoque-bar">
        <span style="font-weight:700;min-width:14px;color:${corQtd}">${qtd}</span>
        <div class="estoque-prog" title="Estoque: ${qtd}"><div class="estoque-prog-f ${clsQtd}" style="width:100%"></div></div>
      </div>
    </td>
    <td data-label="Estado"><span class="badge ${badgeE(i.estado)}">${i.estado || "Otimo"}</span></td>
    <td><div class="acts">
      <button class="btn btn-s btn-xs" onclick="gerarQRItem('${i.id}')" title="QR Code" style="padding:5px 8px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3"/><rect x="16" y="5" width="3" height="3"/><rect x="5" y="16" width="3" height="3"/></svg></button>
      <button class="btn btn-s btn-xs" onclick="abrirManutencao('${i.id}')" title="Manutenção" style="padding:5px 8px">🔧</button>
      <button class="btn btn-s btn-xs" onclick="editItem('${i.id}')"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn btn-d btn-xs" onclick="delItem('${i.id}','${nomeEsc}')"><i class="ti ti-trash"></i></button>
    </div></td>
  </tr>`;
    }).join("");

    if (isMobile) {
      if (cardsEl) cardsEl.innerHTML = html;
      if (twEl)    twEl.style.display = "none";
    } else {
      tb.innerHTML = html;
      if (cardsEl) cardsEl.innerHTML = "";
      if (twEl)    twEl.style.display = "";
    }
  });
};

// ─── Categorias ───────────────────────────────────────────────────────────────
export async function loadCats() {
  try {
    const d = await getDoc(doc(db, "config", "categorias"));
    if (d.exists() && d.data().lista?.length > 0) setCategorias(d.data().lista);
  } catch (_) {}
  renderSelectCat();
  renderChipsCat();
}

async function saveCats() {
  try { await setDoc(doc(db, "config", "categorias"), { lista: categorias }); } catch (_) {}
}

export function renderSelectCat() {
  const s = el("item-cat"); if (!s) return;
  const cur = s.value;
  s.innerHTML = [...categorias].sort((a,b) => a.localeCompare(b)).map(c => `<option value="${c}">${c}</option>`).join("");
  if (cur && categorias.includes(cur)) s.value = cur;
}

export function renderChipsCat() {
  const bar = el("chip-cat"); if (!bar) return;
  bar.innerHTML =
    `<span class="chip${filtros.item ? "" : " on"}" onclick="setF('item','',this)">Todos</span>` +
    categorias.map(c =>
      `<span class="chip${filtros.item === c ? " on" : ""}" onclick="setF('item','${c}',this)">${c}</span>`
    ).join("");
}

window.salvarCat = async function () {
  const nome = gv("nova-cat"); if (!nome) return;
  const cat  = nome.charAt(0).toUpperCase() + nome.slice(1);
  if (categorias.includes(cat)) { notif("Categoria já existe!", true); return; }
  categorias.push(cat);
  await saveCats();
  renderSelectCat();
  renderChipsCat();
  sv("item-cat", cat);
  closeModal("modal-cat");
  sv("nova-cat", "");
  notif("Categoria criada!");
};

document.addEventListener("DOMContentLoaded", () => {
  el("nova-cat") && el("nova-cat").addEventListener("keydown", e => {
    if (e.key === "Enter") window.salvarCat();
  });
});

// ─── Foto do item ─────────────────────────────────────────────────────────────
window.uploadFotoItem = async function(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 12 * 1024 * 1024) { notif("Foto muito grande! Máx. 12MB.", true); return; }
  try {
    // Comprimida para evitar estourar o limite de 1MB por documento no Firestore
    const b64 = await comprimirImagem(file, { maxDim: 1000, maxBytes: 250 * 1024 });
    const campo = document.getElementById("item-foto"); if (campo) campo.value = b64;
    const prev  = document.getElementById("item-foto-prev");
    if (prev) prev.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
    notif("Foto carregada!");
  } catch (err) {
    notif("Erro ao processar foto: " + err.message, true);
  }
};

window.limparFotoItem = function() {
  const c = document.getElementById("item-foto"); if (c) c.value = "";
  const p = document.getElementById("item-foto-prev"); if (p) p.innerHTML = "📦";
  const i = document.getElementById("item-foto-file"); if (i) i.value = "";
};

// ─── Item composto ────────────────────────────────────────────────────────────
window.toggleItemComposto = function(ativo) {
  const form = el("item-composto-form"); if (!form) return;
  form.style.display = ativo ? "" : "none";
  if (ativo) {
    popularSelectComposto();
    // Scroll suave para o form de composto dentro do modal-b
    setTimeout(() => {
      const mb = form.closest(".modal-b");
      if (mb) mb.scrollTo({ top: mb.scrollHeight, behavior: "smooth" });
      else form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  } else {
    compostoItens = [];
    renderCompostoLista();
  }
};

function popularSelectComposto() {
  const s = el("item-comp-sel"); if (!s) return;
  const cur = gv("item-id"); // id do item sendo editado (não listar ele mesmo)
  const sorted = [...itens]
    .filter(i => i.id !== cur)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  s.innerHTML = '<option value="">Selecionar item...</option>' +
    sorted.map(i => `<option value="${i.id}">${i.nome} — ${fmtR(i.aluguel || 0)}</option>`).join("");
}
window.popularSelectComposto = popularSelectComposto;

window.addItemComposto = function() {
  const id  = gv("item-comp-sel"); if (!id) return;
  const i   = itens.find(x => x.id === id); if (!i) return;
  const qtd = parseInt(el("item-comp-qtd")?.value) || 1;
  const ex  = compostoItens.find(x => x.id === id);
  if (ex) ex.qtd += qtd;
  else compostoItens.push({ id, nome: i.nome, aluguel: i.aluguel || 0, qtd });
  renderCompostoLista();
  calcItemComposto();
  sv("item-comp-sel", "");
};

function renderCompostoLista() {
  const div = el("item-comp-lista"); if (!div) return;
  if (!compostoItens.length) {
    div.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:4px 0">Nenhum subitem adicionado</div>';
    return;
  }
  div.innerHTML = compostoItens.map((it, i) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bdr);font-size:12px">
      <span style="flex:1;font-weight:500">${it.nome}</span>
      <button class="qbtn" onclick="qComp(${i},-1)">−</button>
      <span style="min-width:20px;text-align:center;font-weight:700">${it.qtd}</span>
      <button class="qbtn" onclick="qComp(${i},1)">+</button>
      <span style="color:var(--p);min-width:60px;text-align:right;font-weight:600">${fmtR((it.aluguel||0)*it.qtd)}</span>
      <button class="qbtn" style="color:#991b1b" onclick="rComp(${i})">×</button>
    </div>`
  ).join("");
}

window.qComp = (i, d) => { compostoItens[i].qtd = Math.max(1, compostoItens[i].qtd + d); renderCompostoLista(); calcItemComposto(); };
window.rComp = (i)    => { compostoItens.splice(i, 1); renderCompostoLista(); calcItemComposto(); };

window.calcItemComposto = function() {
  const soma = compostoItens.reduce((a, b) => a + (b.aluguel || 0) * b.qtd, 0);
  const desc = parseFloat(gv("item-comp-desc")) || 0;
  const final = soma * (1 - desc / 100);
  const cfEl = el("item-comp-preco-cheio");
  if (cfEl) cfEl.value = fmtR(soma);
  const pfEl = el("item-comp-preco-final");
  if (pfEl) pfEl.textContent = fmtR(final);
  // Atualizar campos de aluguel e custo com o valor do combo
  if (soma > 0) {
    sv("item-aluguel", final.toFixed(2));
    const lucroEl = el("item-lucro"); if (lucroEl) lucroEl.value = fmtR(final);
    const custo = itens.filter(it => compostoItens.find(c => c.id === it.id))
      .reduce((a, it) => { const c = compostoItens.find(x => x.id === it.id); return a + (it.custo || 0) * (c?.qtd || 1); }, 0);
    sv("item-custo", custo.toFixed(2));
  }
};

// ─── Câmera ao vivo para foto do item ────────────────────────────────────────
let _cameraStream = null;
let _cameraFacingMode = "environment"; // câmera traseira por padrão

window.abrirCameraItem = async function() {
  const modal = document.getElementById("modal-camera-item");
  const video = document.getElementById("camera-item-video");
  if (!modal || !video) return;

  // Verificar suporte
  if (!navigator.mediaDevices?.getUserMedia) {
    // Fallback: abrir seletor de arquivo com capture
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment";
    inp.onchange = () => uploadFotoItem(inp);
    inp.click();
    return;
  }

  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: _cameraFacingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = _cameraStream;
    modal.style.display = "flex";
    modal.style.flexDirection = "column";
  } catch(e) {
    // Sem permissão ou câmera indisponível — fallback para arquivo
    notif("Câmera indisponível. Selecione uma foto.", true);
    document.getElementById("item-foto-file")?.click();
  }
};

window.fecharCameraItem = function() {
  if (_cameraStream) { _cameraStream.getTracks().forEach(t => t.stop()); _cameraStream = null; }
  const modal = document.getElementById("modal-camera-item");
  if (modal) modal.style.display = "none";
};

window.alternarCameraItem = async function() {
  _cameraFacingMode = _cameraFacingMode === "environment" ? "user" : "environment";
  fecharCameraItem();
  await abrirCameraItem();
};

window.capturarFotoItem = function() {
  const video  = document.getElementById("camera-item-video");
  const canvas = document.getElementById("camera-item-canvas");
  if (!video || !canvas) return;

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  // Comprimir para JPEG (qualidade 85%) — evita base64 enorme
  const b64 = canvas.toDataURL("image/jpeg", 0.85);

  // Inserir no campo e preview — mesmo fluxo do uploadFotoItem
  const campo = document.getElementById("item-foto"); if (campo) campo.value = b64;
  const prev  = document.getElementById("item-foto-prev");
  if (prev) prev.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;

  fecharCameraItem();
  notif("Foto capturada! ✓");
};
