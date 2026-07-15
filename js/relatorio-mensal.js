/**
 * relatorio-mensal.js — Gera relatório mensal em PDF (nova janela)
 */
import { locacoes, clientes, itens, cfg } from "./state.js";
import { fmtR, fmtD, notif }              from "./helpers.js";

window.gerarRelatorioMensal = function(mes, ano) {
  // Usar mês/ano atual se não informado
  const agora = new Date();
  mes = mes ?? agora.getMonth();
  ano = ano ?? agora.getFullYear();

  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  // Filtrar locações do mês
  const lns = locacoes.filter(l => {
    if (!l.retirada) return false;
    const d = new Date(l.retirada + "T12:00:00");
    return d.getMonth() === mes && d.getFullYear() === ano &&
           (l.status === "ativo" || l.status === "aguardando_entrada" || l.status === "devolvido");
  });

  if (!lns.length) { notif(`Sem locações em ${MESES[mes]}/${ano}`, true); return; }

  const cor  = cfg.cor || "#d4307a";
  const hoje = new Date().toLocaleDateString("pt-BR");

  // ─── Cálculos ───────────────────────────────────────────────────────────────
  const totalGeral  = lns.reduce((a, b) => a + (b.total   || 0), 0);
  const entradas    = lns.reduce((a, b) => a + (b.entrada || 0), 0);
  const saldoPend   = lns.reduce((a, b) => a + (b.saldo   || 0), 0);
  const ativas      = lns.filter(l => l.status === "ativo" || l.status === "aguardando_entrada").length;
  const devolvidas  = lns.filter(l => l.status === "devolvido").length;
  const ticket      = lns.length ? totalGeral / lns.length : 0;

  // Itens mais locados no mês
  const cntItens = {};
  lns.forEach(l => (l.itens || []).filter(x => x.tipo !== "kit").forEach(it => {
    cntItens[it.nome] = (cntItens[it.nome] || 0) + (it.qtd || 1);
  }));
  const topItens = Object.entries(cntItens).sort((a,b) => b[1]-a[1]).slice(0, 8);

  // Clientes do mês
  const cntCli = {};
  lns.forEach(l => { cntCli[l.clienteId] = (cntCli[l.clienteId] || 0) + 1; });
  const topCli = Object.entries(cntCli).sort((a,b) => b[1]-a[1]).slice(0, 5);

  // Linhas da tabela de locações
  const linhasLoc = lns
    .sort((a, b) => (a.retirada || "").localeCompare(b.retirada || ""))
    .map(l => {
      const c = clientes.find(x => x.id === l.clienteId) || {};
      const statusCor = l.status === "devolvido" ? "#059669" : "#d4307a";
      return `<tr>
        <td>${fmtD(l.retirada)}</td>
        <td><strong>${c.nome || "—"}</strong></td>
        <td>${l.evento || "—"}</td>
        <td style="font-weight:700;color:${cor}">${fmtR(l.total)}</td>
        <td style="color:#059669">${fmtR(l.entrada || 0)}</td>
        <td style="color:${(l.saldo||0)>0?"#b45309":"#059669"}">${(l.saldo||0)>0 ? fmtR(l.saldo) : "✓"}</td>
        <td><span style="color:${statusCor};font-weight:600;font-size:11px">${l.status === "devolvido" ? "Devolvido" : "Ativo"}</span></td>
      </tr>`;
    }).join("");

  // Barras de top itens
  const maxIt = topItens[0]?.[1] || 1;
  const barrasItens = topItens.map(([nome, qtd]) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="width:140px;font-size:11pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
      <div style="flex:1;height:10px;background:#f5e8f2;border-radius:6px;overflow:hidden">
        <div style="height:100%;width:${(qtd/maxIt*100).toFixed(0)}%;background:${cor};border-radius:6px"></div>
      </div>
      <div style="width:30px;text-align:right;font-weight:700;font-size:11pt">${qtd}×</div>
    </div>`).join("");

  const logoHtml = cfg.logo
    ? `<img src="${cfg.logo}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid ${cor}">`
    : `<div style="width:52px;height:52px;border-radius:50%;background:${cor};display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff">🎀</div>`;

  // ─── CSS ────────────────────────────────────────────────────────────────────
  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"Segoe UI",Arial,sans-serif;font-size:10pt;color:#1a0a14;background:#fff;padding:32px 36px;max-width:820px;margin:0 auto;line-height:1.6}
    @media print{body{padding:16px}@page{margin:1cm;size:A4}}
    .hd{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid ${cor};margin-bottom:24px}
    .hd-left{display:flex;align-items:center;gap:12px}
    .hd-nome{font-size:20pt;font-weight:800;color:${cor};font-family:Georgia,serif}
    .hd-sub{font-size:9pt;color:#aaa}
    .hd-right{text-align:right}
    .hd-titulo{font-size:16pt;font-weight:800;color:#1a0a14}
    .hd-per{font-size:9pt;color:#888;margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
    .stat{padding:14px;border-radius:12px;text-align:center;border:1.5px solid #f0e0eb}
    .stat-val{font-size:18pt;font-weight:800;color:${cor};margin-bottom:3px}
    .stat-lbl{font-size:8pt;color:#aaa;text-transform:uppercase;letter-spacing:.8px}
    .sec{font-size:8pt;font-weight:800;color:${cor};text-transform:uppercase;letter-spacing:2px;margin:20px 0 10px;display:flex;align-items:center;gap:10px}
    .sec::after{content:"";flex:1;height:1.5px;background:linear-gradient(to right,${cor}50,transparent)}
    table{width:100%;border-collapse:collapse}
    thead th{background:${cor};color:#fff;padding:8px 12px;font-size:9pt;text-align:left;font-weight:700}
    tbody tr:nth-child(even){background:#fdf5fa}
    tbody td{padding:8px 12px;font-size:9.5pt;border-bottom:1px solid #f5e8f2}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .card{padding:16px;border:1.5px solid #f0e0eb;border-radius:12px}
    .rf{margin-top:24px;padding-top:12px;border-top:1px solid #eee;text-align:center;font-size:8pt;color:#ccc}
  `;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório ${MESES[mes]}/${ano} — ${cfg.nome || "Katreseli"}</title>
<style>${css}</style></head><body>

<div id="barra-print" style="position:fixed;top:0;left:0;right:0;background:#1a0a14;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 24px;z-index:9999;font-family:'Segoe UI',sans-serif;font-size:13px">
  <span>🎀 Relatório ${MESES[mes]}/${ano}</span>
  <div style="display:flex;gap:10px">
    <button onclick="window.print()" style="background:${cor};color:#fff;border:none;border-radius:7px;padding:7px 18px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
      <button onclick="window.close()" style="background:#e5e7eb;color:#374151;border:none;border-radius:7px;padding:7px 18px;font-size:13px;font-weight:700;cursor:pointer;margin-left:8px">✕ Fechar</button>
    <button onclick="window.close()" style="background:#fff2;color:#fff;border:1px solid #fff3;border-radius:7px;padding:7px 14px;font-size:13px;cursor:pointer">✕</button>
  </div>
</div>
<div style="height:52px"></div>

<div class="hd">
  <div class="hd-left">
    ${logoHtml}
    <div><div class="hd-nome">${cfg.nome || "Katreseli"}</div><div class="hd-sub">${cfg.slogan || "Locações de Decoração Infantil"}</div></div>
  </div>
  <div class="hd-right">
    <div class="hd-titulo">Relatório Mensal</div>
    <div class="hd-per">${MESES[mes]} de ${ano} &bull; Gerado em ${hoje}</div>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-val">${lns.length}</div><div class="stat-lbl">Locações</div></div>
  <div class="stat"><div class="stat-val">${fmtR(totalGeral)}</div><div class="stat-lbl">Faturamento</div></div>
  <div class="stat"><div class="stat-val">${fmtR(entradas)}</div><div class="stat-lbl">Recebido</div></div>
  <div class="stat"><div class="stat-val">${fmtR(ticket)}</div><div class="stat-lbl">Ticket médio</div></div>
</div>

<div class="sec">Locações do mês</div>
<table>
  <thead><tr><th>Data</th><th>Cliente</th><th>Evento</th><th>Total</th><th>Entrada</th><th>Saldo</th><th>Status</th></tr></thead>
  <tbody>${linhasLoc}</tbody>
  <tfoot><tr style="background:${cor}15;font-weight:800">
    <td colspan="3" style="padding:8px 12px">TOTAL</td>
    <td style="padding:8px 12px;color:${cor}">${fmtR(totalGeral)}</td>
    <td style="padding:8px 12px;color:#059669">${fmtR(entradas)}</td>
    <td style="padding:8px 12px;color:#b45309">${fmtR(saldoPend)}</td>
    <td></td>
  </tfoot>
</table>

<div class="g2" style="margin-top:20px">
  <div class="card">
    <div class="sec" style="margin-top:0">Itens mais locados</div>
    ${barrasItens || '<p style="color:#aaa;font-size:12px">Sem dados</p>'}
  </div>
  <div class="card">
    <div class="sec" style="margin-top:0">Resumo</div>
    <table>
      <tbody>
        <tr><td>Locações ativas</td><td style="text-align:right;font-weight:700;color:${cor}">${ativas}</td></tr>
        <tr><td>Devolvidas</td><td style="text-align:right;font-weight:700;color:#059669">${devolvidas}</td></tr>
        <tr><td>Saldo a receber</td><td style="text-align:right;font-weight:700;color:#b45309">${fmtR(saldoPend)}</td></tr>
        <tr><td>Ticket médio</td><td style="text-align:right;font-weight:700">${fmtR(ticket)}</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="rf">${cfg.nome || "Katreseli"} &bull; ${MESES[mes]}/${ano} &bull; Gerado em ${hoje}</div>
<style>@media print{#barra-print,div[style*="height:52px"]{display:none!important}}</style>
</body></html>`;

  const w = window.open("", "_blank", "width=940,height=820");
  if (w) { w.document.write(html); w.document.close(); }
  else notif("Ative pop-ups para gerar o relatório", true);
};

// ─── Seletor de mês/ano para o relatório ────────────────────────────────────
window.abrirSeletorRelatorio = function() {
  const agora = new Date();
  const modal = document.getElementById("modal-rel-mensal");
  if (!modal) return;
  // Preencher selects
  const sm = document.getElementById("rel-mes");
  const sa = document.getElementById("rel-ano");
  if (sm) sm.value = agora.getMonth();
  if (sa) sa.value = agora.getFullYear();
  modal.classList.add("on");
};

window.confirmarRelMensal = function() {
  const mes = parseInt(document.getElementById("rel-mes")?.value ?? new Date().getMonth());
  const ano = parseInt(document.getElementById("rel-ano")?.value ?? new Date().getFullYear());
  document.getElementById("modal-rel-mensal")?.classList.remove("on");
  window.gerarRelatorioMensal(mes, ano);
};
