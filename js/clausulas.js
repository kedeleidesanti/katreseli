/**
 * clausulas.js — Gerenciamento de cláusulas dos contratos.
 * Cláusulas de aluguel e montagem, com editor rico, reordenação e preview.
 */
import { db, doc, setDoc, getDoc } from "./firebase.js";
import { el, notif }               from "./helpers.js";
import { cfg, setClausulas }        from "./state.js";
import { closeModal, openModal }   from "./navigation.js";

// ─── Estado interno ───────────────────────────────────────────────────────────
let _tipoAtivo   = "aluguel"; // "aluguel" | "montagem"
let _editIndex   = -1;        // -1 = nova, >= 0 = editando

function getlista() {
  return _tipoAtivo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
}

// ─── Renderizar lista de cláusulas ────────────────────────────────────────────
export function renderClausulas(tipo) {
  tipo = tipo || _tipoAtivo;
  const lista = tipo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
  const divId = tipo === "aluguel" ? "clausulas-aluguel-lista" : "clausulas-mont-lista";
  const div   = el(divId); if (!div) return;

  if (!lista.length) {
    div.innerHTML = `
      <div style="text-align:center;padding:24px;border:1.5px dashed var(--bdr2);border-radius:12px;color:var(--txt3);margin-bottom:12px">
        <i class="ti ti-file-text" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>
        Nenhuma cláusula cadastrada.<br>
        <span style="font-size:12px">Clique em <strong>Nova cláusula</strong> para adicionar.</span>
      </div>`;
    return;
  }

  div.innerHTML = lista.map((c, i) => `
    <div class="clausula-card ${c.ativa !== false ? "" : "clausula-off"}" data-i="${i}">
      <div class="clausula-card-left">
        <label class="cl-toggle" title="${c.ativa !== false ? "Ativa (clique para desativar)" : "Inativa (clique para ativar)"}">
          <input type="checkbox" ${c.ativa !== false ? "checked" : ""}
            onchange="toggleClausula('${tipo}',${i},this.checked)">
          <span class="cl-toggle-sl"></span>
        </label>
        <div class="clausula-card-info">
          <div class="clausula-card-num">${i + 1}</div>
          <div>
            ${c.titulo ? `<div class="clausula-card-titulo">${c.titulo}</div>` : ""}
            <div class="clausula-card-prev">${_stripHtml(c.texto).slice(0, 120)}${_stripHtml(c.texto).length > 120 ? "…" : ""}</div>
          </div>
        </div>
      </div>
      <div class="clausula-card-acts">
        <button class="qbtn" title="Mover para cima" onclick="moverClausula('${tipo}',${i},-1)" ${i === 0 ? "disabled" : ""}>
          <i class="ti ti-chevron-up"></i>
        </button>
        <button class="qbtn" title="Mover para baixo" onclick="moverClausula('${tipo}',${i},1)" ${i === lista.length - 1 ? "disabled" : ""}>
          <i class="ti ti-chevron-down"></i>
        </button>
        <button class="btn btn-s btn-xs" onclick="editarClausula('${tipo}',${i})">
          <i class="ti ti-edit"></i> Editar
        </button>
        <button class="btn btn-d btn-xs" onclick="removerClausula('${tipo}',${i})">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`
  ).join("");
}
window.renderClausulas = renderClausulas;

// ─── Abrir modal — nova cláusula ──────────────────────────────────────────────
window.abrirNovaClausula = function (tipo) {
  _tipoAtivo = tipo;
  _editIndex = -1;
  if (el("nova-cl-titulo-modal")) el("nova-cl-titulo-modal").textContent = "Nova cláusula";
  if (el("nova-titulo-cl"))       el("nova-titulo-cl").value = "";
  if (el("editor-cl"))            el("editor-cl").innerHTML  = "";
  openModal("modal-nova-cl");
  setTimeout(() => el("editor-cl")?.focus(), 100);
};

// ─── Abrir modal — editar cláusula ────────────────────────────────────────────
window.editarClausula = function (tipo, i) {
  const lista = tipo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
  const cl = lista[i]; if (!cl) return;
  _tipoAtivo = tipo;
  _editIndex = i;
  if (el("nova-cl-titulo-modal")) el("nova-cl-titulo-modal").textContent = "Editar cláusula";
  if (el("nova-titulo-cl"))       el("nova-titulo-cl").value = cl.titulo || "";
  if (el("editor-cl"))            el("editor-cl").innerHTML  = cl.texto  || "";
  openModal("modal-nova-cl");
};

// ─── Salvar cláusula (nova ou editada) ────────────────────────────────────────
window.confirmarNovaClausula = async function () {
  const titulo = (el("nova-titulo-cl")?.value || "").trim();
  const texto  = (el("editor-cl")?.innerHTML  || "").trim();
  if (!texto || texto === "<br>") { notif("Escreva o texto da cláusula!", true); return; }

  const lista = getlista();
  const nova  = { id: Date.now(), titulo, texto, ativa: true };

  if (_editIndex >= 0) lista[_editIndex] = nova;
  else                 lista.push(nova);

  renderClausulas(_tipoAtivo);
  await _salvarClausulas();
  closeModal("modal-nova-cl");
  notif(_editIndex >= 0 ? "Cláusula atualizada!" : "Cláusula adicionada!");
};

// ─── Toggle ativo/inativo ─────────────────────────────────────────────────────
window.toggleClausula = async function (tipo, i, ativa) {
  const lista = tipo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
  if (lista[i]) lista[i].ativa = ativa;
  renderClausulas(tipo);
  await _salvarClausulas();
};

