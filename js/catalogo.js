/**
 * catalogo.js — Catálogo público de kits de decoração
 * Galeria de fotos, disponibilidade de datas, status de locação
 */
import { decoracoes, locacoes, cfg } from "./state.js";
import { fmtR }                      from "./helpers.js";

window.gerarCatalogo = function() {
  const kits = decoracoes.filter(d => d.status !== "inativo" && d.status !== "Em manutencao");
  if (!kits.length) { window.notif?.("Nenhum kit disponível!", true); return; }

  const cor    = cfg.cor    || "#d4307a";
  const corD   = cfg.corD   || "#a0235c";
  const corL   = cfg.corL   || "#fce4f3";
  const nome   = cfg.nome   || "Katreseli";
  const slogan = cfg.slogan || "Locações de Decoração Infantil";
  const logo   = cfg.logo   || "";
  const endEmp = cfg.endEmpresa || "";
  const cnpj   = cfg.cnpj   || "";
  const telWpp = (cfg.wppEmpresa || "").replace(/\D/g,"").slice(-11) ||
                 (cfg.rodAluguel || "").replace(/\D/g,"").slice(-11);

  const temas = [...new Set(kits.map(k => k.tema || "Geral"))].sort();

  const fmtV = v => "R$ " + (parseFloat(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtD = ds => { if(!ds)return"?"; const[y,m,d]=ds.split("-"); return`${d}/${m}/${y}`; };

  // ── Calcular períodos ocupados por kit ──
  const hoje = new Date().toISOString().split("T")[0];
  const ocupados = {}; // kitId → [{ret, dev}]
  locacoes.forEach(l => {
    if (l.status !== "ativo" && l.status !== "orcamento") return;
    (l.itens || []).filter(i => i.tipo === "kit").forEach(i => {
      if (!ocupados[i.id]) ocupados[i.id] = [];
      if (l.retirada && l.devolucao) ocupados[i.id].push({ ret: l.retirada, dev: l.devolucao });
    });
  });

  // ── Gerar grid de disponibilidade (próximos 30 dias) para cada kit ──
  function gerarDisp(kitId) {
    const periodos = ocupados[kitId] || [];
    const dias = [];
    for (let d = 0; d < 30; d++) {
      const data = new Date(Date.now() + d * 864e5);
      const iso  = data.toISOString().split("T")[0];
      const ocupado = periodos.some(p => iso >= p.ret && iso <= p.dev);
      dias.push({ iso, dia: data.getDate(), ds: data.toLocaleDateString("pt-BR",{weekday:"short"}), ocupado });
    }
    return dias;
  }

  // ── Cards ──
  const cardsHtml = kits.map((k, ki) => {
    const tema     = k.tema || "Geral";
    const fotos    = (k.fotos && k.fotos.length) ? k.fotos : (k.foto ? [k.foto] : []);
    const temDesc  = (k.desconto || 0) > 0;
    const itensLista = (k.itensInclusos || []).filter(i=>i.tipo!=="kit").slice(0,5)
      .map(i=>`<span class="kit-item">${i.nome}</span>`).join("");
    const maisItens = Math.max(0, (k.itensInclusos||[]).filter(i=>i.tipo!=="kit").length - 5);
    const msgWpp = `Olá, ${nome}! 🎀 Tenho interesse no kit: *${k.nome}* (${fmtV(k.valorTotal)}). Poderia verificar a disponibilidade?`;
    const wppUrl = telWpp ? `https://wa.me/55${telWpp}?text=${encodeURIComponent(msgWpp)}` : "#";
    const dias   = gerarDisp(k.id);
    const estaAlugadoHoje = (ocupados[k.id]||[]).some(p => hoje >= p.ret && hoje <= p.dev);

    // Galeria de fotos
    const galeriaId = `gal-${ki}`;
    const galeriaHtml = fotos.length > 0 ? `
      <div class="galeria" id="${galeriaId}">
        <div class="gal-slides">
          ${fotos.map((f,i) => `<div class="gal-slide${i===0?" active":""}" data-idx="${i}">
            <img src="${f}" alt="${k.nome} - foto ${i+1}" loading="lazy">
          </div>`).join("")}
        </div>
        ${fotos.length > 1 ? `
        <button class="gal-btn gal-prev" onclick="galNav('${galeriaId}',-1)">‹</button>
        <button class="gal-btn gal-next" onclick="galNav('${galeriaId}',1)">›</button>
        <div class="gal-dots">${fotos.map((_,i)=>`<span class="gal-dot${i===0?" on":""}" onclick="galIr('${galeriaId}',${i})"></span>`).join("")}</div>` : ""}
      </div>` : `
      <div class="card-img-ph"><div style="font-size:60px;opacity:.3">🎀</div></div>`;

    // Mini calendário de disponibilidade
    const dispHtml = `
      <div class="disp-wrap">
        <div class="disp-title">📅 Disponibilidade — próximos 30 dias</div>
        <div class="disp-grid">
          ${dias.map(d => `<div class="disp-dia ${d.ocupado?"ocupado":"livre"}" title="${fmtD(d.iso)}">${d.dia}</div>`).join("")}
        </div>
        <div class="disp-leg"><span class="leg livre"></span>Livre <span class="leg ocupado"></span>Ocupado</div>
      </div>`;

    return `
  <div class="card${estaAlugadoHoje?" card-alugado":""}" data-tema="${tema.replace(/"/g,"")}" data-nome="${(k.nome||"").toLowerCase()} ${(k.desc||"").toLowerCase()} ${(k.tema||"").toLowerCase()}">
    <div class="card-img-wrap">
      ${galeriaHtml}
      ${estaAlugadoHoje ? '<div class="card-status-badge alugado">🔒 Alugado hoje</div>' : '<div class="card-status-badge livre">✅ Disponível</div>'}
      ${temDesc ? `<div class="card-desc-badge">−${fmtV(k.desconto)} OFF</div>` : ""}
    </div>
    <div class="card-body">
      <div class="card-tema">${tema}</div>
      <div class="card-nome">${k.nome}</div>
      ${k.desc ? `<div class="card-descricao">${k.desc}</div>` : ""}
      ${itensLista ? `<div class="card-itens">${itensLista}${maisItens>0?`<span class="kit-item kit-mais">+${maisItens}</span>`:""}</div>` : ""}
      ${dispHtml}
      <div class="card-footer">
        <div class="card-preco">
          ${temDesc ? `<div class="card-preco-cheio">${fmtV(k.valorCheio)}</div>` : ""}
          <div class="card-preco-val">${fmtV(k.valorTotal)}</div>
          <div class="card-preco-leg">/locação</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-left:auto">
          <button onclick="compartilharKit('${k.id}','${k.nome.replace(/'/g,'')}')" title="Compartilhar" style="width:34px;height:34px;border-radius:8px;border:1.5px solid #f0eaf4;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9a7aaa;font-size:16px;transition:all .15s" onmouseover="this.style.background='#fce4f3'" onmouseout="this.style.background='none'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
          <button onclick="toggleFav('${k.id}')" title="Favoritar" id="fav-${k.id}" style="width:34px;height:34px;border-radius:8px;border:1.5px solid #f0eaf4;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .15s" onmouseover="this.style.background='#fce4f3'" onmouseout="this.style.background='none'">
            ♡
          </button>
          ${telWpp ? `<a class="btn-orc" href="${wppUrl}" target="_blank">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.133 1.527 5.887L.057 23.996l6.304-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374A9.856 9.856 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118S21.882 6.533 21.882 12 17.467 21.882 12 21.882z"/></svg>
            Solicitar orçamento
          </a>` : ""}
        </div>
      </div>
    </div>
  </div>`;
  }).join("\n");

  // ── HTML completo ──
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Catálogo de Kits — ${nome}</title>
<meta name="description" content="${slogan} · ${kits.length} kits disponíveis">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--p:${cor};--pd:${corD};--pl:${corL}}
body{font-family:"Segoe UI",Arial,sans-serif;background:#f5f0f4;color:#1a0a14;min-height:100vh}

/* Header */
.hd{background:linear-gradient(135deg,${cor} 0%,${corD} 100%);color:#fff;padding:36px 20px 32px;text-align:center;position:relative;overflow:hidden}
.hd::after{content:"🎀";position:absolute;font-size:200px;opacity:.05;right:-30px;bottom:-40px;pointer-events:none;line-height:1}
.hd-logo{width:80px;height:80px;border-radius:50%;border:3px solid rgba(255,255,255,.5);object-fit:cover;margin-bottom:14px}
.hd-logo-ph{width:80px;height:80px;border-radius:50%;border:3px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);display:inline-flex;align-items:center;justify-content:center;font-size:34px;margin-bottom:14px}
.hd-nome{font-size:30px;font-weight:800;margin-bottom:5px}
.hd-slogan{font-size:14px;opacity:.85;margin-bottom:18px}
.hd-stats{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.hd-stat{background:rgba(255,255,255,.18);border-radius:20px;padding:6px 16px;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,.25)}

/* Filtros */
.filters{background:#fff;border-bottom:1px solid #ead8e8;padding:14px 20px;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(0,0,0,.07)}
.filters-inner{max-width:1140px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.search-wrap{flex:1;min-width:180px;position:relative}
.search-wrap svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#b0a0bc;pointer-events:none}
.search-wrap input{width:100%;padding:9px 12px 9px 36px;border-radius:10px;border:1.5px solid #e0d4e8;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s;background:#faf8fc;color:#1a0a14}
.search-wrap input:focus{border-color:var(--p)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:6px 14px;border-radius:20px;border:1.5px solid #e0d4e8;background:#faf8fc;font-size:12px;font-weight:500;cursor:pointer;color:#6b5a72;transition:all .15s;white-space:nowrap}
.chip.on,.chip:hover{background:var(--p);color:#fff;border-color:var(--p)}
.cnt-lbl{font-size:12px;color:#9a8aa8;white-space:nowrap;margin-left:auto}

/* Toggle disponibilidade */
.toggle-disp{display:flex;align-items:center;gap:6px;font-size:12px;color:#6b5a72;cursor:pointer;white-space:nowrap}
.toggle-disp input{accent-color:var(--p);width:14px;height:14px}

/* Grid */
.main{max-width:1140px;margin:0 auto;padding:24px 16px 60px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}

/* Card */
.card{background:#fff;border-radius:18px;overflow:hidden;border:1.5px solid #f0eaf4;transition:transform .18s,box-shadow .18s;display:flex;flex-direction:column}
.card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(180,60,120,.14)}
.card-alugado{opacity:.85;border-color:#fecdd3}

/* Galeria */
.card-img-wrap{position:relative;height:220px;background:var(--pl);overflow:hidden;flex-shrink:0}
.card-img-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.galeria{width:100%;height:100%;position:relative;overflow:hidden}
.gal-slides{display:flex;height:100%;transition:transform .35s ease}
.gal-slide{min-width:100%;height:100%}
.gal-slide img{width:100%;height:100%;object-fit:cover}
.gal-btn{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.42);color:#fff;border:none;width:32px;height:32px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;z-index:2;line-height:1}
.gal-btn:hover{background:rgba(0,0,0,.65)}
.gal-prev{left:8px}
.gal-next{right:8px}
.gal-dots{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:5px;z-index:2}
.gal-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.5);cursor:pointer;transition:all .2s}
.gal-dot.on{background:#fff;width:18px;border-radius:3px}

/* Badges */
.card-status-badge{position:absolute;top:10px;left:10px;font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;z-index:3}
.card-status-badge.livre{background:#dcfce7;color:#166534}
.card-status-badge.alugado{background:#fee2e2;color:#991b1b}
.card-desc-badge{position:absolute;top:10px;right:10px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;padding:3px 9px;border-radius:6px;z-index:3}

/* Body */
.card-body{padding:16px;display:flex;flex-direction:column;flex:1}
.card-tema{font-size:10px;font-weight:700;color:var(--p);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}
.card-nome{font-size:15px;font-weight:800;color:#1a0a14;margin-bottom:6px;line-height:1.3}
.card-descricao{font-size:12px;color:#7a6a82;margin-bottom:10px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-itens{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px}
.kit-item{font-size:10px;padding:2px 8px;border-radius:5px;background:var(--pl);color:var(--pd);font-weight:500}
.kit-mais{background:#f0edf4;color:#9a7ab8}

/* Disponibilidade */
.disp-wrap{background:#faf8fc;border-radius:10px;padding:10px;margin-bottom:12px;border:1px solid #f0eaf4}
.disp-title{font-size:10px;font-weight:700;color:var(--txt2, #6b5a72);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
.disp-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;margin-bottom:6px}
.disp-dia{aspect-ratio:1;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;cursor:default}
.disp-dia.livre{background:#dcfce7;color:#166534}
.disp-dia.ocupado{background:#fee2e2;color:#991b1b;text-decoration:line-through}
.disp-leg{display:flex;align-items:center;gap:8px;font-size:10px;color:#9a8aa8}
.leg{display:inline-block;width:10px;height:10px;border-radius:2px}
.leg.livre{background:#dcfce7}
.leg.ocupado{background:#fee2e2}

/* Footer card */
.card-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid #f5eff8}
.card-preco-cheio{font-size:11px;color:#bbb;text-decoration:line-through;margin-bottom:1px}
.card-preco-val{font-size:20px;font-weight:800;color:var(--p);line-height:1}
.card-preco-leg{font-size:10px;color:#9a8aa8;margin-top:1px}
.btn-orc{display:inline-flex;align-items:center;gap:6px;background:#16a34a;color:#fff;padding:9px 14px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none;transition:opacity .15s;white-space:nowrap;flex-shrink:0}
.btn-orc:hover{opacity:.85}

/* Vazio */
.empty{text-align:center;padding:60px 20px;color:#b0a0bc;display:none}
.empty p{font-size:15px;margin-top:12px}

/* Footer */
.ft{background:#1a0a14;color:#cbb8c8;text-align:center;padding:32px 20px;font-size:13px;line-height:1.9}
.ft strong{color:#fff;font-size:16px}
.ft-wpp{display:inline-flex;align-items:center;gap:8px;background:var(--p);color:#fff;padding:12px 24px;border-radius:12px;font-weight:700;text-decoration:none;margin-top:16px;font-size:14px;transition:opacity .15s}
.ft-wpp:hover{opacity:.88}

/* Mobile */
@media(max-width:620px){
  .hd{padding:28px 16px 24px}
  .hd-nome{font-size:24px}
  .grid{grid-template-columns:1fr;gap:14px}
  .card-img-wrap{height:200px}
  .main{padding:16px 12px 48px}
  .filters-inner{gap:8px}
  .cnt-lbl{width:100%;margin-left:0}
  .disp-grid{grid-template-columns:repeat(6,1fr)}
}
</style>
</head>
<body>

<header class="hd">
  ${logo ? `<img src="${logo}" alt="${nome}" class="hd-logo">` : `<div class="hd-logo-ph">🎀</div>`}
  <div class="hd-nome">${nome}</div>
  <div class="hd-slogan">${slogan}</div>
  <div class="hd-stats">
    <span class="hd-stat">✨ ${kits.length} kits</span>
    <span class="hd-stat">🎨 ${temas.length} temas</span>
    <span class="hd-stat" id="hd-disp">🟢 ${kits.filter(k=>!(ocupados[k.id]||[]).some(p=>hoje>=p.ret&&hoje<=p.dev)).length} disponíveis hoje</span>
    ${telWpp ? `<span class="hd-stat">📱 (${telWpp.slice(0,2)}) ${telWpp.slice(2,7)}-${telWpp.slice(7)}</span>` : ""}
  </div>
</header>

<div class="filters">
  <div class="filters-inner">
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="busca" placeholder="Buscar kit ou tema..." oninput="filtrar()">
    </div>
    <div class="chips">
      <span class="chip on" data-tema="">Todos</span>
      ${temas.map(t=>`<span class="chip" data-tema="${t}">${t}</span>`).join("")}
    </div>
    <label class="toggle-disp" title="Mostrar apenas kits disponíveis hoje">
      <input type="checkbox" id="chk-disp" onchange="filtrar()"> Só disponíveis
    </label>
    <span class="cnt-lbl" id="cnt">Mostrando ${kits.length} kit${kits.length!==1?"s":""}</span>
  </div>
</div>

<main class="main">
  <div class="grid" id="grid">${cardsHtml}</div>
  <div class="empty" id="empty">
    <div style="font-size:48px">🔍</div>
    <p>Nenhum kit encontrado</p>
  </div>
</main>

<footer class="ft">
  <div><strong>${nome}</strong></div>
  ${endEmp ? `<div style="font-size:12px;margin-top:2px">${endEmp}</div>` : ""}
  ${cnpj ? `<div style="font-size:11px;opacity:.6">CNPJ: ${cnpj}</div>` : ""}
  <div style="font-size:11px;opacity:.5;margin-top:8px">Valores sujeitos a alteração · Consulte disponibilidade de datas</div>
  ${telWpp ? `<br><a class="ft-wpp" href="https://wa.me/55${telWpp}?text=${encodeURIComponent(`Olá, ${nome}! 🎀 Gostaria de solicitar um orçamento para locação de kit de decoração.`)}" target="_blank">
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.133 1.527 5.887L.057 23.996l6.304-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374A9.856 9.856 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118S21.882 6.533 21.882 12 17.467 21.882 12 21.882z"/></svg>
    Solicitar orçamento pelo WhatsApp
  </a>` : ""}
</footer>

<script>
let _temaAtivo = "";
const cards = Array.from(document.querySelectorAll(".card"));

function filtrar() {
  const q       = document.getElementById("busca").value.toLowerCase().trim();
  const soDisp  = document.getElementById("chk-disp").checked;
  let vis = 0;
  cards.forEach(c => {
    const temaOk  = !_temaAtivo || c.dataset.tema === _temaAtivo;
    const busOk   = !q || c.dataset.nome.includes(q);
    const dispOk  = !soDisp || !c.classList.contains("card-alugado");
    const ok = temaOk && busOk && dispOk;
    c.style.display = ok ? "" : "none";
    if (ok) vis++;
  });
  document.getElementById("empty").style.display = vis === 0 ? "" : "none";
  document.getElementById("grid").style.display  = vis === 0 ? "none" : "";
  document.getElementById("cnt").textContent = \`Mostrando \${vis} kit\${vis!==1?"s":""}\`;
}

// Galeria
function galNav(id, dir) {
  const gal    = document.getElementById(id);
  const slides = gal.querySelectorAll(".gal-slide");
  const dots   = gal.querySelectorAll(".gal-dot");
  let cur = Array.from(slides).findIndex(s => s.classList.contains("active"));
  slides[cur].classList.remove("active");
  dots[cur]?.classList.remove("on");
  cur = (cur + dir + slides.length) % slides.length;
  slides[cur].classList.add("active");
  dots[cur]?.classList.add("on");
  gal.querySelector(".gal-slides").style.transform = \`translateX(-\${cur * 100}%)\`;
}
function galIr(id, idx) {
  const gal    = document.getElementById(id);
  const slides = gal.querySelectorAll(".gal-slide");
  const dots   = gal.querySelectorAll(".gal-dot");
  slides.forEach((s,i) => { s.classList.toggle("active", i===idx); });
  dots.forEach((d,i) => { d.classList.toggle("on", i===idx); });
  gal.querySelector(".gal-slides").style.transform = \`translateX(-\${idx * 100}%)\`;
}

// Filtros por chip
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
    chip.classList.add("on");
    _temaAtivo = chip.dataset.tema;
    filtrar();
  });
});
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `catalogo_kits_${(nome).toLowerCase().replace(/\s+/g,"-")}.html`;
  a.click();
  URL.revokeObjectURL(url);
  window.notif?.(`Catálogo gerado com ${kits.length} kits! ✨`);
};
