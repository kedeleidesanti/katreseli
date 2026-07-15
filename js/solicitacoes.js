/**
 * solicitacoes.js — Gerenciar solicitações de clientes vindas do catálogo online
 */
import { db, collection, doc, onSnapshot, updateDoc, addDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp }
  from "./firebase.js";
import { clientes, locacoes, cfg } from "./state.js";
import { fmtD, notif, el }         from "./helpers.js";

let _sols        = [];
let _filtroStatus = "";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtV = v => "R$ " + (parseFloat(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

// ─── Cadastrar cliente a partir de uma solicitação ───────────────────────────
async function cadastrarClienteDaSolicitacao(s) {
  // 1. Verificar se já existe pelo tel ou CPF
  const existe = clientes.find(c =>
    (s.tel && c.tel && c.tel.replace(/\D/g,"") === s.tel.replace(/\D/g,"")) ||
    (s.cpf && c.cpf && c.cpf.replace(/\D/g,"") === s.cpf.replace(/\D/g,""))
  );
  if (existe) return existe.id;

  // 2. Cadastrar novo
  const novo = {
    nome:             s.nomeCliente    || "",
    cpf:              s.cpf            || "",
    comprovante:      s.comprovante    || "",
    comprovanteNome:  s.comprovanteNome|| "",
    comprovanteTipo:  s.comprovanteTipo|| "",
    temComprovante:   !!(s.comprovante),
    tel:              s.tel            || "",
    email:            s.email          || "",
    nasc:             s.nasc           || "",
    cep:              s.cep            || "",
    rua:              s.rua            || "",
    numero:           s.numero         || "",
    bairro:           s.bairro         || "",
    cidade:           s.cidade         || "",
    uf:               s.uf             || "",
    complemento:      s.complemento    || "",
    end:              s.endFormatado   || "",
    origem:           s.origem         || "Catálogo online",
    obs:              s.obs            || "",
    cadastroOnline:   true,            // flag para exibir badge diferente
    criadoEm:         serverTimestamp()
  };
  const ref = await addDoc(collection(db, "clientes"), novo);
  return ref.id;
}

// ─── Listener em tempo real (chamado por startListeners após autenticação) ───
let _unsubSols = null;
export function iniciarSolicitacoesListener() {
  if (_unsubSols) return;
  _unsubSols = onSnapshot(collection(db, "solicitacoes"), snap => {
    _sols = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));

    const pendentes = _sols.filter(s => s.status === "pendente").length;

    // Badge no menu
    const badge = el("badge-solicitacoes");
    if (badge) {
      badge.textContent    = pendentes;
      badge.style.display  = pendentes > 0 ? "" : "none";
    }

    // Re-renderizar se a página estiver visível
    if (el("tb-sols")) renderSolicitacoes();
  });
}

