import { db, doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, setDoc, getDocs, query, where }
  from "./firebase.js";
import { el, gv, sv, notif, fmtR, esc } from "./helpers.js";
import { clientes, locacoes }       from "./state.js";
import { badgeFidelidade }          from "./clientes-extra.js";
import { closeModal }               from "./navigation.js";

// ─── Limpar formulário ────────────────────────────────────────────────────────
export function limparCli() {
  ["cli-id","cli-nome","cli-cpf","cli-tel","cli-email","cli-obs",
   "cli-nasc","cli-cep","cli-rua","cli-num","cli-comp",
   "cli-bairro","cli-cidade","cli-uf","cli-end",
   "cli-comp-base64","cli-comp-tipo"].forEach(id => sv(id, ""));
  sv("cli-origem", "Instagram");
  const titulo = el("cli-titulo"); if (titulo) titulo.textContent = "Novo cliente";
  // Reset preview
  const imgWrap = el("comp-img-wrap"); if (imgWrap) imgWrap.style.display = "none";
  const pdfWrap = el("comp-pdf-wrap"); if (pdfWrap) pdfWrap.style.display = "none";
  const upArea  = el("comp-upload-area"); if (upArea) upArea.style.display = "";
}
window.limparCli = limparCli;

// ─── Salvar (criar ou atualizar) ──────────────────────────────────────────────
window.salvarCli = async function () {
  const nome = gv("cli-nome"), cpf = gv("cli-cpf");
  if (!nome || !cpf) { notif("Nome e CPF obrigatorios!", true); return; }

  const r = gv("cli-rua"), n = gv("cli-num"), b = gv("cli-bairro"),
        c2 = gv("cli-cidade"), u = gv("cli-uf"), z = gv("cli-cep");
  sv("cli-end", [r + (n ? " " + n : ""), b, c2 + (u ? "/" + u : ""), z]
    .filter(Boolean).join(", ") || gv("cli-end"));

  const compBase64 = gv("cli-comp-base64");
  const compTipo   = gv("cli-comp-tipo");

  const dados = {
    nome, cpf,
    tel:    gv("cli-tel"),
    email:  gv("cli-email"),
    obs:    gv("cli-obs"),
    nasc:   gv("cli-nasc"),
    origem: gv("cli-origem"),
    cep:    gv("cli-cep"),  rua:    gv("cli-rua"),
    num:    gv("cli-num"),  comp:   gv("cli-comp"),
    bairro: gv("cli-bairro"), cidade: gv("cli-cidade"),
    uf:     gv("cli-uf"),  end:    gv("cli-end"),
    temComprovante: !!(compBase64 || gv("cli-id")), comprovanteTipo: compTipo || "",
    atualizadoEm: serverTimestamp()
  };
  if (compBase64) {
    dados.comprovante    = compBase64;
    dados.comprovanteTipo = compTipo || "img";
    dados.temComprovante  = true;
  }

  const id = gv("cli-id");
  try {
    if (id) {
      await updateDoc(doc(db, "clientes", id), dados);
      notif("Cliente atualizado!");
    } else {
      dados.criadoEm = serverTimestamp();
      await addDoc(collection(db, "clientes"), dados);
      notif("Cliente cadastrado!");
    }

    // Sincronizar clientes_portal pelo e-mail (para aparecer na área do cliente)
    if (dados.email) {
      try {
        const qPortal = query(collection(db,"usuarios"), where("email","==",dados.email));
        const snapPortal = await getDocs(qPortal);
        if (!snapPortal.empty) {
          const uid = snapPortal.docs[0].id;
          const perfilRef = doc(db,"clientes_portal", uid);
          const sincDados = {};
          const campos = {nome:"nome",cpf:"cpf",tel:"tel",nasc:"nasc",cep:"cep",rua:"rua",num:"num",bairro:"bairro",cidade:"cidade",uf:"uf",comp:"comp"};
          for (const [k] of Object.entries(campos)) { if (dados[k]) sincDados[k] = dados[k]; }
          sincDados.email = dados.email;
          sincDados.atualizadoEm = serverTimestamp();
          await setDoc(perfilRef, sincDados, { merge: true });
        }
      } catch(_) {}
    }

    closeModal("modal-cli");
  } catch (e) {
    notif("Erro ao salvar: " + e.message, true);
  }
};

