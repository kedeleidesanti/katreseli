/**
 * clientes-extra.js — Aniversários, histórico completo, fidelidade,
 *                     lista de separação, previsão de estoque,
 *                     sugestão de preço e metas visuais.
 */
import { el, fmtR, fmtD, notif }     from "./helpers.js";
import { clientes, locacoes, itens, metas, cfg } from "./state.js";

// ─── 1. ANIVERSÁRIOS ──────────────────────────────────────────────────────────
export function verificarAniversarios() {
  const hoje  = new Date();
  const cards = [];

  // Checar os próximos 7 dias
  for (let d = 0; d < 7; d++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + d);
    const dia = String(data.getDate()).padStart(2, "0");
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const chave = `${mes}-${dia}`;
    const anivs = clientes.filter(c => c.nasc && c.nasc.slice(5, 10) === chave);
    anivs.forEach(c => cards.push({ c, d }));
  }

  const div = el("dash-aniversarios"); if (!div) return;
  if (!cards.length) { div.style.display = "none"; return; }
  div.style.display = "";

  div.innerHTML = cards.map(({ c, d }) => {
    const label  = d === 0 ? "🎂 HOJE!" : d === 1 ? "🎁 Amanhã" : `📅 Em ${d} dias`;
    const cls    = d === 0 ? "aniv-hoje" : d === 1 ? "aniv-amanha" : "aniv-semana";
    const msgWpp = d === 0
      ? `🎉 Parabéns pelo seu aniversário, ${c.nome.split(" ")[0]}! Que seu dia seja muito especial! 🎀\n\nComo presente, temos uma surpresa para sua próxima locação — chame a gente! 🎁 — ${cfg.nome||"Katreseli"}`
      : `🎉 Olá ${c.nome.split(" ")[0]}! Seu aniversário é ${d === 1 ? "amanhã" : `em ${d} dias`}! Prepare-se para comemorar em grande estilo! 🎀 — ${cfg.nome||"Katreseli"}`;
    return `<div class="aniv-card ${cls}">
      <span class="aniv-emoji">${d === 0 ? "🎂" : d === 1 ? "🎁" : "🎈"}</span>
      <div class="aniv-info">
        <strong>${c.nome}</strong>
        <span>${label}</span>
      </div>
      ${c.tel ? `<a href="https://wa.me/55${(c.tel||"").replace(/\D/g,"")}&text=${encodeURIComponent(msgWpp)}" target="_blank" class="btn btn-p btn-xs" style="font-size:11px">${d === 0 ? "🎉 Parabenizar" : "✉️ Enviar"}</a>` : ""}
    </div>`;
  }).join("");
}
window.verificarAniversarios = verificarAniversarios;