// ─── Renderizar tabela ────────────────────────────────────────────────────────
export function renderSolicitacoes(status) {
  if (status !== undefined) _filtroStatus = status;
  const tb = el("tb-sols"); if (!tb) return;
  const q = (document.getElementById("q-sols")?.value || "").toLowerCase();

  const lista = _sols.filter(s => {
    const matchF = !_filtroStatus || s.status === _filtroStatus;
    const matchQ = !q || (s.nomeCliente||"").toLowerCase().includes(q) || (s.tipoEvento||"").toLowerCase().includes(q) || (s.kitNome||"").toLowerCase().includes(q);
    return matchF && matchQ;
  });

  // Contadores nos chips
  const cnt = el("cnt-sols");
  if (cnt) cnt.textContent = lista.length;

  // Atualizar badge de pendentes no menu
  const pend = _sols.filter(s => s.status === "pendente").length;
  const badge = el("badge-solicitacoes");
  if (badge) { badge.textContent = pend; badge.style.display = pend > 0 ? "" : "none"; }

  if (!lista.length) {
    tb.innerHTML = `<tr><td colspan="7"><div class="empty"><i class="ti ti-inbox"></i><p>${_filtroStatus ? "Nenhuma solicitação com esse status." : "Nenhuma solicitação ainda."}</p></div></td></tr>`;
    return;
  }

  const corSt = { pendente:"#b45309", aprovado:"#15803d", recusado:"#b91c1c", convertido:"#1d4ed8" };
  const bgSt  = { pendente:"#fef9c3", aprovado:"#f0fdf4", recusado:"#fff1f2", convertido:"#eff6ff" };
  const bdrSt = { pendente:"#fde68a", aprovado:"#86efac", recusado:"#fecdd3", convertido:"#bfdbfe" };
  const lbl   = { pendente:"Pendente", aprovado:"Aprovado", recusado:"Recusado", convertido:"Convertido" };
  const rowBg = { pendente:"rgba(180,83,9,.04)", aprovado:"rgba(21,128,61,.04)", recusado:"rgba(185,28,28,.04)", convertido:"rgba(29,78,216,.03)" };
  const avBg  = { pendente:"#fef9c3", aprovado:"#f0fdf4", recusado:"#fff1f2", convertido:"#eff6ff" };

  // Mobile: cards; Desktop: tabela
  const isMob   = window.innerWidth < 700;
  const twEl    = document.getElementById("tw-sols");
  const cardsEl = document.getElementById("cards-sols");
  if (isMob && twEl)    twEl.style.display    = "none";
  if (isMob && cardsEl) cardsEl.style.display  = "block";
  if (!isMob && twEl)    twEl.style.display    = "";
  if (!isMob && cardsEl) cardsEl.style.display = "none";

  const renderHtml = lista.map(s => {
    const inic = (s.nomeCliente||"?").split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
    const tel  = (s.tel||"").replace(/\D/g,"");
    const waHref = tel ? `https://wa.me/55${tel}` : "#";
    const acoesBtns = `
      <button onclick="verSol('${s.id}')" class="btn btn-s btn-xs"><i class="ti ti-eye"></i> Revisar</button>
      ${s.status==="pendente" ? `
        <button onclick="aprovarSol('${s.id}')" class="btn btn-xs" style="background:#f0fdf4;color:#15803d;border:1.5px solid #86efac" title="Aprovar"><i class="ti ti-check"></i></button>
        <button onclick="recusarSol('${s.id}')" class="btn btn-xs" style="background:#fff1f2;color:#b91c1c;border:1.5px solid #fecdd3" title="Recusar"><i class="ti ti-x"></i></button>` : ""}
      ${(s.status==="pendente"||s.status==="aprovado") ? `
        <button onclick="converterSol('${s.id}')" class="btn btn-xs" style="background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe" title="Converter em locação"><i class="ti ti-arrows-exchange"></i></button>` : ""}
      <button onclick="delSol('${s.id}')" class="btn btn-xs btn-d" title="Excluir"><i class="ti ti-trash"></i></button>`;

    if (isMob) {
      return `<div class="sol-card-m" style="border-left:3px solid ${bdrSt[s.status]||"var(--bdr)"}">
        <div class="sol-card-m-top">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:40px;height:40px;border-radius:50%;background:${avBg[s.status]||"var(--pl)"};color:${corSt[s.status]||"var(--pd)"};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${inic}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.nomeCliente||"—"}${s.comprovante?` <span style="font-size:9px;background:#f0fdf4;color:#15803d;border:1px solid #86efac;padding:1px 5px;border-radius:4px">📎</span>`:""}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                <span style="display:inline-flex;align-items:center;font-size:10px;font-weight:600;color:${corSt[s.status]||"var(--txt)"};background:${bgSt[s.status]||"var(--bg)"};border:1px solid ${bdrSt[s.status]||"var(--bdr2)"};padding:2px 8px;border-radius:20px">${lbl[s.status]||s.status}</span>
                ${s.cidade||s.uf ? `<span style="font-size:10px;color:var(--txt3)">${s.cidade||""} ${s.uf||""}</span>` : ""}
              </div>
            </div>
          </div>
        </div>
        <div class="sol-card-m-dados">
          <div class="sol-card-m-dado"><label>Evento</label><span>${s.tipoEvento||"—"}</span></div>
          <div class="sol-card-m-dado"><label>Retirada</label><span>${fmtD(s.retirada)||"—"}${s.devolucao?`<span style="font-size:11px;color:var(--txt3)"> → ${fmtD(s.devolucao)}</span>`:""}</span></div>
          ${s.kitNome ? `<div class="sol-card-m-dado" style="grid-column:1/-1"><label>Kit</label><span style="color:var(--p)">${s.kitNome}</span></div>` : ""}
          <div class="sol-card-m-dado" style="grid-column:1/-1"><label>WhatsApp</label>
            <a href="${waHref}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;color:#16a34a;font-size:13px;font-weight:600;text-decoration:none"><i class="ti ti-brand-whatsapp"></i>${s.tel||"—"}</a>
          </div>
        </div>
        <div class="sol-card-m-acts">${acoesBtns}</div>
      </div>`;
    }

    return `<tr style="cursor:pointer;background:${rowBg[s.status]||"transparent"}" ondblclick="verSol('${s.id}')">
      <td>
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:34px;height:34px;border-radius:50%;background:${avBg[s.status]||"var(--pl)"};color:${corSt[s.status]||"var(--pd)"};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${inic}</div>
          <div>
            <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:5px">
              ${s.nomeCliente||"—"}
              ${s.comprovante ? `<span style="font-size:9px;background:#f0fdf4;color:#15803d;border:1px solid #86efac;padding:1px 5px;border-radius:4px" title="Comprovante enviado">📎</span>` : ""}
            </div>
            <div style="font-size:11px;color:var(--txt3);margin-top:1px">${s.cidade||""} ${s.uf||""}</div>
          </div>
        </div>
      </td>
      <td>
        <a href="${waHref}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;color:#16a34a;font-size:12px;text-decoration:none">
          <i class="ti ti-brand-whatsapp" style="font-size:14px"></i>${s.tel||"—"}
        </a>
      </td>
      <td style="overflow:hidden;max-width:0">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500;color:var(--p)">${s.kitNome||"<span style='color:var(--txt3);font-weight:400'>Sem kit</span>"}</div>
      </td>
      <td style="font-size:12px">${s.tipoEvento||"—"}</td>
      <td>
        <div style="font-size:12px;font-weight:600;color:var(--txt)">${fmtD(s.retirada)}</div>
        ${s.devolucao ? `<div style="font-size:11px;color:var(--txt3)">→ ${fmtD(s.devolucao)}</div>` : ""}
      </td>
      <td>
        <span style="display:inline-flex;align-items:center;font-size:11px;font-weight:600;color:${corSt[s.status]||"var(--txt)"};background:${bgSt[s.status]||"var(--bg)"};border:1px solid ${bdrSt[s.status]||"var(--bdr2)"};padding:3px 9px;border-radius:20px;white-space:nowrap">
          ${lbl[s.status]||s.status}
        </span>
      </td>
      <td style="text-align:right">
        <div class="acts">${acoesBtns}</div>
      </td>
    </tr>`;
  }).join("");

  if (isMob && cardsEl) {
    cardsEl.innerHTML = renderHtml;
  } else {
    tb.innerHTML = renderHtml;
  }
}
window.renderSolicitacoes = renderSolicitacoes;