// ─── Editar ───────────────────────────────────────────────────────────────────
window.editCli = function (id) {
  const c = clientes.find(x => x.id === id);
  if (!c) { notif("Cliente não encontrado", true); return; }

  limparCli();
  sv("cli-id",     id);          sv("cli-nome",   c.nome   || "");
  sv("cli-cpf",    c.cpf   || ""); sv("cli-tel",    c.tel    || "");
  sv("cli-email",  c.email || ""); sv("cli-obs",    c.obs    || "");
  sv("cli-nasc",   c.nasc  || ""); sv("cli-origem", c.origem || "Instagram");
  sv("cli-cep",    c.cep   || ""); sv("cli-rua",    c.rua    || "");
  sv("cli-num",    c.num   || ""); sv("cli-comp",   c.comp   || "");
  sv("cli-bairro", c.bairro|| ""); sv("cli-cidade", c.cidade || "");
  sv("cli-uf",     c.uf    || "");
  sv("cli-end",    c.end   || [c.rua, c.bairro, c.cidade].filter(Boolean).join(", ") || "");

  const titulo = el("cli-titulo"); if (titulo) titulo.textContent = "Editar cliente";
  const modal  = el("modal-cli");  if (modal)  modal.classList.add("on");
};

// ─── Excluir ──────────────────────────────────────────────────────────────────
window.delCli = async function (id) {
  if (!await window.confirmar({ titulo:"Remover cliente", msg:`Deseja remover o cliente? Os dados serão excluídos permanentemente.`, tipo:"danger", labelOk:"Remover" })) return;
  deleteDoc(doc(db, "clientes", id))
    .then(() => notif("Cliente removido!"))
    .catch(e => notif("Erro: " + e.message, true));
};

// ─── Comprovante ──────────────────────────────────────────────────────────────
window.verComprovanteCliente = async function (id) {
  // 1. Try localStorage first (uploaded via solicitar.html)
  let b64  = localStorage.getItem("comp_" + id) || "";
  let tipo = localStorage.getItem("comp_tipo_" + id) || "img";

  // 2. If not in localStorage, try Firestore (uploaded via cliente.html)
  if (!b64) {
    try {
      const cli = clientes.find(c => c.id === id);
      if (cli?.comprovante) {
        b64 = cli.comprovante;
        tipo = cli.comprovanteTipo || "img";
      } else if (cli?.email) {
        // Try clientes_portal by email
        const { getDocs, query: q2, where, collection: col } =
          await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const { db: dbRef } = await import("./firebase.js");
        const snap = await getDocs(q2(col(dbRef, "clientes_portal"), where("email","==",cli.email)));
        if (!snap.empty) {
          const d = snap.docs[0].data();
          b64 = d.comprovante || "";
          tipo = d.comprovanteTipo || "img";
        }
      }
    } catch(_) {}
  }

  if (!b64) { notif("Comprovante não encontrado.", true); return; }

  const w = window.open("", "_blank");
  if (!w) { notif("Ative pop-ups para visualizar", true); return; }

  if (tipo === "application/pdf" || tipo === "pdf") {
    w.document.write("<html><body style='margin:0'><iframe src='" + b64 + "' style='width:100vw;height:100vh;border:none'></iframe><" + "/body><" + "/html>");
  } else {
    w.document.write("<html><body style='margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh'><img src='" + b64 + "' style='max-width:100%;max-height:100vh'><" + "/body><" + "/html>");
  }
  w.document.close();
};

