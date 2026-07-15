// ─── Todos os imports no topo (obrigatório em ES modules) ────────────────────
import { db, doc, getDoc, setDoc, addDoc, collection, serverTimestamp }
  from "./firebase.js";
import { el, gv, sv, notif, dl } from "./helpers.js";
import { cfg, metas, categorias, filtros, locacoes,
         clientes as clis, itens as its,
         setCfg, setMetas, setFiltro } from "./state.js";
import { closeModal }               from "./navigation.js";
import { renderSelectCat, renderChipsCat } from "./itens.js";
import { loadClausulas, renderClausulas } from "./clausulas.js";

// ─── Carregar configurações ───────────────────────────────────────────────────
export async function loadCfg() {
  try {
    const logo = localStorage.getItem("k_logo"); if (logo) cfg.logo = logo;
    const d = await getDoc(doc(db, "config", "app")); if (d.exists()) setCfg(d.data());
    // Carregar credenciais privadas de pagamento (só admin tem acesso)
    try {
      const dp = await getDoc(doc(db, "config", "pagamento_privado"));
      if (dp.exists()) Object.assign(cfg, dp.data());
    } catch(_) {} // Silencia erro se não tiver permissão
    if (logo) cfg.logo = logo;
    const m = await getDoc(doc(db, "config", "metas")); if (m.exists()) setMetas(m.data());
    aplicarCfg();
    // Carregar clausulas no display (loadClausulas cuida do Firestore)
    renderClausulas("aluguel");
    renderClausulas("montagem");
  } catch (_) {}
}

// ─── Aplicar tema/visual ──────────────────────────────────────────────────────
export function aplicarCfg() {
  const r = document.documentElement;
  r.style.setProperty("--p",  cfg.cor   || "#d4307a");
  r.style.setProperty("--pd", cfg.corD  || "#a0235c");
  r.style.setProperty("--pl", cfg.corL  || "#fce4f3");
  r.style.setProperty("--bg", cfg.corBg || "#f8f4f7");
  document.title = cfg.nome || "KATRESELI decorações";
  if (el("sb-nome")) el("sb-nome").textContent = cfg.nome   || "KATRESELI decorações";
  if (el("sb-sub"))  el("sb-sub").textContent  = cfg.slogan || "";

  const logo = cfg.logo;
  // Atualizar favicon com o logo da identidade visual
  if (logo) {
    const favLink = document.querySelector("link[rel='icon']") || document.createElement("link");
    favLink.rel  = "icon";
    favLink.type = "image/png";
    favLink.href = logo;
    if (!favLink.parentNode) document.head.appendChild(favLink);
  }
  if (el("sb-icon")) el("sb-icon").innerHTML = logo
    ? `<img src="${logo}" style="width:36px;height:36px;border-radius:10px;object-fit:cover">`
    : "&#127872;";
  if (el("cfg-logo-prev")) el("cfg-logo-prev").innerHTML = logo
    ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover">`
    : "&#127872;";

  sv("cfg-nome",       cfg.nome    || "");
  sv("cfg-slogan",     cfg.slogan  || "");
  [["p", cfg.cor], ["d", cfg.corD], ["l", cfg.corL], ["bg", cfg.corBg]].forEach(([k, v]) => {
    v = v || "";
    sv("cor-" + k, v); sv("cor-" + k + "-hex", v);
    const b = el("box-" + k); if (b) b.style.background = v;
  });
  sv("cfg-cl-aluguel",    cfg.clausAluguel  || "");
  sv("cfg-rod-aluguel",   cfg.rodAluguel    || "");
  sv("cfg-cl-mont",       cfg.clausMont     || "");
  sv("cfg-rod-mont",      cfg.rodMont       || "");
  sv("cfg-hora",          cfg.hora          || "");
  sv("cfg-razao",       cfg.razao       || "");
  sv("cfg-cnpj",        cfg.cnpj        || "");
  sv("cfg-end-empresa", cfg.endEmpresa  || "");
  sv("cfg-responsavel", cfg.responsavel || "");
  sv("cfg-endereco",        cfg.endereco       || "");
  sv("cfg-pix-key",         cfg.pixKey         || "");
  sv("cfg-pix-key-fin",     cfg.pixKey         || "");
  sv("cfg-pix-key",  cfg.pixKey  || "61083661000112");
  sv("cfg-pix-key-gw", cfg.pixKey || "");
  sv("cfg-pix-nome", cfg.pixNome || "Katreseli Decoracoes");
  sv("cfg-pix-nome-gw", cfg.pixNome || "");
  sv("cfg-taxa-parcela",    cfg.taxaParcela    || "2.99");
  sv("cfg-redirect-url",   cfg.redirectUrl    || cfg.infinitepayRedirect || "");
  sv("cfg-infinitepay-handle",  cfg.infinitepayHandle  || "");
  sv("cfg-infinitepay-webhook", cfg.infinitepayWebhook || "");
  sv("cfg-mp-token",        cfg.mpToken        || "");
  sv("cfg-mp-pubkey",       cfg.mpPubKey       || "");
  sv("cfg-pags-token",      cfg.pagsToken      || "");
  sv("cfg-pags-email",      cfg.pagsEmail      || "");
  sv("cfg-stripe-secret",   cfg.stripeSecret   || "");
  sv("cfg-stripe-pubkey",   cfg.stripePubKey   || "");
  sv("cfg-pix-nome",        cfg.pixNome        || "");
  const gwEl = document.getElementById("cfg-gateway-selecionado");
  if (gwEl) gwEl.value = cfg.gatewayAtivo || "manual";
  const chkPag = document.getElementById("cfg-pagamento-ativo");
  if (chkPag) chkPag.checked = !!cfg.pagamentoAtivo;
  const chkCupom = document.getElementById("cfg-cupom-ativo");
  if (chkCupom) chkCupom.checked = !!cfg.cupomAtivo;
  const selParc = document.getElementById("cfg-parcelas-max");
  if (selParc) selParc.value = cfg.parcelasMax || "12";
  sv("cfg-msg-orcamento",    cfg.msgOrcamento    || "");
  const chkBannerEl = document.getElementById("cfg-promo-banner");
  if (chkBannerEl) chkBannerEl.checked = !!cfg.promoBanner;
  sv("cfg-promo-banner-txt", cfg.promoBannerTxt || "");
  sv("cfg-horario",          cfg.horario        || "");
  sv("cfg-ga4",              cfg.ga4Id          || "");
  sv("cfg-msg-confirmacao", cfg.msgConfirmacao || "");
  sv("cfg-msg-devolucao",   cfg.msgDevolucao   || "");
  sv("cfg-wpp-empresa", cfg.wppEmpresa || "");
  sv("cfg-instagram",   cfg.instagram  || "");
  sv("cfg-facebook",    cfg.facebook   || "");
  sv("cfg-tiktok",      cfg.tiktok     || "");
  // Renderizar depoimentos e cobertura
  renderDepsAdmin();
  const cobDesc2 = document.getElementById("cfg-cobertura-desc");
  const cobCids2 = document.getElementById("cfg-cidades");
  if (cobDesc2) cobDesc2.value = cfg.coberturaDesc || "";
  if (cobCids2) cobCids2.value = (cfg.cidades || []).join("\n");
  // Toggle de link de confirmação
  const chkLink = document.getElementById("cfg-link-confirmacao");
  if (chkLink) chkLink.checked = !!cfg.linkConfirmacao;
}
window.aplicarCfg = aplicarCfg;

