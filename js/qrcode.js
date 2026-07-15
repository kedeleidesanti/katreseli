/**
 * qrcode.js — QR Code por item e link de orçamento público
 */
import { locacoes, clientes, itens, cfg } from "./state.js";
import { fmtR, fmtD, notif }              from "./helpers.js";

// ─── Gerar QR Code SVG simples (sem lib externa) via API gratuita ─────────────
function qrUrl(texto) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(texto)}`;
}

// ─── QR Code do item ──────────────────────────────────────────────────────────
window.gerarQRItem = function(itemId) {
  const item = itens.find(x => x.id === itemId); if (!item) return;
  const cor  = cfg.cor || "#d4307a";
  const url  = `${window.location.origin}${window.location.pathname}?item=${itemId}`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>QR Code — ${item.nome}</title>
<style>
  body{font-family:"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f4f7}
  .card{background:#fff;border-radius:20px;padding:28px;text-align:center;box-shadow:0 4px 32px #0002;max-width:280px}
  .logo{font-size:13px;font-weight:700;color:${cor};margin-bottom:4px}
  .nome{font-size:16px;font-weight:800;color:#1a0a14;margin:12px 0 4px}
  .cat{font-size:11px;color:#aaa;margin-bottom:12px}
  .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
  .info-item{background:#f8f4f7;border-radius:10px;padding:8px}
  .info-lbl{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.5px}
  .info-val{font-size:13px;font-weight:700;color:#1a0a14;margin-top:2px}
  .estado{display:inline-block;margin-top:10px;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${cor}15;color:${cor}}
  .rodape{font-size:10px;color:#ccc;margin-top:14px}
  @media print{body{background:#fff}.card{box-shadow:none}}
</style></head><body>
<div class="card">
  <div class="logo">${cfg.nome || "Katreseli"}</div>
  <img src="${qrUrl(url)}" width="160" height="160" style="border-radius:12px">
  <div class="nome">${item.nome}</div>
  <div class="cat">${item.categoria || "—"}</div>
  <div class="info">
    <div class="info-item"><div class="info-lbl">Qtd. estoque</div><div class="info-val">${item.qtd || 1}</div></div>
    <div class="info-item"><div class="info-lbl">Aluguel</div><div class="info-val">${fmtR(item.aluguel || 0)}</div></div>
    <div class="info-item"><div class="info-lbl">Estado</div><div class="info-val">${item.estado || "Ótimo"}</div></div>
    <div class="info-item"><div class="info-lbl">Custo</div><div class="info-val">${fmtR(item.custo || 0)}</div></div>
  </div>
  <div class="estado">${item.estado || "Disponível"}</div>
  <div class="rodape">Escaneie para ver o status atual<br>${item.tags || ""}</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  const w = window.open("", "_blank", "width=380,height=580");
  if (w) { w.document.write(html); w.document.close(); }
  else notif("Ative pop-ups", true);
};

// ─── Link de orçamento público ────────────────────────────────────────────────
window.gerarLinkOrcamento = function(locId) {
  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  const num = String(locId).slice(-6).toUpperCase();
  const cor = cfg.cor || "#d4307a";

  const itensLista = (loc.itens || []).filter(x => x.tipo !== "kit")
    .map(it => `<tr>
      <td style="padding:8px 14px;font-size:13px">${it.nome}</td>
      <td style="padding:8px 14px;text-align:center;font-weight:600">${it.qtd}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orçamento #${num} — ${cfg.nome || "Katreseli"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Segoe UI",sans-serif;background:#f8f4f7;color:#1a0a14;padding:20px;min-height:100vh}
  .card{background:#fff;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden;box-shadow:0 4px 32px #0002}
  .hd{background:${cor};color:#fff;padding:24px;text-align:center}
  .hd-logo{font-size:22px;font-weight:800;margin-bottom:4px}
  .hd-sub{font-size:12px;opacity:.8}
  .hd-num{font-size:13px;margin-top:10px;opacity:.9}
  .bd{padding:22px}
  .sec{font-size:10px;font-weight:800;color:${cor};text-transform:uppercase;letter-spacing:1.5px;margin:18px 0 10px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .info-item{background:#f8f4f7;border-radius:10px;padding:10px 12px}
  .info-lbl{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
  .info-val{font-size:13px;font-weight:600}
  .info-dest{color:${cor};font-size:15px;font-weight:800}
  table{width:100%;border-collapse:collapse}
  thead{background:${cor}15}
  th{padding:8px 14px;text-align:left;font-size:10px;color:${cor};text-transform:uppercase;letter-spacing:.5px}
  tr:nth-child(even){background:#f8f4f7}
  .total-box{background:${cor};color:#fff;border-radius:12px;padding:16px;text-align:center;margin-top:16px}
  .total-lbl{font-size:11px;opacity:.8;margin-bottom:4px}
  .total-val{font-size:28px;font-weight:800}
  .pgto{text-align:center;margin-top:16px}
  .pgto-btn{display:inline-block;background:${cor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;font-size:14px;margin-top:8px}
  .footer{text-align:center;padding:16px;font-size:11px;color:#aaa;border-top:1px solid #eee}
  .badge{display:inline-block;background:${cor}15;color:${cor};border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;margin-top:6px}
</style></head><body>
<div class="card">
  <div class="hd">
    ${cfg.logo ? `<img src="${cfg.logo}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;margin-bottom:10px">` : `<div style="font-size:32px;margin-bottom:8px">🎀</div>`}
    <div class="hd-logo">${cfg.nome || "Katreseli"}</div>
    <div class="hd-sub">${cfg.slogan || "Locações de Decoração Infantil"}</div>
    <div class="hd-num">Orçamento #${num} <span class="badge" style="background:#fff3;color:#fff">Aguardando aprovação</span></div>
  </div>
  <div class="bd">
    <div class="sec">Para</div>
    <div style="font-size:16px;font-weight:700">${c.nome || "—"}</div>

    <div class="sec">Evento</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-lbl">Tipo</div><div class="info-val">${loc.evento || "—"}</div></div>
      <div class="info-item"><div class="info-lbl">Local</div><div class="info-val">${loc.local || "—"}</div></div>
      <div class="info-item"><div class="info-lbl">Retirada</div><div class="info-val info-dest">${fmtD(loc.retirada)}</div></div>
      <div class="info-item"><div class="info-lbl">Devolução</div><div class="info-val" style="color:#2563eb;font-weight:800">${fmtD(loc.devolucao)}</div></div>
    </div>

    <div class="sec">Itens inclusos</div>
    <table>
      <thead><tr><th>Item</th><th>Qtd</th></tr></thead>
      <tbody>${itensLista}</tbody>
    </table>

    <div class="total-box">
      <div class="total-lbl">Valor total da locação</div>
      <div class="total-val">${fmtR(loc.total)}</div>
      ${loc.entrada > 0 ? `<div style="font-size:12px;opacity:.85;margin-top:4px">Entrada: ${fmtR(loc.entrada)} &bull; Saldo: ${fmtR(loc.saldo || 0)}</div>` : ""}
    </div>

    ${c.tel ? `<div class="pgto">
      <div style="font-size:13px;color:#666;margin-bottom:6px">Para confirmar sua reserva, entre em contato:</div>
      <a href="https://wa.me/55${(c.tel||"").replace(/\D/g,"")}" class="pgto-btn">📱 Confirmar pelo WhatsApp</a>
    </div>` : ""}
  </div>
  <div class="footer">${cfg.nome || "Katreseli"} &bull; Orçamento válido por 7 dias</div>
</div>
</body></html>`;

  // Abrir em nova aba (o cliente pode salvar como HTML ou compartilhar)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `orcamento_${num}.html`;
  a.click();
  URL.revokeObjectURL(url);
  notif("Arquivo de orçamento baixado! Envie pelo WhatsApp.");
};