// ─── Renderizar tabela de clientes ────────────────────────────────────────────
window.renderClis = function () {
  const q    = (el("q-cli") || { value: "" }).value.trim().toLowerCase();
  const rows = clientes.filter(c =>
    !q || c.nome.toLowerCase().includes(q) ||
    (c.cpf || "").includes(q) || (c.tel || "").includes(q)
  );

  const cnt = el("cnt-cli"); if (cnt) cnt.textContent = rows.length;
  const tb  = el("tb-cli");  if (!tb)  return;

  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><i class="ti ti-users"></i><p>Nenhum cliente</p></div></td></tr>';
    document.getElementById("pag-cli") && (document.getElementById("pag-cli").innerHTML = "");
    return;
  }

  const isMob = window.innerWidth < 700;
  const twEl    = document.getElementById("tw-cli");
  const cardsEl = document.getElementById("cards-cli");
  if (twEl)    twEl.style.display    = isMob ? "none" : "";
  if (cardsEl) cardsEl.style.display = isMob ? "block" : "none";

  window.paginar?.("cli", rows, slice => {
    const html = slice.map(c => {
      const cLocs   = locacoes.filter(l => l.clienteId === c.id);
      const locs    = cLocs.length;
      const total   = cLocs.reduce((a, b) => a + (b.total || 0), 0);
      const tel     = (c.tel || "").replace(/\D/g, "");
      const waHref  = tel ? (isMob ? `whatsapp://send?phone=55${tel}` : `https://wa.me/55${tel}`) : "#";
      const telHref = tel ? `tel:+55${tel}` : "#";
      const clip    = (c.temComprovante || c.comprovante || localStorage.getItem("comp_" + c.id))
        ? `<button class="btn btn-b btn-xs" data-id="${c.id}" onclick="verComprovanteCliente(this.dataset.id)" title="Ver comprovante"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>`
        : "";
      const vipBadge = locs >= 5
        ? `<span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:5px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;flex-shrink:0">⭐ VIP</span>`
        : "";
      return `<tr>
      <td data-label="Nome"><div style="font-weight:500;display:flex;align-items:center;gap:6px">${esc(c.nome)}${badgeFidelidade(locs)}${vipBadge}${c.cadastroOnline ? `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;flex-shrink:0">🌐 Online</span>` : ""}</div><div style="font-size:10px;color:var(--txt2)">${c.origem || ""}</div></td>
      <td data-label="CPF" style="font-size:12px">${c.cpf || ""}</td>
      <td data-label="WhatsApp"><div style="display:flex;align-items:center;gap:6px">
        <a href="${waHref}" style="color:#16a34a;text-decoration:none;font-size:12px;display:flex;align-items:center;gap:3px" title="WhatsApp"><i class="ti ti-brand-whatsapp" style="font-size:14px"></i>${c.tel || "-"}</a>
        ${tel ? `<a href="${telHref}" style="color:var(--txt3);font-size:11px" title="Ligar"><i class="ti ti-phone" style="font-size:13px"></i></a>` : ""}
      </div></td>
      <td data-label="Email" style="font-size:12px">${c.email || "-"}</td>
      <td data-label="Locações">
        <span class="badge bb">${locs}</span>
        ${total > 0 ? `<div style="font-size:10px;color:var(--p);font-weight:600;margin-top:2px">${fmtR(total)}</div>` : ""}
      </td>
      <td><div class="acts">
        ${clip}
        <button class="btn btn-b btn-xs" data-id="${c.id}" onclick="verHistoricoCliente(this.dataset.id)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Histórico
        </button>
        <button class="btn btn-s btn-xs" data-id="${c.id}" onclick="verFichaCli(this.dataset.id)" style="background:var(--pl);color:var(--pd);border-color:var(--p)40"><i class="ti ti-user"></i> Ficha</button>
        <button class="btn btn-s btn-xs" data-id="${c.id}" onclick="editCli(this.dataset.id)"><i class="ti ti-edit"></i> Editar</button>
        <button class="btn btn-d btn-xs" data-id="${c.id}" onclick="delCli(this.dataset.id)"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
    }).join("");

    if (isMob && cardsEl) {
      cardsEl.innerHTML = slice.map(c => {
        const cLocs = locacoes.filter(l => l.clienteId === c.id);
        const locs  = cLocs.length;
        const total = cLocs.reduce((a,b) => a+(b.total||0),0);
        const tel   = (c.tel||"").replace(/\D/g,"");
        const waHref = tel ? (window.innerWidth<700 ? `whatsapp://send?phone=55${tel}` : `https://wa.me/55${tel}`) : "#";
        const telHref = tel ? `tel:+55${tel}` : "#";
        const inic  = (c.nome||"?").split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
        const vip   = locs>=5 ? `<span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:5px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a">⭐ VIP</span>` : "";
        return `<div class="cli-card-m">
          <div class="cli-card-m-top">
            <div style="width:44px;height:44px;border-radius:50%;background:var(--pl);color:var(--pd);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${inic}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:700;color:var(--txt);display:flex;align-items:center;gap:5px;flex-wrap:wrap">${esc(c.nome)}${vip}</div>
              <div style="font-size:11px;color:var(--txt3);margin-top:2px">${c.origem||""} ${c.cadastroOnline?'<span style="color:#1d4ed8">🌐 Online</span>':""}</div>
            </div>
          </div>
          <div class="cli-card-m-dados">
            <div class="cli-card-m-dado"><label>CPF/CNPJ</label><span style="font-size:12px">${c.cpf||"—"}</span></div>
            <div class="cli-card-m-dado"><label>Locações</label><span style="color:var(--p)">${locs}${total>0?` · ${fmtR(total)}`:""}</span></div>
            <div class="cli-card-m-dado" style="grid-column:1/-1"><label>WhatsApp</label>
              <div style="display:flex;align-items:center;gap:8px">
                <a href="${waHref}" style="color:#16a34a;text-decoration:none;font-size:13px;font-weight:600;display:flex;align-items:center;gap:4px"><i class="ti ti-brand-whatsapp"></i>${c.tel||"—"}</a>
                ${tel?`<a href="${telHref}" style="color:var(--txt3)"><i class="ti ti-phone" style="font-size:15px"></i></a>`:""}
              </div>
            </div>
            ${c.email?`<div class="cli-card-m-dado" style="grid-column:1/-1"><label>Email</label><span style="font-size:12px">${c.email}</span></div>`:""}
          </div>
          <div class="cli-card-m-acts">
            <button class="btn btn-b btn-xs" onclick="verHistoricoCliente('${c.id}')"><i class="ti ti-clock" style="font-size:13px"></i> Histórico</button>
            <button class="btn btn-s btn-xs" onclick="verFichaCli('${c.id}')" style="background:var(--pl);color:var(--pd);border-color:var(--p)40"><i class="ti ti-user" style="font-size:13px"></i> Ficha</button>
            <button class="btn btn-d btn-xs" onclick="delCli('${c.id}')"><i class="ti ti-trash" style="font-size:14px"></i></button>
          </div>
        </div>`;
      }).join("");
    } else {
      tb.innerHTML = html;
    }
  });
};