// ─── 2. HISTÓRICO COMPLETO DO CLIENTE ────────────────────────────────────────
window.verHistoricoCliente = function(id) {
  const c   = clientes.find(x => x.id === id); if (!c) return;
  const lns = locacoes.filter(l => l.clienteId === id)
    .sort((a, b) => (b.criadoEm?.seconds||0) - (a.criadoEm?.seconds||0));

  const totalGasto   = lns.reduce((a, b) => a + (b.total||0), 0);
  const qtdLocacoes  = lns.length;
  const itensFav     = {};
  lns.forEach(l => (l.itens||[]).filter(x=>x.tipo!=="kit").forEach(it => {
    itensFav[it.nome] = (itensFav[it.nome]||0) + it.qtd;
  }));
  const topItens = Object.entries(itensFav).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const cor = cfg.cor || "#d4307a";

  // Badge fidelidade
  const nivel = qtdLocacoes >= 10 ? {l:"⭐ VIP",c:"#f59e0b"} :
                qtdLocacoes >= 5  ? {l:"💎 Fiel",c:"#6366f1"} :
                qtdLocacoes >= 2  ? {l:"✨ Frequente",c:cor} :
                                    {l:"🆕 Novo",c:"#6b7280"};

  const painel = document.createElement("div");
  painel.style.cssText = "position:fixed;inset:0;background:#0007;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px";
  painel.addEventListener("click", e => { if(e.target===painel) painel.remove(); });

  painel.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:580px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px #0004">
      <!-- Header -->
      <div style="background:${cor};color:#fff;padding:22px 24px;border-radius:20px 20px 0 0">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:52px;height:52px;border-radius:50%;background:#fff3;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">${c.nome.charAt(0)}</div>
            <div>
              <div style="font-size:18px;font-weight:800">${c.nome}</div>
              <div style="font-size:12px;opacity:.85">${c.tel||""} ${c.email?`· ${c.email}`:""}</div>
            </div>
          </div>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:#fff3;border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer">×</button>
        </div>
        <!-- Stats rápidos -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-top:16px">
          ${[
            ["Locações", qtdLocacoes],
            ["Total gasto", fmtR(totalGasto)],
            ["Ticket médio", qtdLocacoes ? fmtR(totalGasto/qtdLocacoes) : "—"],
            ["Nível", nivel.l]
          ].map(([l,v]) => `<div style="background:#fff2;border-radius:10px;padding:10px;text-align:center">
            <div style="font-size:10px;opacity:.75;text-transform:uppercase;letter-spacing:.5px">${l}</div>
            <div style="font-size:14px;font-weight:800;margin-top:3px">${v}</div>
          </div>`).join("")}
        </div>
      </div>
      <!-- Body -->
      <div style="padding:20px 24px">
        ${topItens.length ? `
        <div style="margin-bottom:18px">
          <div style="font-size:11px;font-weight:800;color:${cor};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Itens favoritos</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${topItens.map(([n,q])=>`<span style="background:${cor}15;color:${cor};border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600">${n} (${q}×)</span>`).join("")}
          </div>
        </div>` : ""}

        <div style="font-size:11px;font-weight:800;color:${cor};text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Histórico de locações</div>
        ${lns.length ? lns.map(l => {
          const corStatus = l.status==="devolvido"?"#059669":l.status==="ativo"?cor:"#6b7280";
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f5e8f2">
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">${l.evento||"—"}</div>
              <div style="font-size:11px;color:#888">${fmtD(l.retirada)} → ${fmtD(l.devolucao)}</div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${corStatus};background:${corStatus}15;padding:2px 8px;border-radius:8px">${l.status}</span>
            <div style="text-align:right;font-weight:700;color:${cor}">${fmtR(l.total)}</div>
            <button class="btn btn-s btn-xs" onclick="verContrato('${l.id}')">📄</button>
          </div>`;
        }).join("") : `<div style="text-align:center;color:#aaa;padding:20px">Sem locações ainda</div>`}
      </div>
    </div>`;
  document.body.appendChild(painel);
};

// ─── 3. BADGE DE FIDELIDADE nos renders ───────────────────────────────────────
export function badgeFidelidade(qtdLoc) {
  if (qtdLoc >= 10) return `<span style="font-size:10px;background:#fef3c7;color:#d97706;border-radius:8px;padding:1px 7px;font-weight:700">⭐ VIP</span>`;
  if (qtdLoc >= 5)  return `<span style="font-size:10px;background:#ede9fe;color:#6d28d9;border-radius:8px;padding:1px 7px;font-weight:700">💎 Fiel</span>`;
  if (qtdLoc >= 2)  return `<span style="font-size:10px;background:var(--pl);color:var(--p);border-radius:8px;padding:1px 7px;font-weight:700">✨ Freq.</span>`;
  return "";
}

// ─── 4. LISTA DE SEPARAÇÃO ────────────────────────────────────────────────────
export function gerarListaSeparacao(locId) {
  const l = locacoes.find(x => x.id === locId); if (!l) return;
  const c = clientes.find(x => x.id === l.clienteId) || {};
  const cor = cfg.cor || "#d4307a";
  const itensReais = (l.itens||[]).filter(x => x.tipo !== "kit");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Lista de Separação — ${c.nome||"Cliente"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Segoe UI",sans-serif;padding:24px;max-width:600px;margin:0 auto;color:#1a0a14}
  @media print{@page{margin:1cm}body{padding:0}}
  .hd{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${cor};padding-bottom:14px;margin-bottom:20px}
  .hd-title{font-size:18px;font-weight:800;color:${cor}}
  .hd-info{font-size:12px;color:#888;margin-top:4px}
  .info-box{background:#fdf8fb;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .info-item{font-size:12px}
  .info-lbl{color:#aaa;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
  .info-val{font-weight:600}
  table{width:100%;border-collapse:collapse}
  thead{background:${cor};color:#fff}
  th{padding:10px 14px;text-align:left;font-size:11px;letter-spacing:.5px}
  td{padding:10px 14px;border-bottom:1px solid #f5e8f2;font-size:13px}
  .check{width:28px;height:28px;border:2px solid #ddd;border-radius:6px;flex-shrink:0}
  tr:nth-child(even){background:#fdf5fa}
  .total-row{background:${cor}15!important;font-weight:800}
  .footer{margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .ass{border-top:1.5px solid #ccc;padding-top:8px;font-size:11px;color:#888;text-align:center}
</style></head><body>
<div class="hd">
  <div>
    <div class="hd-title">📦 Lista de Separação</div>
    <div class="hd-info">${cfg.nome||"Katreseli"} · Gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
  </div>
  <div style="text-align:right;font-size:13px;font-weight:700;color:${cor}">#${String(locId).slice(-6).toUpperCase()}</div>
</div>
<div class="info-box">
  <div class="info-item"><div class="info-lbl">Cliente</div><div class="info-val">${c.nome||"—"}</div></div>
  <div class="info-item"><div class="info-lbl">Evento</div><div class="info-val">${l.evento||"—"}</div></div>
  <div class="info-item"><div class="info-lbl">Retirada</div><div class="info-val" style="color:${cor}">${fmtD(l.retirada)}</div></div>
  <div class="info-item"><div class="info-lbl">Devolução</div><div class="info-val" style="color:#2563eb">${fmtD(l.devolucao)}</div></div>
</div>
<table>
  <thead><tr><th style="width:44px">✓</th><th>Item</th><th style="width:60px;text-align:center">Qtd</th><th style="width:80px">Estado</th></tr></thead>
  <tbody>
    ${itensReais.map(it => `<tr>
      <td><div class="check"></div></td>
      <td>${it.nome}</td>
      <td style="text-align:center;font-weight:700">${it.qtd}</td>
      <td><span style="font-size:11px;color:#888">______</span></td>
    </tr>`).join("")}
    <tr class="total-row">
      <td></td>
      <td>TOTAL DE ITENS</td>
      <td style="text-align:center">${itensReais.reduce((a,b)=>a+(b.qtd||1),0)}</td>
      <td></td>
    </tr>
  </tbody>
</table>
${l.obs ? `<div style="margin-top:16px;padding:10px 14px;background:#fffbeb;border-radius:8px;border-left:3px solid #f59e0b;font-size:12px"><strong>Obs:</strong> ${l.obs}</div>` : ""}
<div class="footer">
  <div class="ass">Conferido por: ________________________<br>Data: ___/___/______</div>
  <div class="ass">Entregue para: ________________________<br>Assinatura: ____________</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  const w = window.open("","_blank","width=700,height=800");
  if (w) { w.document.write(html); w.document.close(); }
  else notif("Ative pop-ups", true);
}
window.gerarListaSeparacao = gerarListaSeparacao;

// ─── 5. PREVISÃO DE ESTOQUE ───────────────────────────────────────────────────
export function renderPrevisaoEstoque() {
  const div = el("previsao-estoque"); if (!div) return;
  const hoje = new Date();

  // Próximas 4 semanas
  const semanas = Array.from({length: 4}, (_, i) => {
    const ini = new Date(hoje); ini.setDate(ini.getDate() + i * 7);
    const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
    const iniStr = ini.toISOString().split("T")[0];
    const fimStr = fim.toISOString().split("T")[0];
    return { ini: iniStr, fim: fimStr, label: `Sem ${i+1}` };
  });

  // Para cada semana, calcular itens comprometidos
  const critico = [];
  for (const item of itens) {
    for (const sem of semanas) {
      let comp = 0;
      locacoes.filter(l => l.status !== "cancelado" && l.status !== "devolvido").forEach(l => {
        if (l.retirada <= sem.fim && l.devolucao >= sem.ini) {
          (l.itens||[]).filter(x=>x.id===item.id&&x.tipo!=="kit").forEach(it => comp += it.qtd||1);
        }
      });
      const disp = Math.max(0, (item.qtd||1) - comp);
      const pct  = comp / (item.qtd||1);
      if (pct >= 0.7 && comp > 0) {
        critico.push({ item, sem, comp, disp, pct });
      }
    }
  }

  if (!critico.length) {
    div.innerHTML = `<div style="padding:16px;text-align:center;color:var(--txt3);font-size:13px">
      ✅ Estoque confortável nas próximas 4 semanas
    </div>`; return;
  }

  // Agrupar por item
  const porItem = {};
  critico.forEach(x => {
    if (!porItem[x.item.id]) porItem[x.item.id] = { item: x.item, sems: [] };
    porItem[x.item.id].sems.push(x);
  });

  div.innerHTML = Object.values(porItem).map(({ item, sems }) => {
    const maxPct = Math.max(...sems.map(s => s.pct));
    const cor = maxPct >= 1 ? "#ef4444" : maxPct >= 0.85 ? "#f97316" : "#eab308";
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--bdr)">
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${item.nome}</div>
        <div style="font-size:11px;color:var(--txt3)">Estoque: ${item.qtd||1}</div>
      </div>
      <div style="display:flex;gap:4px">
        ${sems.map(s => `<div style="text-align:center;background:${s.pct>=1?"#fee2e2":s.pct>=0.85?"#ffedd5":"#fef9c3"};border-radius:6px;padding:4px 7px;font-size:10px">
          <div style="font-weight:700;color:${s.pct>=1?"#ef4444":s.pct>=0.85?"#f97316":"#854d0e"}">${s.disp}</div>
          <div style="color:#aaa;font-size:9px">${s.sem.label}</div>
        </div>`).join("")}
      </div>
    </div>`;
  }).join("");
}
window.renderPrevisaoEstoque = renderPrevisaoEstoque;

// ─── 6. SUGESTÃO DE PREÇO ─────────────────────────────────────────────────────
export function renderSugestaoPreco() {
  const div = el("sugestao-preco"); if (!div) return;
  const sugestoes = [];

  for (const item of itens) {
    if (!item.custo || !item.aluguel) continue;
    const locsItem = locacoes.filter(l =>
      (l.status === "ativo" || l.status === "devolvido") &&
      (l.itens||[]).some(x => x.id === item.id)
    );
    // Taxa de ocupação nos últimos 60 dias
    const ate  = new Date();
    const de   = new Date(); de.setDate(de.getDate() - 60);
    const deStr = de.toISOString().split("T")[0];
    const ateStr = ate.toISOString().split("T")[0];
    const locsRecentes = locsItem.filter(l => l.retirada >= deStr && l.retirada <= ateStr);
    const diasOcupados = locsRecentes.reduce((a, l) => {
      const dias = Math.round((new Date(l.devolucao) - new Date(l.retirada)) / (1000*60*60*24)) + 1;
      return a + dias;
    }, 0);
    const taxaOcup = diasOcupados / 60;

    // Sugerir aumento se muito ocupado, redução se parado
    if (taxaOcup > 0.6) {
      const sug = Math.round(item.aluguel * 1.15 * 100) / 100;
      sugestoes.push({ item, tipo: "aumento", atual: item.aluguel, sugerido: sug, taxaOcup, motivo: `${(taxaOcup*100).toFixed(0)}% ocupado nos últimos 60 dias` });
    } else if (taxaOcup < 0.1 && locsItem.length > 0) {
      const sug = Math.round(item.aluguel * 0.9 * 100) / 100;
      sugestoes.push({ item, tipo: "reducao", atual: item.aluguel, sugerido: sug, taxaOcup, motivo: `Apenas ${(taxaOcup*100).toFixed(0)}% de ocupação` });
    }
  }

  if (!sugestoes.length) {
    div.innerHTML = `<div style="padding:16px;text-align:center;color:var(--txt3);font-size:13px">💡 Sem sugestões no momento. Dados insuficientes.</div>`;
    return;
  }

  div.innerHTML = sugestoes.slice(0, 6).map(s => {
    const corTipo = s.tipo === "aumento" ? "#059669" : "#f97316";
    const emoji   = s.tipo === "aumento" ? "📈" : "📉";
    const diff    = s.sugerido - s.atual;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--bdr)">
      <span style="font-size:20px">${emoji}</span>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${s.item.nome}</div>
        <div style="font-size:11px;color:var(--txt3)">${s.motivo}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:var(--txt3);text-decoration:line-through">${fmtR(s.atual)}</div>
        <div style="font-weight:800;color:${corTipo}">${fmtR(s.sugerido)} <span style="font-size:10px">(${diff>0?"+":""}${fmtR(diff)})</span></div>
      </div>
    </div>`;
  }).join("");
}
window.renderSugestaoPreco = renderSugestaoPreco;

// ─── 7. METAS VISUAIS NO DASHBOARD ───────────────────────────────────────────
export function renderMetas() {
  const div = el("d-metas"); if (!div) return;
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const lnsMes = locacoes.filter(l => {
    if (!l.retirada) return false;
    const d = new Date(l.retirada + "T12:00:00");
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual &&
           (l.status === "ativo" || l.status === "devolvido");
  });

  const fatAtual  = lnsMes.reduce((a, b) => a + (b.total||0), 0);
  const locAtual  = lnsMes.length;
  const cliNovos  = clientes.filter(c => {
    if (!c.criadoEm?.seconds) return false;
    const d = new Date(c.criadoEm.seconds * 1000);
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  }).length;

  const items = [
    { lbl: "Faturamento", atual: fatAtual,  meta: metas.fat || 0, fmt: v => fmtR(v) },
    { lbl: "Locações",    atual: locAtual,  meta: metas.loc || 0, fmt: v => v },
    { lbl: "Novos clientes", atual: cliNovos, meta: metas.cli || 0, fmt: v => v },
  ];

  div.innerHTML = items.map(({ lbl, atual, meta, fmt }) => {
    const pct = meta > 0 ? Math.min(100, (atual / meta) * 100) : 0;
    const cor = pct >= 100 ? "#059669" : pct >= 70 ? cfg.cor||"#d4307a" : "#6b7280";
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <span style="font-size:12px;font-weight:600;color:var(--txt)">${lbl}</span>
        <span style="font-size:12px;font-weight:800;color:${cor}">${fmt(atual)}${meta>0?` / ${fmt(meta)}`:""}</span>
      </div>
      ${meta > 0 ? `
      <div style="height:7px;background:var(--bdr);border-radius:7px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${cor};border-radius:7px;transition:width .6s ease"></div>
      </div>
      <div style="font-size:10px;color:var(--txt3);margin-top:3px;text-align:right">${pct.toFixed(0)}% da meta ${pct>=100?"✓":""}</div>` :
      `<div style="font-size:11px;color:var(--txt3)">Meta não definida — <button class="btn btn-s btn-xs" onclick="openModal('modal-meta')">Definir</button></div>`}
    </div>`;
  }).join("");
}
window.renderMetas = renderMetas;