// ─── Ver / Revisar solicitação ────────────────────────────────────────────────
window.verSol = async function(id) {
  const s = _sols.find(x => x.id === id); if (!s) return;
  const m = el("modal-sol-det"); if (!m) return;

  // Buscar dados atualizados do portal do cliente
  try {
    const email = s.email || "";
    if (email) {
      const snapCP = await getDocs(query(collection(db,"clientes_portal"), where("email","==",email)));
      if (!snapCP.empty) {
        const dp = snapCP.docs[0].data();
        s._nascPortal   = dp.nasc || dp.nascimento || "";
        s._origemPortal = (dp.origem && dp.origem !== "Área do cliente") ? dp.origem : "";
        s._compPortal   = !!(dp.comprovante || dp.comprovanteUrl);
      }
    }
  } catch(_) {}

  const corSt = { pendente:"#b45309", aprovado:"#15803d", recusado:"#b91c1c", convertido:"#1d4ed8" };
  const bgSt  = { pendente:"#fef9c3", aprovado:"#f0fdf4", recusado:"#fff1f2", convertido:"#eff6ff" };
  const lbl   = { pendente:"⏳ Pendente", aprovado:"✅ Aprovado", recusado:"❌ Recusado", convertido:"🔄 Convertido" };

  const row = (icone, label, valor) => valor
    ? `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--bdr);font-size:13px;align-items:flex-start">
        <span style="flex-shrink:0;width:20px;text-align:center">${icone}</span>
        <span style="color:var(--txt2);min-width:110px;flex-shrink:0">${label}</span>
        <span style="font-weight:500;flex:1">${valor}</span>
       </div>` : "";

  el("sol-det-body").innerHTML = `
    <!-- Status badge -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <span style="font-size:13px;font-weight:700;color:${corSt[s.status]||"var(--txt)"};background:${bgSt[s.status]||"var(--bg)"};padding:4px 14px;border-radius:8px">${lbl[s.status]||s.status}</span>
      <span style="font-size:11px;color:var(--txt3)">${s.criadoEm?.seconds ? new Date(s.criadoEm.seconds*1000).toLocaleString("pt-BR") : "Data desconhecida"}</span>
    </div>

    <!-- Dados pessoais -->
    <div style="font-size:10px;font-weight:700;color:var(--p);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">👤 Dados pessoais</div>
    ${row("🪪","Nome",      s.nomeCliente)}
    ${row("📋","CPF/CNPJ",  s.cpf)}
    ${row("📱","WhatsApp",  s.tel ? `<a href="https://wa.me/55${s.tel.replace(/\D/g,"")}" target="_blank" style="color:var(--p)">${s.tel}</a>` : "")}
    ${row("✉️","E-mail",    s.email)}
    ${row("🎂","Nascimento", (() => {
      const n = s._nascPortal || s.nasc || s.nascimento || "";
      if (!n) return "—";
      if (n.includes("-") && n.length >= 8) { const p=n.split("-"); if(p.length===3) return p[2].substring(0,2)+"/"+p[1]+"/"+p[0]; }
      if (n.includes("/") && n.length === 10) return n;
      return n;
    })())}
    ${row("💡","Como nos conheceu", (s.origem && s.origem !== "Área do cliente" && s.origem !== "") ? s.origem : (s._origemPortal || "Área do cliente"))}

    <!-- Endereço -->
    ${s.endFormatado || s.rua ? `
    <div style="font-size:10px;font-weight:700;color:var(--p);text-transform:uppercase;letter-spacing:.8px;margin:14px 0 6px">📍 Endereço</div>
    ${row("🏠","Logradouro", [s.rua, s.numero].filter(Boolean).join(", "))}
    ${row("🏘️","Bairro",     s.bairro)}
    ${row("🏙️","Cidade/UF",  [s.cidade, s.uf].filter(Boolean).join(" / "))}
    ${row("📮","CEP",        s.cep)}
    ${row("🚪","Complemento",s.complemento)}` : ""}

    <!-- Pedido -->
    <div style="font-size:10px;font-weight:700;color:var(--p);text-transform:uppercase;letter-spacing:.8px;margin:14px 0 6px">🎉 Pedido</div>
    ${row("🎪","Tipo de evento", s.tipoEvento)}
    ${row("🎀","Kit solicitado", s.kitNome)}
    ${s.kitValor ? row("💰","Valor do kit", fmtV(s.kitValor)) : ""}
    ${row("📤","Retirada",    fmtD(s.retirada))}
    ${row("📥","Devolução",   fmtD(s.devolucao))}
    ${s.retirada && s.devolucao ? row("⏱","Período", `${Math.round((new Date(s.devolucao)-new Date(s.retirada))/864e5)+1} dias`) : ""}
    ${row("📍","Local do evento", s.local)}
    ${s.entrega ? `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--bdr);font-size:13px;align-items:flex-start">
      <span style="flex-shrink:0;width:20px;text-align:center">🚚</span>
      <span style="color:var(--txt2);min-width:110px;flex-shrink:0">Entrega</span>
      <span style="font-weight:600;color:#15803d">✅ Solicitou entrega${(s.entregaEnd||s.local) ? "<br><span style='font-weight:400;color:var(--txt2);font-size:12px'>📍 " + (s.entregaEnd || s.local) + "</span>" : ""}${s.entregaObs ? "<br><span style='font-weight:400;color:var(--txt2);font-size:12px'>💬 " + s.entregaObs + "</span>" : ""}</span>
    </div>` : row("🚚","Entrega","❌ Não solicitada")}
    ${s.montagem ? `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--bdr);font-size:13px;align-items:center">
      <span style="flex-shrink:0;width:20px;text-align:center">🔧</span>
      <span style="color:var(--txt2);min-width:110px;flex-shrink:0">Montagem</span>
      <span style="font-weight:600;color:#15803d">✅ Solicitou montagem e desmontagem</span>
    </div>` : row("🔧","Montagem","❌ Não solicitada")}
    ${row("📝","Observações",  s.obs)}
    ${s.adicionais ? row("✨","Pedidos adicionais", s.adicionais) : ""}

    <!-- Comprovante -->
    ${s.comprovante ? `
    <div style="font-size:10px;font-weight:700;color:var(--p);text-transform:uppercase;letter-spacing:.8px;margin:14px 0 8px">📎 Comprovante de residência</div>
    <div style="margin-bottom:12px">
      ${s.comprovanteTipo && s.comprovanteTipo.startsWith("image/")
        ? `<img src="${s.comprovante}" style="max-width:100%;border-radius:10px;border:1.5px solid var(--bdr2)">`
        : `<a href="${s.comprovante}" download="${s.comprovanteNome||'comprovante'}" class="btn btn-s btn-sm" style="display:inline-flex;align-items:center;gap:6px">
             <i class="ti ti-download"></i> Baixar ${s.comprovanteNome||"comprovante"}
           </a>`}
    </div>` : ""}

    <input type="hidden" id="sol-det-id" value="${id}">

    <!-- Ações inline -->
    ${s.status==="pendente" ? `
    ${!s.comprovante || !s.cpf || !s.tel ? `
    <div style="background:#fef9c3;border:1.5px solid #fde68a;border-radius:12px;padding:12px 14px;margin-top:16px;font-size:12px;color:#92400e">
      <div style="font-weight:700;margin-bottom:6px">⚠️ Pendências nesta solicitação:</div>
      ${s.statusNotif === "reanalise_solicitada" ? `
      <div style="background:#f0fdf4;border:1.5px solid #22c55e;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#15803d;font-weight:700;display:flex;align-items:center;gap:6px">
        <i class="ti ti-refresh-alert"></i> Cliente solicitou reanálise — verificar documentos!
      </div>` : ""}
      ${!s.comprovante ? "<div>📄 Comprovante de residência não enviado</div>" : ""}
      ${!s.cpf ? "<div>🪪 CPF / CNPJ não informado</div>" : ""}
      ${!s.tel ? "<div>📱 WhatsApp não informado</div>" : ""}
    </div>` : ""}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button onclick="aprovarSol('${id}');closeModal('modal-sol-det')" class="btn btn-p" style="flex:1;justify-content:center;background:#15803d">
        <i class="ti ti-check"></i> Aprovar e notificar cliente
      </button>
      <button onclick="recusarSol('${id}');closeModal('modal-sol-det')" class="btn btn-xs" style="background:#fff1f2;color:#b91c1c;border:1.5px solid #fecdd3;padding:8px 14px">
        <i class="ti ti-x"></i> Recusar
      </button>
    </div>
    <button onclick="notificarPendencias('${id}')" class="btn" style="width:100%;margin-top:8px;justify-content:center;background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa">
      <i class="ti ti-bell-ringing"></i> Notificar cliente sobre pendências
    </button>
    ${(s.pendencias?.length || s.statusNotif === "reanalise_solicitada") ? `
    <button onclick="limparPendencias('${id}')" class="btn" style="width:100%;margin-top:6px;justify-content:center;background:#f0fdf4;color:#15803d;border:1.5px solid #86efac">
      <i class="ti ti-circle-check"></i> ✅ Confirmar — documentos verificados
    </button>` : ""}
    <button onclick="converterSol('${id}');closeModal('modal-sol-det')" class="btn btn-p" style="width:100%;margin-top:8px;justify-content:center">
      <i class="ti ti-arrows-exchange"></i> Converter em locação (cadastra cliente automaticamente)
    </button>` : ""}
    ${s.status==="aprovado" ? `
    <button onclick="converterSol('${id}');closeModal('modal-sol-det')" class="btn btn-p" style="width:100%;margin-top:16px;justify-content:center">
      <i class="ti ti-arrows-exchange"></i> Converter em locação
    </button>` : ""}`;

  m.classList.add("on");
};