// ─── Comprovante do cliente ───────────────────────────────────────────────────
window.previewComprovante = function(input) {
  const file = input?.files?.[0]; if (!file) return;
  if (file.size > 3 * 1024 * 1024) { notif("Arquivo muito grande! Máximo 3MB.", true); input.value = ""; return; }
  const tipo = file.type.includes("pdf") ? "pdf" : "img";
  const reader = new FileReader();
  reader.onload = e => {
    const b64 = e.target.result;
    // Salvar nos hidden fields
    const hB64  = document.getElementById("cli-comp-base64");
    const hTipo = document.getElementById("cli-comp-tipo");
    if (hB64)  hB64.value  = b64;
    if (hTipo) hTipo.value = tipo;
    // Mostrar preview
    const imgWrap = document.getElementById("comp-img-wrap");
    const pdfWrap = document.getElementById("comp-pdf-wrap");
    const upArea  = document.getElementById("comp-upload-area");
    if (tipo === "img") {
      const img = document.getElementById("cli-comp-img");
      if (img) img.src = b64;
      if (imgWrap) imgWrap.style.display = "";
      if (pdfWrap) pdfWrap.style.display = "none";
    } else {
      if (pdfWrap) pdfWrap.style.display = "";
      if (imgWrap) imgWrap.style.display = "none";
    }
    if (upArea) upArea.style.display = "none";
    notif("Comprovante carregado! Salve para confirmar.");
  };
  reader.readAsDataURL(file);
};