// ─── Remover ──────────────────────────────────────────────────────────────────
window.removerClausula = async function (tipo, i) {
  if (!await window.confirmar({ titulo:"Remover cláusula", msg:"Deseja remover esta cláusula do contrato?", tipo:"danger", labelOk:"Remover" })) return;
  const lista = tipo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
  lista.splice(i, 1);
  renderClausulas(tipo);
  await _salvarClausulas();
  notif("Removida.");
};

// ─── Mover (reordenar) ────────────────────────────────────────────────────────
window.moverClausula = async function (tipo, i, dir) {
  const lista = tipo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
  const j = i + dir;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  renderClausulas(tipo);
  await _salvarClausulas();
};

// ─── Importar arquivo (txt/html/docx via mammoth) ─────────────────────────────
window.importarArquivoClausula = function (tipo, input) {
  const file = input.files[0]; if (!file) return;
  const ext  = file.name.split(".").pop().toLowerCase();
  _tipoAtivo = tipo;
  _editIndex = -1;

  if (ext === "docx") {
    if (typeof mammoth === "undefined") { notif("Biblioteca mammoth nao carregada!", true); return; }
    const reader = new FileReader();
    reader.onload = e => {
      mammoth.convertToHtml({ arrayBuffer: e.target.result }).then(r => {
        _abrirEditorComTexto(r.value, file.name);
      }).catch(() => notif("Erro ao ler .docx", true));
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => {
      const txt = ext === "html" || ext === "htm"
        ? e.target.result
        : e.target.result.replace(/\n/g, "<br>");
      _abrirEditorComTexto(txt, file.name);
    };
    reader.readAsText(file, "UTF-8");
  }
  input.value = "";
};

function _abrirEditorComTexto(html, nomeArq) {
  if (el("nova-cl-titulo-modal")) el("nova-cl-titulo-modal").textContent = "Importar cláusula";
  if (el("nova-titulo-cl"))       el("nova-titulo-cl").value = nomeArq.replace(/\.[^.]+$/, "");
  if (el("editor-cl"))            el("editor-cl").innerHTML  = html;
  openModal("modal-nova-cl");
}

// Upload dentro do editor
window.uploadParaEditor = function (input) {
  const file = input.files[0]; if (!file) return;
  const ext  = file.name.split(".").pop().toLowerCase();
  if (ext === "docx") {
    if (typeof mammoth === "undefined") { notif("Biblioteca nao carregada", true); return; }
    const r = new FileReader();
    r.onload = e => mammoth.convertToHtml({ arrayBuffer: e.target.result }).then(res => {
      if (el("editor-cl")) el("editor-cl").innerHTML = res.value;
    });
    r.readAsArrayBuffer(file);
  } else {
    const r = new FileReader();
    r.onload = e => {
      const txt = ext === "html" || ext === "htm"
        ? e.target.result
        : e.target.result.replace(/\n/g, "<br>");
      if (el("editor-cl")) el("editor-cl").innerHTML = txt;
    };
    r.readAsText(file, "UTF-8");
  }
  input.value = "";
};

// ─── Editor rich text ─────────────────────────────────────────────────────────
window.edCmd = function (cmd) {
  el("editor-cl")?.focus();
  document.execCommand(cmd, false, null);
};
window.edSize = function (v) {
  el("editor-cl")?.focus();
  document.execCommand("fontSize", false, v);
};

// ─── Preview do editor atual ──────────────────────────────────────────────────
window.previewEditorAtual = function () {
  const html = el("editor-cl")?.innerHTML || "";
  _abrirPreview("Prévia da cláusula", html);
};

// ─── Preview do contrato completo ─────────────────────────────────────────────
window.previewContrato = function (tipo) {
  const lista   = tipo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
  const ativas  = lista.filter(c => c.ativa !== false);
  if (!ativas.length) { notif("Nenhuma cláusula ativa para visualizar.", true); return; }
  const html = ativas.map((c, i) =>
    `<div style="margin-bottom:16px;padding:12px 16px;background:#fdf8fb;border-radius:8px;border-left:3px solid #d4307a50">
      <strong style="color:#d4307a">${i + 1}. ${c.titulo || "Cláusula " + (i + 1)}</strong>
      <div style="margin-top:6px;font-size:13px;line-height:1.7">${c.texto}</div>
    </div>`
  ).join("");
  _abrirPreview(`Contrato — ${tipo === "aluguel" ? "Aluguel" : "Aluguel + Montagem"}`, html);
};

function _abrirPreview(titulo, html) {
  const ct = el("preview-cl-titulo"); if (ct) ct.textContent = titulo;
  const cb = el("preview-cl-body");
  if (cb) cb.innerHTML = html || '<p style="color:var(--txt3)">Sem conteúdo.</p>';
  openModal("modal-preview-cl");
}

// ─── Carregar cláusulas do Firestore ──────────────────────────────────────────
export async function loadClausulas() {
  try {
    const d = await getDoc(doc(db, "config", "clausulas"));
    if (d.exists()) {
      const data = d.data();
      setClausulas("aluguel",  data.aluguel  || []);
      setClausulas("montagem", data.montagem || []);
    }
  } catch (_) {}
  renderClausulas("aluguel");
  renderClausulas("montagem");
}

// ─── Salvar no Firestore ──────────────────────────────────────────────────────
async function _salvarClausulas() {
  try {
    await setDoc(doc(db, "config", "clausulas"), {
      aluguel:  cfg.clausulasAluguel.map(c => ({ ...c })),
      montagem: cfg.clausulasMont.map(c => ({ ...c }))
    });
  } catch (e) {
    notif("Erro ao salvar: " + e.message, true);
  }
}

// ─── Helper: strip HTML tags ──────────────────────────────────────────────────
function _stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return tmp.textContent || tmp.innerText || "";
}