// ─── Cores / paleta ───────────────────────────────────────────────────────────
window.prevCor = function (k, v) {
  const map = { p: "--p", d: "--pd", l: "--pl", bg: "--bg" };
  document.documentElement.style.setProperty(map[k], v);
  const b = el("box-" + k); if (b) b.style.background = v;
  const h = el("cor-" + k + "-hex"); if (h) h.value = v;
};

window.hexCor = function (k, v) {
  if (/^#[0-9a-f]{6}$/i.test(v)) { const i = el("cor-" + k); if (i) i.value = v; window.prevCor(k, v); }
};

window.paleta = function (p, d, l, bg, el2) {
  document.querySelectorAll(".swatch").forEach(s => s.classList.remove("on"));
  if (el2) el2.classList.add("on");
  [["p", p], ["d", d], ["l", l], ["bg", bg]].forEach(([k, v]) => {
    sv("cor-" + k, v); sv("cor-" + k + "-hex", v);
    const b = el("box-" + k); if (b) b.style.background = v;
    const map = { p: "--p", d: "--pd", l: "--pl", bg: "--bg" };
    document.documentElement.style.setProperty(map[k], v);
  });
};

// ─── Upload logo ──────────────────────────────────────────────────────────────
window.uploadLogo = function (inp) {
  const f = inp.files[0]; if (!f) return;
  if (f.size > 2 * 1024 * 1024) { notif("Max 2MB!", true); return; }
  const r = new FileReader();
  r.onload = e => {
    cfg.logo = e.target.result;
    localStorage.setItem("k_logo", cfg.logo);
    if (el("cfg-logo-prev")) el("cfg-logo-prev").innerHTML = `<img src="${cfg.logo}" style="width:100%;height:100%;object-fit:cover">`;
    notif("Logo carregada! Salve.");
  };
  r.readAsDataURL(f);
};

// ─── Salvar configurações gerais ──────────────────────────────────────────────
window.salvarCfg = async function () {
  cfg.nome          = gv("cfg-nome")            || "KATRESELI decorações";
  cfg.slogan        = gv("cfg-slogan")          || "";
  cfg.cor           = gv("cor-p-hex")           || cfg.cor;
  cfg.corD          = gv("cor-d-hex")           || cfg.corD;
  cfg.corL          = gv("cor-l-hex")           || cfg.corL;
  cfg.corBg         = gv("cor-bg-hex")          || cfg.corBg;
  cfg.razao       = gv("cfg-razao")       || "";
  cfg.cnpj        = gv("cfg-cnpj")        || "";
  cfg.endEmpresa  = gv("cfg-end-empresa") || "";
  cfg.responsavel  = gv("cfg-responsavel") || "";
  cfg.endereco       = gv("cfg-endereco")         || "";
  cfg.pixKey         = gv("cfg-pix-key-fin") || gv("cfg-pix-key-gw") || gv("cfg-pix-key") || "";
  cfg.pixNome        = gv("cfg-pix-nome-gw") || gv("cfg-pix-nome")        || "";
  cfg.taxaParcela    = parseFloat(gv("cfg-taxa-parcela")) || 2.99;
  cfg.parcelasMax    = parseInt(document.getElementById("cfg-parcelas-max")?.value) || 12;
  cfg.redirectUrl    = gv("cfg-redirect-url") || gv("cfg-infinitepay-webhook") && `${location.origin}/cliente.html` || "";
  cfg.gatewayAtivo   = document.getElementById("cfg-gateway-selecionado")?.value || "manual";
  cfg.infinitepayHandle  = gv("cfg-infinitepay-handle") || "";
  cfg.infinitepayWebhook = gv("cfg-infinitepay-webhook") || "";
  cfg.infinitepayRedirect = gv("cfg-redirect-url") || "";
  const chkPagAtivo  = document.getElementById("cfg-pagamento-ativo");
  cfg.pagamentoAtivo = chkPagAtivo ? chkPagAtivo.checked : false;
  const chkCupomAtivo = document.getElementById("cfg-cupom-ativo");
  cfg.cupomAtivo = chkCupomAtivo ? chkCupomAtivo.checked : false;
  cfg.msgOrcamento    = gv("cfg-msg-orcamento")    || "";
  const chkBanner = document.getElementById("cfg-promo-banner");
  cfg.promoBanner    = chkBanner ? chkBanner.checked : false;
  cfg.promoBannerTxt = gv("cfg-promo-banner-txt") || "";
  cfg.horario        = gv("cfg-horario")           || "";
  cfg.ga4Id          = gv("cfg-ga4")               || "";
  cfg.msgConfirmacao = gv("cfg-msg-confirmacao")  || "";
  cfg.msgDevolucao   = gv("cfg-msg-devolucao")   || "";
  cfg.wppEmpresa   = gv("cfg-wpp-empresa")  || "";
  cfg.instagram    = gv("cfg-instagram")    || "";
  cfg.facebook     = gv("cfg-facebook")     || "";
  cfg.tiktok        = gv("cfg-tiktok")        || "";
  cfg.coberturaDesc = gv("cfg-cobertura-desc") || "";
  const cidadesRaw  = document.getElementById("cfg-cidades")?.value || "";
  cfg.cidades       = cidadesRaw.split("\n").map(s=>s.trim()).filter(Boolean);
  cfg.sidebarTema   = localStorage.getItem("k_sb_tema") || "";
  const chkLinkSave = document.getElementById("cfg-link-confirmacao");
  cfg.linkConfirmacao = chkLinkSave ? chkLinkSave.checked : false;
  if (cfg.logo) localStorage.setItem("k_logo", cfg.logo);
  // Remover credenciais sensíveis do objeto público
  const s = { ...cfg }; delete s.logo;
  delete s.mpToken; delete s.mpPubKey; delete s.pagsToken;
  delete s.pagsEmail; delete s.stripeSecret; delete s.stripePubKey;
  delete s.infinitpayHandle; // handle vai para documento privado
  const credSensiveis = {
    mpToken:           gv("cfg-mp-token")           || "",
    mpPubKey:          gv("cfg-mp-pubkey")           || "",
    pagsToken:         gv("cfg-pags-token")          || "",
    pagsEmail:         gv("cfg-pags-email")          || "",
    stripeSecret:      gv("cfg-stripe-secret")       || "",
    stripePubKey:      gv("cfg-stripe-pubkey")       || "",
    infinitpayHandle:  (gv("cfg-infinitpay-handle") || "").replace(/^[@$]/,"").trim(),
    infinitpayToken:   gv("cfg-infinitpay-token")   || "",
    infinitpayLink:    gv("cfg-infinitpay-link")     || "",
  };
  try {
    await setDoc(doc(db, "config", "app"), s);
    // Salvar credenciais sensíveis em documento separado — só admin lê
    await setDoc(doc(db, "config", "pagamento_privado"), credSensiveis);
    // Atualizar cache local com credenciais
    Object.assign(cfg, credSensiveis);
    aplicarCfg();
    notif("Salvo!");
  } catch (e) { notif("Erro: " + e.message, true); }
};

// ─── Contratos ────────────────────────────────────────────────────────────────
window.tabCtr = function (t, chip) {
  document.querySelectorAll(".chips .chip").forEach(c => c.classList.remove("on"));
  chip.classList.add("on");
  if (el("ctr-aluguel")) el("ctr-aluguel").style.display = t === "aluguel"  ? "" : "none";
  if (el("ctr-mont"))    el("ctr-mont").style.display    = t === "montagem" ? "" : "none";
};

window.salvarCtr = async function () {
  cfg.clausAluguel = gv("cfg-cl-aluguel");
  cfg.rodAluguel   = gv("cfg-rod-aluguel");
  cfg.clausMont    = gv("cfg-cl-mont");
  cfg.rodMont      = gv("cfg-rod-mont");
  cfg.hora         = parseFloat(gv("cfg-hora")) || 0;
  const s = { ...cfg }; delete s.logo;
  try { await setDoc(doc(db, "config", "app"), s); notif("Contratos salvos!"); }
  catch (e) { notif("Erro: " + e.message, true); }
};

// ─── Metas ────────────────────────────────────────────────────────────────────
window.salvarMeta = async function () {
  const m = { fat: parseFloat(gv("meta-fat")) || 0, loc: parseInt(gv("meta-loc")) || 0, cli: parseInt(gv("meta-cli")) || 0 };
  setMetas(m);
  await setDoc(doc(db, "config", "metas"), m);
  closeModal("modal-meta");
  notif("Metas salvas!");
  window.renderDash?.();
};

// ─── Filtros ──────────────────────────────────────────────────────────────────
// ─── Gateway de pagamento ─────────────────────────────────────────────────────
window.selecionarGateway = function(gw) {
  // Highlight do card selecionado
  document.querySelectorAll(".gw-card").forEach(c => {
    c.style.borderColor = "var(--bdr2)";
    c.style.background  = "";
  });
  const sel = document.getElementById("gw-" + gw);
  if (sel) { sel.style.borderColor = "var(--p)"; sel.style.background = "var(--pl)"; }

  // Mostrar formulário correto
  document.querySelectorAll(".gw-form").forEach(f => f.style.display = "none");
  const form = document.getElementById("form-" + gw);
  if (form) form.style.display = "";

  // Mostrar parcelas para gateways que suportam
  const parcSec = document.getElementById("cfg-parcelas-section");
  if (parcSec) parcSec.style.display = gw === "manual" ? "none" : "";

  // Salvar gateway selecionado
  const selInput = document.getElementById("cfg-gateway-selecionado");
  if (selInput) selInput.value = gw;
  window._gwAtivo = gw;
  salvarCfgDebounce();
};

window.carregarGatewayUI = function() {
  const gw = document.getElementById("cfg-gateway-selecionado")?.value || "manual";
  window.selecionarGateway(gw);
};

window.atualizarPreviewParcelas = function() {
  const div  = document.getElementById("cfg-parcelas-grid");
  const prev = document.getElementById("cfg-parcelas-preview");
  if (!div || !prev) return;
  const maxParc = parseInt(document.getElementById("cfg-parcelas-max")?.value) || 12;
  const taxa    = parseFloat(document.getElementById("cfg-taxa-parcela")?.value) || 0;
  const base    = 300;
  prev.style.display = "";
  div.innerHTML = Array.from({length: maxParc}, (_, i) => {
    const n = i + 1;
    if (n === 1) return `<div style="font-size:11px;padding:4px 8px;background:#f0fdf4;border-radius:6px;color:#15803d;font-weight:600">À vista: R$ 300,00</div>`;
    const fator = Math.pow(1 + taxa / 100, n);
    const total = base * fator;
    const parc  = total / n;
    return `<div style="font-size:11px;padding:4px 8px;background:var(--bg);border-radius:6px;border:1px solid var(--bdr)"><b>${n}x</b> R$ ${parc.toFixed(2).replace(".",",")} <span style="color:var(--txt3)">(R$ ${total.toFixed(2).replace(".",",")})</span></div>`;
  }).join("");
};

window.setF = function (tipo, val, chip) {
  setFiltro(tipo, val);

  // Suporte ao sistema antigo de chips com classe .chip dentro de .chips
  const oldChips = chip?.closest?.(".chips");
  if (oldChips) {
    oldChips.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
    chip.classList.add("on");
  }

  if (tipo === "loc")  window.renderLoc?.();
  if (tipo === "item") window.renderItens?.();
  if (tipo === "dec")  window.renderDecs?.();
};

// ─── Exportar ─────────────────────────────────────────────────────────────────
window.expCSV = function () {
  const h = ["ID","Cliente","Evento","Retirada","Devolução","Total","Entrada","Saldo","Tipo","Status"];
  const rows = locacoes.map(l => {
    const c = clis.find(x => x.id === l.clienteId);
    return [l.id, c?.nome || "", l.evento || "", l.retirada, l.devolucao, l.total, l.entrada || 0, l.saldo || 0, l.tipo || "aluguel", l.status];
  });
  dl("locacoes.csv", [h, ...rows].map(r => r.join(",")).join("\n"));
  notif("Exportado!");
};

window.expItensCSV = function () {
  const h = ["Nome","Categoria","Custo","Aluguel","Qtd","Estado","Tags","Obs"];
  const rows = its.map(i => [
    `"${(i.nome||"").replace(/"/g,'""')}"`,
    `"${(i.categoria||"").replace(/"/g,'""')}"`,
    (i.custo||0).toFixed(2).replace(".",","),
    (i.aluguel||0).toFixed(2).replace(".",","),
    i.qtd||0,
    `"${(i.estado||"").replace(/"/g,'""')}"`,
    `"${(Array.isArray(i.tags) ? i.tags.join(",") : (i.tags||"")).replace(/"/g,'""')}"`,
    `"${(i.obs||"").replace(/"/g,'""')}"`,
  ].join(";"));
  dl("itens_" + new Date().toISOString().split("T")[0] + ".csv", "\uFEFF" + [h.join(";"), ...rows].join("\n"));
  notif("Itens exportados!");
};

window.expCliCSV = function () {
  const h = ["Nome","CPF","Telefone","Email","Endereço"];
  const rows = clis.map(c => [c.nome, c.cpf, c.tel, c.email, c.end]);
  dl("clientes.csv", [h, ...rows].map(r => r.join(",")).join("\n"));
  notif("Exportado!");
};

window.backup = function () {
  dl(
    "backup_" + new Date().toISOString().split("T")[0] + ".json",
    JSON.stringify({ itens: its, clientes: clis, locacoes }, null, 2)
  );
  notif("Backup feito!");
};

// ─── Importar itens por CSV/TXT ───────────────────────────────────────────────
window.baixarModeloItens = function () {
  const linhas = [
    "nome;categoria;custo;aluguel;qtd;estado;tags;obs",
    "Balao dourado;Acessorio;5.00;15.00;10;Otimo;festa,dourado,infantil;Inflar antes do evento",
    "Mesa rustica;Mobiliario;80.00;120.00;2;Bom;mesa,rustica;Acompanha toalha de juta",
    "Painel floral;Cenario;150.00;200.00;1;Otimo;painel,floral,fundo;",
    "Lustre pendente;Iluminacao;60.00;90.00;3;Otimo;lustre,luz,pendente;Verificar voltagem",
    "Taca acrilica;Utensilio;8.00;20.00;20;Regular;taca,acrilica;Higienizar apos uso",
  ];
  dl("modelo_itens.csv", linhas.join("\n"));
  notif("Modelo baixado! Edite e importe.");
};

window.abrirImportItens = function () {
  let modal = el("modal-import-itens");
  if (!modal) {
    const div = document.createElement("div");
    div.id = "modal-import-itens";
    div.className = "ov";
    div.innerHTML = `
      <div class="modal" style="max-width:500px">
        <div class="modal-hd">
          <span style="font-size:1.1rem;font-weight:700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 12 15 15"/><line x1="12" y1="12" x2="12" y2="18"/></svg> Importar itens</span>
          <button class="cls" onclick="closeModal('modal-import-itens')">&times;</button>
        </div>
        <div class="modal-bd">
          <div style="background:var(--pl);border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;color:var(--pd);line-height:1.7">
            <strong>Formato aceito: CSV ou TXT</strong><br>
            Separador: <code>;</code> ou <code>,</code><br>
            Com cabecalho: <code>nome;categoria;custo;aluguel;qtd;estado;tags;obs</code><br>
            <span style="font-size:11px;color:var(--txt2)">Apenas <strong>nome</strong> e obrigatorio. Use <strong>Baixar modelo</strong> para ver o formato.</span>
          </div>
          <div class="field" style="margin-bottom:10px">
            <label class="lbl">Categorias disponíveis</label>
            <div id="import-cats-list" style="font-size:12px;color:var(--txt2);padding:4px 0"></div>
          </div>
          <div class="field">
            <label class="lbl">Selecione o arquivo (.csv ou .txt)</label>
            <input type="file" accept=".csv,.txt" onchange="importarItensArquivo(this)"
              style="display:block;width:100%;padding:10px;border:1.5px dashed var(--bdr2);border-radius:9px;font-size:13px;cursor:pointer;background:var(--bg);margin-top:4px">
          </div>
          <div style="font-size:11px;color:var(--txt3);margin-top:10px">
            <i class="ti ti-info-circle"></i> Itens duplicados serao adicionados normalmente.
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);
    div.addEventListener("click", e => { if (e.target === div) div.classList.remove("on"); });
    modal = div;
  }
  const catsEl = el("import-cats-list"); if (catsEl) catsEl.textContent = categorias.join(" · ");
  modal.classList.add("on");
};

window.importarItensArquivo = function (input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const texto   = e.target.result;
    const linhas  = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!linhas.length) { notif("Arquivo vazio!", true); return; }

    const sep       = linhas[0].includes(";") ? ";" : linhas[0].includes("\t") ? "\t" : ",";
    const cabecalho = linhas[0].split(sep).map(c => c.trim().toLowerCase().replace(/[^a-z]/g, ""));
    const idx = {
      nome:      cabecalho.findIndex(c => c.includes("nome")),
      categoria: cabecalho.findIndex(c => c.includes("categ")),
      estado:    cabecalho.findIndex(c => c.includes("estado")),
      custo:     cabecalho.findIndex(c => c.includes("custo")),
      aluguel:   cabecalho.findIndex(c => c.includes("aluguel") || c.includes("valor")),
      pct:       cabecalho.findIndex(c => c.includes("pct") || c.includes("percent")),
      qtd:       cabecalho.findIndex(c => c.includes("qtd") || c.includes("quant")),
      tags:      cabecalho.findIndex(c => c.includes("tag")),
      obs:       cabecalho.findIndex(c => c.includes("obs")),
    };

    const temCabecalho = idx.nome >= 0;
    const dataLinhas   = temCabecalho ? linhas.slice(1) : linhas;
    let importados = 0, erros = 0;

    const promises = dataLinhas.map(async linha => {
      const cols = linha.split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
      let nome, categoria, estado, custo, aluguel, pct, qtd, tags, obs;

      if (temCabecalho) {
        nome      = idx.nome >= 0      ? cols[idx.nome]      : "";
        categoria = idx.categoria >= 0 ? cols[idx.categoria] : categorias[0];
        estado    = idx.estado >= 0    ? cols[idx.estado]    : "Otimo";
        custo     = parseFloat((idx.custo >= 0   ? cols[idx.custo]   : "0") || "0") || 0;
        aluguel   = parseFloat((idx.aluguel >= 0 ? cols[idx.aluguel] : "0") || "0") || 0;
        pct       = parseFloat((idx.pct >= 0     ? cols[idx.pct]     : "30") || "30") || 30;
        qtd       = parseInt((idx.qtd >= 0       ? cols[idx.qtd]     : "1")  || "1")  || 1;
        tags      = idx.tags >= 0 ? cols[idx.tags] : "";
        obs       = idx.obs >= 0  ? cols[idx.obs]  : "";
      } else {
        nome      = cols[0] || ""; categoria = cols[1] || categorias[0];
        custo     = parseFloat(cols[2]) || 0; aluguel = parseFloat(cols[3]) || 0;
        qtd       = parseInt(cols[4])   || 1; estado  = cols[5] || "Otimo";
        tags      = cols[6] || "";            obs     = cols[7] || "";
        pct       = custo > 0 && aluguel > 0 ? parseFloat(((aluguel / custo) * 100).toFixed(0)) : 30;
      }

      if (!nome) { erros++; return; }
      const catNorm = categorias.find(c => c.toLowerCase() === (categoria || "").toLowerCase()) || categorias[0];
      const dados = {
        nome, categoria: catNorm, estado: estado || "Otimo",
        custo, aluguel, lucro: aluguel, pct, qtd,
        tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
      };
      try { await addDoc(collection(db, "itens"), dados); importados++; } catch { erros++; }
    });

    Promise.all(promises).then(() => {
      notif(`Importado: ${importados} itens${erros ? " | " + erros + " erro(s)" : ""}!`, erros > 0 && importados === 0);
      input.value = "";
      closeModal("modal-import-itens");
    });
  };
  reader.readAsText(file, "UTF-8");
};

// ─── Dark mode ────────────────────────────────────────────────────────────────
function _applyDark(dark) {
  document.body.classList.toggle("dark", dark);
  document.body.classList.toggle("light", !dark);
  const ico = document.getElementById("dark-ico");
  const lbl = document.getElementById("dark-lbl");
  if (ico) ico.className = dark ? "ti ti-sun" : "ti ti-moon";
  if (lbl) lbl.textContent = dark ? "Modo claro" : "Modo escuro";
}

window.toggleDark = function () {
  const dark = !document.body.classList.contains("dark");
  _applyDark(dark);
  // "auto" = seguir sistema, "1" = forçar dark, "0" = forçar light
  localStorage.setItem("k_dark", dark ? "1" : "0");
};

(function initDark() {
  const saved = localStorage.getItem("k_dark");
  if (saved === "1") {
    _applyDark(true);
  } else if (saved === "0") {
    _applyDark(false);
  } else {
    // Sem preferência salva → seguir o sistema
    const prefDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    _applyDark(prefDark);
    // Escutar mudanças de tema do sistema em tempo real
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
      if (localStorage.getItem("k_dark") === null ||
          localStorage.getItem("k_dark") === "auto") {
        _applyDark(e.matches);
      }
    });
  }
})();

// ─── Cor do menu (sidebar) ────────────────────────────────────────────────────
window.setSbTema = function (gradient, el2) {
  document.documentElement.style.setProperty("--sidebar", gradient);
  document.querySelectorAll(".sb-tema").forEach(s => s.classList.remove("on"));
  if (el2) el2.classList.add("on");
  localStorage.setItem("k_sb_tema", gradient);
  cfg.sidebarTema = gradient;
  // Atualizar preview
  const prev = document.getElementById("sb-tema-preview");
  if (prev) prev.style.background = gradient;
};

// ─── Cor personalizada do menu ────────────────────────────────────────────────
window.setSbTemaCustom = function(cor) {
  // Gerar gradiente escuro a partir da cor escolhida
  const r = parseInt(cor.slice(1,3),16);
  const g = parseInt(cor.slice(3,5),16);
  const b = parseInt(cor.slice(5,7),16);
  const dark  = `rgb(${Math.round(r*.3)},${Math.round(g*.3)},${Math.round(b*.3)})`;
  const mid   = `rgb(${Math.round(r*.55)},${Math.round(g*.55)},${Math.round(b*.55)})`;
  const light = cor;
  const gradient = `linear-gradient(160deg,${dark} 0%,${mid} 55%,${light} 100%)`;
  document.documentElement.style.setProperty("--sidebar", gradient);
  document.querySelectorAll(".sb-tema").forEach(s => s.classList.remove("on"));
  const customBtn = document.getElementById("sb-tema-custom");
  if (customBtn) {
    customBtn.classList.add("on");
    customBtn.style.background = gradient;
  }
  localStorage.setItem("k_sb_tema", gradient);
  cfg.sidebarTema = gradient;
  const prev = document.getElementById("sb-tema-preview");
  if (prev) prev.style.background = gradient;
};

(function initSbTema() {
  const saved = localStorage.getItem("k_sb_tema");
  if (saved) {
    document.documentElement.style.setProperty("--sidebar", saved);
    document.querySelectorAll(".sb-tema").forEach(s => {
      s.classList.remove("on");
      const bg = s.style.background;
      if (saved.includes(bg.replace(/\s/g,"").slice(0,12))) s.classList.add("on");
    });
  }
})();

// ─── Debounce para salvar redes sociais ───────────────────────────────────────
let _cfgDebTimer = null;
window.salvarCfgDebounce = function () {
  clearTimeout(_cfgDebTimer);
  _cfgDebTimer = setTimeout(() => window.salvarCfg?.(), 1200);
};

// ─── Feedback visual ao devolver/confirmar ────────────────────────────────────
window.animRowSuccess = function (id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (row) { row.classList.add("row-success"); setTimeout(() => row.remove(), 600); }
};
window.animRowConfirm = function (id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (row) row.classList.add("row-confirm");
  setTimeout(() => row?.classList.remove("row-confirm"), 500);
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEPOIMENTOS + COBERTURA
// ═══════════════════════════════════════════════════════════════════════════════
function renderDepsAdmin() {
  const lista = document.getElementById("deps-lista");
  if (!lista) return;
  const deps = cfg.depoimentos || [];
  lista.innerHTML = deps.length
    ? deps.map((d,i) => `
      <div style="background:var(--bg);border-radius:10px;padding:10px 12px;margin-bottom:8px;border:1.5px solid var(--bdr2);display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--txt)">${d.nome} · ${"⭐".repeat(d.nota||5)}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:3px">${d.texto}</div>
          ${d.evento ? `<div style="font-size:11px;color:var(--txt3)">${d.evento}</div>` : ""}
        </div>
        <button onclick="removerDepoimento(${i})" style="background:none;border:none;color:#be123c;cursor:pointer;font-size:16px;padding:0;flex-shrink:0"><i class="ti ti-trash"></i></button>
      </div>`) .join("")
    : `<div style="font-size:12px;color:var(--txt3);padding:8px 0">Nenhum depoimento ainda.</div>`;
}

window.addDepoimento = function() {
  const ov = document.createElement("div");
  ov.className = "ov on ov-top";
  ov.innerHTML = `<div class="modal modal-sm">
    <div class="modal-h"><h3>⭐ Novo depoimento</h3><button class="mclose" onclick="this.closest('.ov').remove()"><i class="ti ti-x"></i></button></div>
    <div class="modal-b">
      <div class="fg"><label>Nome da cliente</label><input id="dep-nome" placeholder="Ex: Maria Silva"></div>
      <div class="fg"><label>Evento</label><input id="dep-evento" placeholder="Ex: Aniversário da Isa"></div>
      <div class="fg"><label>Nota (1-5 ⭐)</label><input id="dep-nota" type="number" min="1" max="5" value="5"></div>
      <div class="fg"><label>Depoimento</label><textarea id="dep-texto" rows="3" placeholder="O que a cliente disse..."></textarea></div>
    </div>
    <div class="modal-f">
      <button class="btn btn-s" onclick="this.closest('.ov').remove()">Cancelar</button>
      <button class="btn btn-p" onclick="salvarDepoimento()">Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
};

window.salvarDepoimento = async function() {
  const nome  = document.getElementById("dep-nome")?.value?.trim();
  const texto = document.getElementById("dep-texto")?.value?.trim();
  if (!nome || !texto) { notif("Preencha nome e depoimento!", true); return; }
  const dep = {
    nome,
    texto,
    evento: document.getElementById("dep-evento")?.value?.trim() || "",
    nota:   parseInt(document.getElementById("dep-nota")?.value) || 5,
  };
  cfg.depoimentos = [...(cfg.depoimentos || []), dep];
  const s = { ...cfg }; delete s.logo;
  try {
    await setDoc(doc(db, "config", "app"), s);
    renderDepsAdmin();
    document.querySelector(".ov.on")?.remove();
    notif("Depoimento salvo!");
  } catch(e) { notif("Erro: " + e.message, true); }
};

window.removerDepoimento = async function(idx) {
  if (!await window.confirmar({ titulo:"Remover depoimento", msg:"Deseja remover este depoimento do catálogo?", tipo:"danger", labelOk:"Remover" })) return;
  cfg.depoimentos = (cfg.depoimentos || []).filter((_,i) => i !== idx);
  const s = { ...cfg }; delete s.logo;
  try {
    await setDoc(doc(db, "config", "app"), s);
    renderDepsAdmin();
    notif("Depoimento removido.");
  } catch(e) { notif("Erro: " + e.message, true); }
};

// Renderização de depoimentos/cobertura integrada diretamente em aplicarCfg
// (chamado via hook no final do arquivo — sem wrapper para evitar loop)

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE BANNER + CACHE LOCAL DE DADOS
// ═══════════════════════════════════════════════════════════════════════════════
(function initOffline() {
  let _offline = false;

  function mostrarBanner(sim) {
    _offline = sim;
    const b = document.getElementById("offline-banner");
    if (!b) return;
    b.style.display = sim ? "flex" : "none";
    const tb = document.querySelector(".topbar");
    if (tb) tb.style.marginTop = sim ? "44px" : "";
  }

  // Verificar conectividade real (não só navigator.onLine)
  async function verificarConexao() {
    if (!navigator.onLine) { mostrarBanner(true); return; }
    try {
      // Testa com fetch ao Firebase (já usado pelo sistema)
      const r = await fetch("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js",
        { method:"HEAD", cache:"no-store", mode:"no-cors" });
      mostrarBanner(false);
    } catch(_) {
      mostrarBanner(true);
    }
  }

  window.addEventListener("online",  () => mostrarBanner(false));
  window.addEventListener("offline", () => mostrarBanner(true));

  // Só verifica após 2s para não disparar no carregamento inicial
  setTimeout(verificarConexao, 2000);
})();

// ─── Cache local: salvar locações/clientes no localStorage ───────────────────
export function salvarCacheLocal(chave, dados) {
  try {
    localStorage.setItem("cache_" + chave, JSON.stringify({
      ts: Date.now(),
      dados
    }));
  } catch(_) {}
}

export function lerCacheLocal(chave, maxIdadeMin = 30) {
  try {
    const raw = localStorage.getItem("cache_" + chave);
    if (!raw) return null;
    const { ts, dados } = JSON.parse(raw);
    const idadeMin = (Date.now() - ts) / 60000;
    if (idadeMin > maxIdadeMin) return null;
    return dados;
  } catch(_) { return null; }
}
window.salvarCacheLocal = salvarCacheLocal;
window.lerCacheLocal    = lerCacheLocal;

// ── Abas Pix / Checkout no painel de pagamentos ───────────────────────────────
window.trocarTabPag = function(aba) {
  const isPix = aba === "pix";
  const pixContent      = document.getElementById("tab-pix-content");
  const checkoutContent = document.getElementById("tab-checkout-content");
  const pixBtn          = document.getElementById("tab-pix-btn");
  const checkoutBtn     = document.getElementById("tab-checkout-btn");
  const infoPix         = document.getElementById("info-pix-box");

  if (pixContent)      pixContent.style.display      = isPix ? "" : "none";
  if (checkoutContent) checkoutContent.style.display  = isPix ? "none" : "";
  if (infoPix)         infoPix.style.display          = isPix ? "" : "none";

  const pStyle = "padding:7px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;border:1.5px solid";
  if (pixBtn)      pixBtn.style.cssText      = pStyle + (isPix ? " var(--p);background:var(--p);color:#fff"       : " var(--bdr2);background:var(--bg);color:var(--txt2)");
  if (checkoutBtn) checkoutBtn.style.cssText = pStyle + (!isPix ? " var(--p);background:var(--p);color:#fff" : " var(--bdr2);background:var(--bg);color:var(--txt2)");

  // Salvar aba ativa na config
  const gwEl = document.getElementById("cfg-gateway-selecionado");
  if (gwEl) gwEl.value = isPix ? "pix" : "infinitepay";
  salvarCfgDebounce?.();
};

// ── Testar conexão com Infinite Pay via Pipedream ──────────────────────────────
window.testarInfinitePay = async function() {
  const handle  = document.getElementById("cfg-infinitepay-handle")?.value?.trim();
  const webhook = document.getElementById("cfg-infinitepay-webhook")?.value?.trim();
  const statusEl = document.getElementById("cfg-infinitepay-status");

  if (!handle || !webhook) {
    if (statusEl) {
      statusEl.style.display = "";
      statusEl.style.background = "#fef2f2";
      statusEl.style.color = "#dc2626";
      statusEl.innerHTML = "⚠️ Preencha a InfiniteTag e a URL do Pipedream antes de testar.";
    }
    return;
  }

  if (statusEl) {
    statusEl.style.display = "";
    statusEl.style.background = "#f0f9ff";
    statusEl.style.color = "#0369a1";
    statusEl.innerHTML = '<i class="ti ti-loader" style="animation:spin .7s linear infinite"></i> Testando conexão...';
  }

  try {
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "criar_link",
        locId:  "TESTE00",
        valor:  1,
        tipo:   "total",
        evento: "Teste de conexão",
        cliente: { nome: "Teste", email: "teste@katreseli.com.br", tel: "" },
      }),
    });
    const data = await resp.json();
    if (data?.url) {
      if (statusEl) {
        statusEl.style.background = "#f0fdf4";
        statusEl.style.color = "#15803d";
        statusEl.innerHTML = "✅ Conexão OK! Infinite Pay respondeu corretamente.";
      }
    } else {
      throw new Error(data?.erro || "URL não retornada");
    }
  } catch(e) {
    if (statusEl) {
      statusEl.style.background = "#fef2f2";
      statusEl.style.color = "#dc2626";
      statusEl.innerHTML = `❌ Erro: ${e.message}`;
    }
  }
};