window.verComprovanteImg = function() {
  const img = document.getElementById("cli-comp-img");
  if (!img || !img.src) return;
  const w = window.open("","_blank","width=800,height=700");
  if (w) { w.document.write(`<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${img.src}" style="max-width:100%;max-height:100vh"></body></html>`); w.document.close(); }
};

window.verComprovantePdf = function() {
  const id = document.getElementById("cli-id")?.value;
  if (!id) return;
  const b64 = localStorage.getItem("comp_" + id);
  if (!b64) { if(window.notif) notif("Comprovante não encontrado.", true); return; }
  const w = window.open("","_blank");
  if (w) { w.document.write(`<html><body style="margin:0"><iframe src="${b64}" style="width:100vw;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
};

window.removerComprovante = function() {
  const id = document.getElementById("cli-id")?.value;
  if (id) { localStorage.removeItem("comp_" + id); localStorage.removeItem("comp_tipo_" + id); }
  const wrap = document.getElementById("comp-img-wrap"); if (wrap) wrap.style.display = "none";
  const pdf  = document.getElementById("comp-pdf-wrap");  if (pdf)  pdf.style.display  = "none";
  const up   = document.getElementById("comp-upload-area"); if (up) up.style.display = "";
};

// ─── Cadastro rápido de cliente na locação ────────────────────────────────────
window.salvarRCli = async function() {
  const { gv, sv, notif: n } = window;
  const nome = gv("rcli-nome"); if (!nome) { n("Nome obrigatório!", true); return; }
  try {
    const ref = await addDoc(collection(db,"clientes"), {
      nome, cpf: gv("rcli-cpf"), tel: gv("rcli-tel"), email: gv("rcli-email"),
      cep: gv("rcli-cep"), rua: gv("rcli-rua"), num: gv("rcli-num"),
      bairro: gv("rcli-bairro"), cidade: gv("rcli-cidade"), uf: gv("rcli-uf"),
      origem: "Locação rápida", criadoEm: serverTimestamp()
    });
    const sc = document.getElementById("loc-cli");
    if (sc) { const opt = document.createElement("option"); opt.value = ref.id; opt.textContent = nome; opt.selected = true; sc.appendChild(opt); }
    window.closeModal?.("modal-rcli");
    n("Cliente cadastrado!");
  } catch(e) { n("Erro: "+e.message, true); }
};

// ─── Cadastro rápido de item na locação ───────────────────────────────────────
window.salvarRItem = async function() {
  const { gv, notif: n, fmtR } = window;
  const nome = gv("ritem-nome"); if (!nome) { n("Nome obrigatório!", true); return; }
  const aluguel = parseFloat(gv("ritem-aluguel")) || 0;
  try {
    const ref = await addDoc(collection(db,"itens"), {
      nome, categoria: gv("ritem-cat") || "Outro",
      aluguel, custo: parseFloat(gv("ritem-custo")) || 0,
      qtd: parseInt(gv("ritem-qtd")) || 1, estado: "Ótimo",
      criadoEm: serverTimestamp()
    });
    // Adicionar ao select de itens
    const si = document.getElementById("loc-item-sel");
    if (si) { const opt = document.createElement("option"); opt.value = ref.id; opt.textContent = `${nome} — ${fmtR(aluguel)}`; si.appendChild(opt); }
    window.closeModal?.("modal-ritem");
    n("Item cadastrado!");
  } catch(e) { n("Erro: "+e.message, true); }
};

// ─── Ficha completa do cliente ────────────────────────────────────────────────
window.verFichaCli = function(id) {
  const c = clientes.find(x => x.id === id); if (!c) return;
  const locs = (window._locacoes || []).filter(l => l.clienteId === id);

  // Avatar com iniciais
  const iniciais = (c.nome || "?").split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
  const av = document.getElementById("ficha-avatar"); if (av) av.textContent = iniciais;

  // Nome e subtítulo
  const nm = document.getElementById("ficha-nome"); if (nm) nm.textContent = c.nome || "—";
  const sub = document.getElementById("ficha-sub");
  if (sub) {
    const badges = [];
    if (locs.length >= 5) badges.push("⭐ Cliente frequente");
    if (locs.length >= 10) badges.push("🏆 VIP");
    const ultima = [...locs].sort((a,b) => (b.retirada||"").localeCompare(a.retirada||""))[0];
    if (ultima) badges.push(`Última: ${ultima.retirada ? ultima.retirada.split("-").reverse().join("/") : "?"}`);
    sub.textContent = badges.join("  ·  ") || "Nenhuma locação ainda";
  }

  // Cards resumo
  const totalGasto = locs.reduce((a, b) => a + (b.total || 0), 0);
  const ticket     = locs.length ? totalGasto / locs.length : 0;
  const tlEl = document.getElementById("ficha-total-loc");    if (tlEl) tlEl.textContent = locs.length;
  const tgEl = document.getElementById("ficha-total-gasto");  if (tgEl) tgEl.textContent = "R$ " + totalGasto.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const tkEl = document.getElementById("ficha-ticket");       if (tkEl) tkEl.textContent = "R$ " + ticket.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

  // Contato
  const ct = document.getElementById("ficha-contato");
  if (ct) {
    const info = [
      c.tel   ? `<span><i class="ti ti-phone" style="font-size:13px"></i> ${c.tel}</span>` : "",
      c.email ? `<span><i class="ti ti-mail" style="font-size:13px"></i> ${c.email}</span>` : "",
      c.cidade ? `<span><i class="ti ti-map-pin" style="font-size:13px"></i> ${c.cidade}${c.uf ? "/"+c.uf : ""}</span>` : "",
      c.nasc  ? `<span><i class="ti ti-cake" style="font-size:13px"></i> ${c.nasc.split("-").reverse().join("/")}</span>` : "",
    ].filter(Boolean);
    ct.innerHTML = info.join("") || '<span style="color:var(--txt3);font-size:12px">Sem informações de contato</span>';
  }

  // Histórico
  const hist = document.getElementById("ficha-historico");
  if (hist) {
    if (!locs.length) {
      hist.innerHTML = '<div style="text-align:center;padding:20px;color:var(--txt3);font-size:13px">Nenhuma locação registrada</div>';
    } else {
      const sorted = [...locs].sort((a,b) => (b.retirada||"").localeCompare(a.retirada||""));
      const fmtR = v => "R$ " + (parseFloat(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
      const fmtD = ds => { if (!ds) return "?"; const [y,m,d] = ds.split("-"); return `${d}/${m}/${y}`; };
      const corStatus = { ativo:"#15803d", devolvido:"#1d4ed8", orcamento:"#b45309", cancelado:"#9f1239" };
      hist.innerHTML = sorted.map(l => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bdr)">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500">${l.evento || "Sem evento"}</div>
            <div style="font-size:11px;color:var(--txt3)">${fmtD(l.retirada)} → ${fmtD(l.devolucao)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:700;color:var(--p)">${fmtR(l.total)}</div>
            <span style="font-size:10px;font-weight:600;color:${corStatus[l.status]||"var(--txt3)"};background:${corStatus[l.status]||"var(--txt3)"}18;padding:1px 7px;border-radius:6px">${l.status}</span>
          </div>
        </div>`).join("");
    }
  }

  // Botão editar
  const btn = document.getElementById("ficha-btn-edit");
  if (btn) btn.onclick = () => { closeModal("modal-ficha-cli"); setTimeout(() => editCli(id), 100); };

  document.getElementById("modal-ficha-cli")?.classList.add("on");
};