// ─── Excluir solicitação ─────────────────────────────────────────────────────
// ─── Notificar cliente sobre pendências ─────────────────────────────────────
window.notificarPendencias = async function(id) {
  // Buscar a solicitação diretamente (state pode não ter sincronizado)
  let s;
  try {
    const snap = await getDoc(doc(db, "solicitacoes", id));
    if (!snap.exists()) { notif("Solicitação não encontrada", true); return; }
    s = { id: snap.id, ...snap.data() };
  } catch(e) {
    // Fallback ao array do state
    s = (typeof solicitacoes !== "undefined" ? solicitacoes : []).find(x => x.id === id);
    if (!s) { notif("Erro ao buscar solicitação", true); return; }
  }

  // Buscar dados atualizados do cliente no clientes_portal (uid como doc ID)
  let clienteAtual = { ...s };
  try {
    const email = s.email || "";
    if (email) {
      // Buscar por email no campo (clientes_portal pode ter email salvo)
      const snapCP = await getDocs(query(collection(db,"clientes_portal"), where("email","==",email)));
      if (!snapCP.empty) {
        Object.assign(clienteAtual, snapCP.docs[0].data());
      } else {
        // Tentar buscar na coleção clientes (tem clienteId na solicitação)
        if (s.clienteId) {
          const snapC = await getDoc(doc(db,"clientes_portal",s.clienteId));
          if (snapC.exists()) Object.assign(clienteAtual, snapC.data());
        }
      }
    }
  } catch(_) {}

  // Montar pendências verificando dados atualizados
  const lista = [];
  const temComprovante = !!(s._compPortal || clienteAtual.comprovante || clienteAtual.comprovanteUrl);
  const temNasc = !!(clienteAtual.nasc || clienteAtual.nascimento || s.nasc);
  if (!temComprovante) lista.push({ tipo: "comprovante", msg: "Comprovante de residência não enviado" });
  if (!s.cpf)          lista.push({ tipo: "cpf",         msg: "CPF / CNPJ não informado" });
  if (!s.tel)          lista.push({ tipo: "tel",         msg: "WhatsApp não informado" });
  if (!temNasc)        lista.push({ tipo: "nasc",        msg: "Data de nascimento não informada" });
  if (!s.rua)          lista.push({ tipo: "endereco",    msg: "Endereço incompleto" });

  // Permitir adicionar pendência customizada
  const extra = await window.confirmar({
    titulo: "Notificar pendências",
    msg: lista.length
      ? "Pendências encontradas:\n\n" + lista.map(p => "• " + p.msg).join("\n") + "\n\nDeseja enviar esta notificação ao cliente?"
      : "Nenhuma pendência automática detectada. Deseja escrever uma mensagem personalizada?",
    tipo: "warning",
    labelOk: "Enviar notificação",
    labelCancel: "Cancelar"
  });
  if (!extra) return;

  // Salvar pendências na solicitação para o cliente ver no portal
  try {
    await updateDoc(doc(db, "solicitacoes", id), {
      pendencias:      lista.map(p => p.msg),
      statusNotif:     "pendente_docs",
      notifEnviadaEm:  new Date()
    });
    notif("✅ Cliente notificado sobre as pendências!");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Limpar pendências após cliente resolver ────────────────────────────────
window.limparPendencias = async function(id) {
  try {
    await updateDoc(doc(db, "solicitacoes", id), {
      pendencias:  [],
      statusNotif: "resolvido",
      reanaliseEm: null
    });
    notif("✅ Pendências removidas — cliente verá status limpo!");
    closeModal("modal-sol-det");
  } catch(e) { notif("Erro: " + e.message, true); }
};

window.delSol = async function(id) {
  if (!await window.confirmar({ titulo:"Excluir solicitação", msg:"Esta solicitação será excluída permanentemente.", tipo:"danger", labelOk:"Excluir" })) return;
  try {
    await deleteDoc(doc(db, "solicitacoes", id));
    notif("Solicitação excluída.");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Aprovar (cadastra cliente + notifica WhatsApp) ───────────────────────────
window.aprovarSol = async function(id) {
  const s = _sols.find(x => x.id === id); if (!s) return;

  // ── Verificar documentos pendentes antes de aprovar — buscar do portal ────
  let dadosCliente = { ...s };
  try {
    const email = s.email || "";
    if (email) {
      const snapCP = await getDocs(query(collection(db,"clientes_portal"), where("email","==",email)));
      if (!snapCP.empty) Object.assign(dadosCliente, snapCP.docs[0].data());
    }
  } catch(_) {}

  const avisos = [];
  if (!dadosCliente.comprovante && !dadosCliente.comprovanteUrl)
    avisos.push("📄 Comprovante de residência não enviado");
  if (!s.cpf)  avisos.push("🪪 CPF / CNPJ não informado");
  if (!s.tel)  avisos.push("📱 WhatsApp não informado");

  if (avisos.length > 0) {
    const ok = await window.confirmar({
      titulo:  "⚠️ Documentos pendentes",
      msg:     "Esta solicitação tem pendências:\n\n" + avisos.join("\n") + "\n\nDeseja aprovar mesmo assim?",
      tipo:    "warning",
      labelOk: "Aprovar mesmo assim",
      labelCancel: "Cancelar"
    });
    if (!ok) return;
  }

  try {
    // Cadastrar cliente automaticamente ao aprovar
    const clienteId = await cadastrarClienteDaSolicitacao(s);

    await updateDoc(doc(db, "solicitacoes", id), {
      status:    "aprovado",
      clienteId: clienteId
    });
    notif("✅ Aprovado! Cliente cadastrado automaticamente.");

    // WhatsApp de confirmação
    const tel = (s.tel || "").replace(/\D/g, "");
    if (tel) {
      const nome = cfg?.nome || "Katreseli";
      const msg  = `Olá, ${(s.nomeCliente||"").split(" ")[0]}! 🎀 Sua solicitação de locação foi *aprovada*!\n\n🎉 *${s.tipoEvento||"Evento"}*\n${s.kitNome?`🎀 Kit: ${s.kitNome}\n`:""}📤 Retirada: ${fmtD(s.retirada)}\n📥 Devolução: ${fmtD(s.devolucao)}\n\nEntraremos em contato em breve para combinar o pagamento. 😊\n\n_${nome}_`;
      setTimeout(() => window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`, "_blank"), 600);
    }
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Recusar ──────────────────────────────────────────────────────────────────
window.recusarSol = async function(id) {
  if (!await window.confirmar({ titulo:"Recusar solicitação", msg:"A solicitação será recusada. O cliente não será notificado automaticamente.", tipo:"warning", labelOk:"Recusar" })) return;
  try {
    await updateDoc(doc(db, "solicitacoes", id), { status: "recusado" });
    notif("Solicitação recusada.");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Converter em locação (cadastra cliente + abre wizard) ────────────────────
window.converterSol = async function(id) {
  const s = _sols.find(x => x.id === id); if (!s) return;
  let clienteId = s.clienteId || null;

  try {
    clienteId = await cadastrarClienteDaSolicitacao(s);
    await updateDoc(doc(db, "solicitacoes", id), { status: "convertido", clienteId });
    notif("Cliente cadastrado! Abrindo locação...");
  } catch(e) { notif("Erro ao cadastrar cliente: " + e.message, true); return; }

  // Guardar ID da solicitação origem para ser salvo na locação
  window._solicitacaoOrigemId = id;

  // Navegar e abrir modal
  window.navTo?.("locacoes");

  setTimeout(() => {
    // Abrir modal zerado normalmente
    window.abrirLocacao?.();

    // Aguardar o modal abrir e aí preencher tudo
    setTimeout(() => {
      _preencherWizardDaSol(s, clienteId);
    }, 350);
  }, 300);
};

function _preencherWizardDaSol(s, clienteId) {
  const sv = window.sv; if (!sv) return;

  // 1. Cliente
  sv("loc-cli", clienteId);
  const inp = el("loc-cli-search");
  if (inp) inp.value = s.nomeCliente || "";

  // 2a. Tipo de locação — se cliente pediu montagem, selecionar "Aluguel + Montagem"
  if (s.montagem) {
    window.sv?.("loc-tipo", "montagem");
    window.toggleTipo?.();
  }

  // 2. Tipo de evento — preencher o select
  sv("loc-evento", s.tipoEvento || "");
  // Se o tipo de evento não existe no select, adicionar como option
  const selEv = el("loc-evento");
  if (selEv && s.tipoEvento) {
    let optEv = Array.from(selEv.options).find(o => o.value === s.tipoEvento);
    if (!optEv) {
      const opt = document.createElement("option");
      opt.value = s.tipoEvento; opt.textContent = s.tipoEvento;
      selEv.appendChild(opt);
    }
    selEv.value = s.tipoEvento;
  }

  // Local do evento
  sv("loc-local",  s.local || "");

  // Entrega — ativar toggle se cliente solicitou
  if (s.entrega) {
    const chkEnt = el("loc-entrega-chk");
    if (chkEnt && !chkEnt.checked) {
      chkEnt.checked = true;
      window.toggleEntrega?.();
    }

    // Preencher endereço de entrega — usar local do evento como referência
    const endEntrega = s.entregaEnd || s.local || "";

    // Extrair CEP do endereço de entrega (formato "CEP: 00000-000" ou "00000-000")
    const cepMatch = endEntrega.match(/\d{5}-?\d{3}/);
    const cepEntrega = cepMatch ? cepMatch[0].replace(/\D/g, "") : "";

    if (cepEntrega.length === 8) {
      // Setar CEP no campo de entrega e calcular distância
      const cepInp = el("loc-entrega-cep");
      if (cepInp) {
        cepInp.value = cepEntrega.slice(0,5) + "-" + cepEntrega.slice(5);
        // Mostrar info do endereço
        const infoDiv = el("loc-entrega-cep-info");
        if (infoDiv) {
          infoDiv.textContent = "📍 " + endEntrega;
          infoDiv.style.display = "";
          infoDiv.style.background = "var(--pl)";
          infoDiv.style.color = "var(--pd)";
        }
        // Calcular km após um delay
        setTimeout(() => window.calcKmEntrega?.(), 300);
      }
    } else if (endEntrega) {
      // Sem CEP — colocar endereço no campo de complemento
      sv("loc-entrega-end", endEntrega);
      const infoDiv = el("loc-entrega-cep-info");
      if (infoDiv) {
        infoDiv.textContent = "📍 " + endEntrega;
        infoDiv.style.display = "";
        infoDiv.style.background = "var(--bg)";
        infoDiv.style.color = "var(--txt2)";
      }
    }

    // Observações de entrega nas observações gerais
    if (s.entregaObs) {
      const obsInp = el("loc-obs");
      if (obsInp) obsInp.value = (obsInp.value ? obsInp.value + "\n" : "") + "Entrega: " + s.entregaObs;
    }
  }

  // Pedidos adicionais → concatenar nas observações
  if (s.adicionais) {
    const obsInp = el("loc-obs");
    if (obsInp) obsInp.value = (obsInp.value ? obsInp.value + "\n" : "") + "Pedidos adicionais: " + s.adicionais;
  }

  // 3. Datas — setDataManual agora funciona pois _calR não é recriado
  if (s.retirada && s.devolucao) {
    window.setDataManual?.("ret", s.retirada);
    setTimeout(() => {
      window.setDataManual?.("dev", s.devolucao);
      window.renderCalRange?.();
      // Re-popular selects com as datas corretas
      window.popularSelectItens?.(s.retirada, s.devolucao);
      window.popularSelectDecs?.(s.retirada, s.devolucao);
    }, 100);
  }

  // 4. Kit — popular selects com as datas e depois adicionar o kit
  if (s.kitId) {
    setTimeout(() => {
      // Popular o select de decorações com as datas corretas
      window.popularSelectDecs?.(s.retirada, s.devolucao);

      setTimeout(() => {
        const selDec = el("loc-dec-sel");
        if (!selDec) return;

        // Tentar setar diretamente
        selDec.value = s.kitId;
        if (selDec.value === s.kitId) {
          window.addDecLoc?.();
          return;
        }

        // Se o kit não apareceu no select (pode estar "ocupado" nas datas),
        // adicionar forçado via addDecLocForced
        const { decoracoes } = window._stateRef || {};
        const dec = (decoracoes || window._decsCache || []).find(x => x.id === s.kitId);
        if (dec) {
          // Adicionar option temporariamente e disparar
          const opt = document.createElement("option");
          opt.value = dec.id;
          opt.textContent = dec.nome;
          selDec.appendChild(opt);
          selDec.value = dec.id;
          window.addDecLoc?.();
          selDec.removeChild(opt);
        }
      }, 300);
    }, 150);
  }

  window.notif?.("✅ Dados da solicitação preenchidos! Revise e avance.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE DE SOLICITAÇÕES (Kanban)
// ═══════════════════════════════════════════════════════════════════════════════
window.renderSolPipeline = function() {
  const div = document.getElementById("sol-pipeline"); if (!div) return;
  const colunas = [
    { key:"pendente",   label:"Pendente",   cor:"#b45309", bg:"#fef9c3" },
    { key:"aprovado",   label:"Em contato", cor:"#0369a1", bg:"#e0f2fe" },
    { key:"convertido", label:"Convertido", cor:"#15803d", bg:"#f0fdf4" },
    { key:"recusado",   label:"Recusado",   cor:"#b91c1c", bg:"#fff1f2" },
  ];
  div.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;padding:4px 0">` +
    colunas.map(col => {
      const cards = _sols.filter(s => s.status === col.key);
      return `<div style="background:var(--bg);border-radius:12px;padding:12px;border:1px solid var(--bdr)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${col.cor};margin-bottom:10px;display:flex;justify-content:space-between">
          <span>${col.label}</span><span style="background:${col.bg};padding:1px 8px;border-radius:10px;font-weight:700;color:${col.cor}">${cards.length}</span>
        </div>
        ${cards.map(s => `<div onclick="verSol('${s.id}')" style="background:var(--sur);border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;border:1px solid var(--bdr);transition:transform .15s" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
          <div style="font-size:13px;font-weight:600;color:var(--txt);margin-bottom:3px">${s.nomeCliente||"—"}</div>
          <div style="font-size:11px;color:var(--txt3)">${s.kitNome||"Sem kit"} · ${fmtD(s.retirada)||"—"}</div>
        </div>`).join("") || `<div style="text-align:center;padding:20px;color:var(--txt3);font-size:12px">Nenhuma</div>`}
      </div>`;
    }).join("") + `</div>`;
};