// ── Abas da página de Pagamentos ─────────────────────────────────────────────
window.mudarAbaPag = function(aba) {
  const abas = ["transacoes","comprovantes","manual","recibos"];
  abas.forEach(a => {
    const content = document.getElementById(`pag-content-${a}`);
    const btn     = document.getElementById(`pag-aba-${a}`);
    const ativo   = a === aba;
    if (content) content.style.display = ativo ? "" : "none";
    if (btn) {
      btn.classList.toggle("pag-tab-on", ativo);
    }
  });
  if (aba === "transacoes")   { window.renderTransacoes?.(); }
  if (aba === "comprovantes") { window.renderComprovantesAdmin?.(); }
  if (aba === "manual")       { window.renderManualLoc?.(); window.renderManualHistorico?.(); }
  if (aba === "recibos")      { window.renderRecibos?.(); }
};

// ─── Inicializar página de pagamentos ─────────────────────────────────────────
window._initPagamentos = function() {
  // Pré-selecionar mês atual no filtro
  const mesEl = document.getElementById("pag-filtro-mes");
  if (mesEl && mesEl.value === "") {
    mesEl.value = new Date().getMonth().toString();
  }
  // Data de hoje no formulário manual
  const dataEl = document.getElementById("pag-manual-data");
  if (dataEl && !dataEl.value) {
    dataEl.value = new Date().toISOString().slice(0,10);
  }
  window.renderTransacoes?.();
  window.renderComprovantesAdmin?.();
};
