import { el, fmtR, fmtD, esc, dl, notif } from "./helpers.js";
import { itens, clientes, locacoes, metas, calMes, calAno, setCalMes, setCalAno } from "./state.js";
import { db, doc, updateDoc, collection, addDoc, serverTimestamp } from "./firebase.js";

// ── Confirmar pagamento no admin ──────────────────────────────────────────────
window.confirmarPagamentoAdmin = async function(locId, tipo, valor, btn) {
  if (!locId) return;
  const loc = locacoes.find(l => l.id === locId);
  if (!loc) { notif("Locação não encontrada", true); return; }

  if (btn) { btn.disabled = true; btn.textContent = "Confirmando..."; }

  try {
    const agora = new Date().toISOString();
    const total = loc.total || 0;

    // Calcular atualização correta baseada no tipo e estado atual da locação
    let upd;
    if (tipo === "entrada") {
      const entradaVal = valor || loc.entrada || 0;
      upd = { status:"aguardando_assinatura", entrada:entradaVal, saldo:total - entradaVal, pagEntradaEm:agora, pagamentoConfirmadoEm:agora };
    } else {
      // Pagamento total: zerar saldo, avançar para aguardando assinatura
      upd = { status:"aguardando_assinatura", saldo:0, entrada:total, pagTotalEm:agora, pagamentoConfirmadoEm:agora };
    }

    // 1. Atualizar locação
    await updateDoc(doc(db,"locacoes",locId), upd);

    // 2. Gerar contrato automaticamente em modo silencioso (só salva no Firestore)
    setTimeout(() => window.gerarContrato?.({ ...loc, ...upd }, true), 400);

    // 2. Registrar transação — se o cliente já criou uma pendente, atualizá-la (sem duplicar)
    const pendente = (window._transacoes || []).find(t =>
      t.locacaoId === locId && t.status === "pendente" && (t.tipo || "total") === tipo
    );
    if (pendente?.id) {
      await updateDoc(doc(db,"transacoes",pendente.id), {
        status: "aprovado", origem: "admin_confirmado", valor, confirmadoEm: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db,"transacoes"), {
        locacaoId:    locId,
        clienteNome:  loc.nomeCliente || "",
        clienteEmail: loc.email       || "",
        valor, metodo: "pix", status: "aprovado", tipo,
        evento:       loc.evento || loc.tipoEvento || "",
        criadoEm:     serverTimestamp(),
        origem:       "admin_confirmado",
      });
    }

    // 3. Marcar notificações da locação como lidas
    try {
      const { getDocs, query: q2, where: w2 } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const snap = await getDocs(q2(
        collection(db,"notificacoes"),
        w2("locId","==",locId), w2("lida","==",false)
      ));
      snap.docs.forEach(d => updateDoc(doc(db,"notificacoes",d.id),{lida:true}).catch(()=>{}));
    } catch(_) {}

    notif("✅ Pagamento confirmado! Locação atualizada.");
    window.renderTransacoes?.();
    window.renderComprovantesAdmin?.();
    window.renderLoc?.();       // atualizar lista de locações
    window.renderDash?.();      // atualizar dashboard
  } catch(e) {
    notif("Erro: " + e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = "✅ Confirmar"; }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON LOADING
// ═══════════════════════════════════════════════════════════════════════════════
export function showSkeleton(containerId, rows = 4) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const skRow = () => `<div class="sk-card"><div class="sk-row">
    <div class="skeleton sk-circle"></div>
    <div class="sk-block">
      <div class="skeleton sk-line w80"></div>
      <div class="skeleton sk-line w60"></div>
    </div>
  </div><div class="skeleton sk-line w40"></div></div>`;
  el.innerHTML = Array(rows).fill(0).map(skRow).join("");
}
window.showSkeleton = showSkeleton;

// ─── Dashboard ────────────────────────────────────────────────────────────────
let _dashFatMes = true; // true = mês atual, false = total geral

window.toggleFatMes = function() {
  _dashFatMes = !_dashFatMes;
  renderDash();
};

export function renderDash() {
  const hoje   = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const ativas = locacoes.filter(l => ["ativo","aceito","aguardando_entrada","aguardando_assinatura"].includes(l.status)).length;
  const devs   = locacoes.filter(l => l.status === "devolvido").length;

  // Faturamento: mês atual ou total
  const lnsFat = locacoes.filter(l => l.status === "ativo" || l.status === "aguardando_entrada" || l.status === "devolvido");
  const lnsMes = lnsFat.filter(l => {
    if (!l.retirada) return false;
    const d = new Date(l.retirada + "T12:00:00");
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });
  const fat    = (_dashFatMes ? lnsMes : lnsFat).reduce((a, b) => a + (b.total || 0), 0);

  // Comparativo mês anterior
  const lnsMesAnt = lnsFat.filter(l => {
    if (!l.retirada) return false;
    const d = new Date(l.retirada + "T12:00:00");
    const ma = mesAtual === 0 ? 11 : mesAtual - 1;
    const aa = mesAtual === 0 ? anoAtual - 1 : anoAtual;
    return d.getMonth() === ma && d.getFullYear() === aa;
  });
  const fatAnt = lnsMesAnt.reduce((a, b) => a + (b.total || 0), 0);
  const diff   = fatAnt > 0 ? ((fat - fatAnt) / fatAnt * 100).toFixed(0) : null;

  if (el("d-at"))    el("d-at").textContent    = ativas;
  if (el("d-fat"))   el("d-fat").textContent   = "R$" + fat.toLocaleString("pt-BR", {maximumFractionDigits:0});
  if (el("d-fat-lbl")) {
    const mn = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const diffHtml = diff !== null && _dashFatMes
      ? ` <span style="font-size:10px;color:${Number(diff)>=0?"#15803d":"#b91c1c"}">${Number(diff)>=0?"+":""}${diff}% vs ${mn[mesAtual===0?11:mesAtual-1]}</span>`
      : "";
    el("d-fat-lbl").innerHTML = (_dashFatMes ? `${mn[mesAtual]}/${anoAtual}` : "Total geral") + ` <span style="font-size:9px;opacity:.5">▼</span>` + diffHtml;
  }
  if (el("d-it"))    el("d-it").textContent    = itens.length;
  if (el("d-cl"))    el("d-cl").textContent    = clientes.length;
  if (el("bdg-at"))  el("bdg-at").textContent  = ativas;
  if (el("bdg-it"))  el("bdg-it").textContent  = itens.length;
  if (el("bdg-devs"))el("bdg-devs").textContent = devs;
  // Cards extras
  if (typeof renderCardsExtras === "function") renderCardsExtras();
  // Alertas inteligentes
  if (typeof renderAlertas === "function") renderAlertas();

  // Em andamento
  const divAnd = el("d-and");
  if (divAnd) {
    const ativas2 = locacoes.filter(l => l.status === "ativo").slice(0, 5);
    if (!ativas2.length) {
      divAnd.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="14" x2="15" y2="20"/><line x1="15" y1="14" x2="9" y2="20"/></svg><p>Nenhuma locação ativa</p></div>';
    } else {
      divAnd.innerHTML = ativas2.map(l => {
        const c = clientes.find(x => x.id === l.clienteId);
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--bdr)">
          <div><div style="font-weight:500;font-size:13px">${c ? c.nome : "-"}</div>
          <div style="font-size:11px;color:var(--txt3)">${l.evento || "-"} &bull; ${fmtD(l.retirada)}</div></div>
          <div style="text-align:right">
            <div style="font-weight:700;color:var(--p);font-size:13px">${fmtR(l.total)}</div>
            <div style="font-size:11px;color:${(l.saldo || 0) > 0 ? "#9a3412" : "#065f46"}">${(l.saldo || 0) > 0 ? "Saldo: " + fmtR(l.saldo) : "Pago"}</div>
          </div>
        </div>`;
      }).join("");
    }
  }

  // Devoluções próximas
  const divDevs = el("d-devs");
  if (divDevs) {
    const hoje2 = new Date().toISOString().split("T")[0];
    const prox  = locacoes
      .filter(l => l.status === "ativo" && l.devolucao >= hoje2)
      .sort((a, b) => a.devolucao.localeCompare(b.devolucao))
      .slice(0, 4);

    if (!prox.length) {
      divDevs.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg><p>Nenhuma devolução próxima</p></div>';
    } else {
      divDevs.innerHTML = prox.map(l => {
        const c      = clientes.find(x => x.id === l.clienteId);
        const diasFim = Math.round((new Date(l.devolucao) - new Date()) / (1000 * 60 * 60 * 24));
        const cor     = diasFim <= 1 ? "#9a3412" : diasFim <= 3 ? "#92400e" : "#065f46";
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--bdr)">
          <div><div style="font-weight:500;font-size:13px">${c ? c.nome : "-"}</div>
          <div style="font-size:11px;color:var(--txt3)">${l.evento || "-"}</div></div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:12px;color:${cor}">${diasFim === 0 ? "Hoje" : diasFim === 1 ? "Amanhã" : diasFim + " dias"}</div>
            <div style="font-size:11px;color:var(--txt3)">${fmtD(l.devolucao)}</div>
          </div>
        </div>`;
      }).join("");
    }
  }

  // Gráfico Vendas por mês
  renderGrafVendas();
}
window.renderDash = renderDash;

function renderGrafVendas() {
  const graf = el("d-graf");
  const lab  = el("d-lab");
  if (!graf) return;

  const hoje   = new Date();
  const meses  = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ mes: d.getMonth(), ano: d.getFullYear() });
  }

  const mn = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const lns = locacoes.filter(l => l.status === "ativo" || l.status === "aguardando_entrada" || l.status === "devolvido");

  const valores = meses.map(({ mes, ano }) =>
    lns.filter(l => {
      if (!l.retirada) return false;
      const d = new Date(l.retirada + "T12:00:00");
      return d.getMonth() === mes && d.getFullYear() === ano;
    }).reduce((s, l) => s + (l.total || 0), 0)
  );

  const maxVal = Math.max(...valores, 1);

  graf.innerHTML = valores.map((v, i) => {
    const pct    = Math.round((v / maxVal) * 100);
    const isCur  = meses[i].mes === hoje.getMonth() && meses[i].ano === hoje.getFullYear();
    const vStr   = v > 0 ? "R$" + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "";
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:100%">
      ${vStr ? `<span style="font-size:9px;color:var(--txt3);white-space:nowrap;overflow:hidden;max-width:100%;text-overflow:ellipsis">${vStr}</span>` : ""}
      <div style="width:100%;max-width:36px;height:${Math.max(pct, v > 0 ? 6 : 0)}%;background:${isCur ? "var(--p)" : "var(--pl)"};border-radius:4px 4px 0 0;border:1.5px solid ${isCur ? "var(--pd)" : "var(--bdr2)"};transition:height .3s"></div>
    </div>`;
  }).join("");

  if (lab) {
    lab.innerHTML = meses.map(({ mes, ano }) => {
      const isCur = mes === hoje.getMonth() && ano === hoje.getFullYear();
      return `<div style="flex:1;text-align:center;font-size:10px;font-weight:${isCur ? "700" : "400"};color:${isCur ? "var(--p)" : "var(--txt3)"}">
        ${mn[mes]}
      </div>`;
    }).join("");
  }
}

// ─── Financeiro ───────────────────────────────────────────────────────────────
export function renderFin() {
  // Popular anos dinamicamente
  const anoSel = document.getElementById("fin-filtro-ano");
  if (anoSel && anoSel.options.length <= 1) {
    const anos = [...new Set(locacoes.map(l => l.retirada ? new Date(l.retirada+"T12:00:00").getFullYear() : null).filter(Boolean))].sort((a,b)=>b-a);
    anos.forEach(a => { const o = document.createElement("option"); o.value=a; o.textContent=a; anoSel.appendChild(o); });
  }
  const mesFiltro = document.getElementById("fin-filtro-mes")?.value ?? "";
  const anoFiltro = document.getElementById("fin-filtro-ano")?.value ?? "";

  let lns = locacoes.filter(l => l.status === "ativo" || l.status === "devolvido");
  if (mesFiltro !== "") lns = lns.filter(l => l.retirada && new Date(l.retirada+"T12:00:00").getMonth() === parseInt(mesFiltro));
  if (anoFiltro !== "") lns = lns.filter(l => l.retirada && new Date(l.retirada+"T12:00:00").getFullYear() === parseInt(anoFiltro));

  const rec = lns.reduce((a, b) => a + (b.entrada || 0), 0);
  const cus = lns.reduce((a, b) => a + (b.itens || []).filter(x => x.tipo !== "kit").reduce((c, d) => c + (d.custo || 0) * d.qtd, 0), 0);
  const luc = lns.reduce((a, b) => a + (b.itens || []).filter(x => x.tipo !== "kit").reduce((c, d) => c + (d.preco || 0) * d.qtd, 0), 0);
  const totalContratado = lns.reduce((a, b) => a + (b.total || 0), 0);
  const tkt = lns.length ? totalContratado / lns.length : 0;

  const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  set("fin-r", "R$" + rec.toFixed(0));
  set("fin-c", "R$" + cus.toFixed(0));
  set("fin-l", "R$" + luc.toFixed(0));
  set("fin-t", "R$" + tkt.toFixed(0));

  const tb = el("tb-fin"); if (!tb) return;
  if (!lns.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--txt3)">Sem dados no período</td></tr>'; return; }

  renderROI();

  const sorted = lns.sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
  const _finPag = window._finPag || 1;
  const _finPP  = 50;
  const finTotal = sorted.length;
  const finPages = Math.ceil(finTotal / _finPP);
  const finSlice = sorted.slice((_finPag - 1) * _finPP, _finPag * _finPP);

  const isMob   = window.innerWidth < 700;
  const twFinEl = document.getElementById("tw-fin");
  const cardsFinEl = document.getElementById("cards-fin");
  if (twFinEl)    twFinEl.style.display    = isMob ? "none" : "";
  if (cardsFinEl) cardsFinEl.style.display = isMob ? "block" : "none";

  const finRows = finSlice.map(l => {
      const c    = clientes.find(x => x.id === l.clienteId);
      const cusL = (l.itens || []).filter(x => x.tipo !== "kit").reduce((a, b) => a + (b.custo || 0) * b.qtd, 0);
      const lucL = (l.itens || []).filter(x => x.tipo !== "kit").reduce((a, b) => a + (b.preco || 0) * b.qtd, 0);
      const mg   = l.total ? ((lucL / l.total) * 100).toFixed(0) : 0;
      if (isMob) {
        return `<div class="fin-card-m">
          <div class="fin-card-m-top">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--txt)">${esc(c?.nome||"—")}</div>
              <div style="font-size:11px;color:var(--txt3);margin-top:2px">${fmtD(l.retirada)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:16px;font-weight:800;color:var(--p)">${fmtR(l.total)}</div>
            </div>
          </div>
          <div class="fin-card-m-dados">
            <div class="fin-card-m-dado"><label>Custo</label><span style="color:var(--txt2)">${fmtR(cusL)}</span></div>
            <div class="fin-card-m-dado"><label>Lucro</label><span style="color:#15803d">${fmtR(lucL)}</span></div>
            <div class="fin-card-m-dado" style="grid-column:1/-1">
              <label>Margem</label>
              <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
                <div class="prog" style="flex:1"><div class="prog-f" style="width:${Math.max(0,Math.min(100,mg))}%"></div></div>
                <span style="font-size:12px;font-weight:700">${mg}%</span>
              </div>
            </div>
          </div>
        </div>`;
      }
      return `<tr>
        <td style="font-size:12px">${fmtD(l.retirada)}</td>
        <td style="font-weight:500">${esc(c?.nome || '')}</td>
        <td style="font-weight:600;color:var(--p)">${fmtR(l.total)}</td>
        <td style="color:var(--txt2)">${fmtR(cusL)}</td>
        <td style="color:#15803d;font-weight:600">${fmtR(lucL)}</td>
        <td>
          <div class="prog" style="width:60px;display:inline-block;vertical-align:middle">
            <div class="prog-f" style="width:${Math.max(0, Math.min(100, mg))}%"></div>
          </div>
          <span style="font-size:11px">${mg}%</span>
        </td>
      </tr>`;
    });

  if (isMob && cardsFinEl) {
    cardsFinEl.innerHTML = finRows.join("");
  } else {
    tb.innerHTML = finRows.join("");
  }

  const wrapFin = el("pag-fin");
  if (wrapFin) {
    if (finPages <= 1) { wrapFin.innerHTML = ""; return; }
    const f = "font-family:'DM Sans',sans-serif;font-size:12px;";
    const mkBtn = (label, p, disabled) => disabled
      ? `<button disabled style="${f}padding:3px 10px;border-radius:6px;border:1px solid var(--bdr);background:none;color:var(--txt3);opacity:.4;cursor:default">${label}</button>`
      : `<button onclick="window._finIrPag(${p})" style="${f}padding:3px 10px;border-radius:6px;border:1px solid var(--bdr2);background:none;color:var(--txt2);cursor:pointer">${label}</button>`;
    wrapFin.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 16px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--txt3)";
    wrapFin.innerHTML =
      mkBtn("← Anterior", _finPag - 1, _finPag <= 1) +
      `<span>Página <b style="color:var(--txt)">${_finPag}</b> de <b style="color:var(--txt)">${finPages}</b> · ${finTotal} registros · <b style="color:var(--p)">${fmtR(totalContratado)}</b></span>` +
      mkBtn("Próxima →", _finPag + 1, _finPag >= finPages);
  }
}

// ─── ROI por item ──────────────────────────────────────────────────────────────
function renderROI() {
  const div = el("roi-lista"); if (!div) return;
  const lns = locacoes.filter(l => l.status === "ativo" || l.status === "devolvido");

  // Agregar ganho por item (id → { nome, custo, ganhoTotal, qtdLocacoes })
  const mapa = {};
  for (const loc of lns) {
    for (const it of (loc.itens || [])) {
      if (it.tipo === "kit") continue;
      if (!mapa[it.id]) {
        // Buscar custo original do cadastro
        const itemCad = itens.find(x => x.id === it.id);
        mapa[it.id] = {
          nome:       it.nome,
          custo:      (itemCad?.custo || 0) * (itemCad?.qtd || 1),
          ganho:      0,
          locacoes:   0
        };
      }
      mapa[it.id].ganho    += (it.preco || 0) * (it.qtd || 1);
      mapa[it.id].locacoes += 1;
    }
  }

  const lista = Object.values(mapa).filter(x => x.custo > 0 || x.ganho > 0);
  if (!lista.length) {
    div.innerHTML = '<div style="padding:24px;text-align:center;color:var(--txt3);font-size:13px"><i class="ti ti-chart-bar" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>Nenhum item com locacoes registradas</div>';
    return;
  }

  // Ordenar: maior ROI % primeiro
  lista.sort((a, b) => {
    const ra = a.custo > 0 ? a.ganho / a.custo : 0;
    const rb = b.custo > 0 ? b.ganho / b.custo : 0;
    return rb - ra;
  });

  div.innerHTML = lista.map(it => {
    const pct     = it.custo > 0 ? (it.ganho / it.custo) * 100 : 0;
    const pctDisp = Math.min(pct, 200); // barra vai até 200%
    const pago    = Math.min(pct, 100);
    const lucro   = Math.max(0, pct - 100);

    // Cor da barra
    let corBarra, label, labelCor;
    if (pct <= 0) {
      corBarra = "#e5e7eb"; label = "Sem locacoes"; labelCor = "var(--txt3)";
    } else if (pct < 50) {
      corBarra = "#f97316"; label = `${pct.toFixed(0)}% recuperado`; labelCor = "#c2410c";
    } else if (pct < 100) {
      corBarra = "#eab308"; label = `${pct.toFixed(0)}% recuperado`; labelCor = "#854d0e";
    } else if (pct < 150) {
      corBarra = "#22c55e"; label = `✓ Pago + ${lucro.toFixed(0)}% lucro`; labelCor = "#15803d";
    } else {
      corBarra = "#a855f7"; label = `🚀 ${pct.toFixed(0)}% — Excelente ROI!`; labelCor = "#7e22ce";
    }

    // Largura da barra de custo (recuperação) e de lucro
    const wPago  = Math.min(pago,  100).toFixed(1);
    const wLucro = Math.min(lucro, 100).toFixed(1);

    return `
    <div style="padding:12px 16px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:14px">
      <!-- Info -->
      <div style="min-width:160px;max-width:180px">
        <div style="font-weight:600;font-size:13px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.nome}</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:1px">${it.locacoes} locaç${it.locacoes === 1 ? "ão" : "ões"} &bull; Custo: ${fmtR(it.custo)}</div>
      </div>

      <!-- Barra dupla (custo + lucro) -->
      <div style="flex:1;position:relative">
        <!-- Label de 100% -->
        <div style="position:absolute;left:50%;top:-14px;transform:translateX(-50%);font-size:9px;color:var(--txt3)">100%</div>
        <!-- Linha de 100% -->
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--bdr2);z-index:1"></div>

        <!-- Trilho -->
        <div style="height:14px;background:var(--bdr);border-radius:8px;overflow:hidden;position:relative">
          <!-- Parte paga (custo recuperado) - 0 a 50% da barra = 0 a 100% do custo -->
          <div style="
            position:absolute;left:0;top:0;bottom:0;
            width:${(parseFloat(wPago)/2).toFixed(1)}%;
            background:${pct >= 100 ? "#22c55e" : corBarra};
            border-radius:8px 0 0 8px;
            transition:width .6s ease
          "></div>
          <!-- Parte de lucro (acima de 100%) - 50% a 100% da barra = 100% a 200% ROI -->
          ${lucro > 0 ? `<div style="
            position:absolute;left:50%;top:0;bottom:0;
            width:${(Math.min(lucro,100)/2).toFixed(1)}%;
            background:#a855f7;
            transition:width .6s ease
          "></div>` : ""}
        </div>

        <!-- Labels embaixo -->
        <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:10px;color:var(--txt3)">
          <span>0%</span>
          <span style="font-weight:700;font-size:11px;color:${labelCor}">${label}</span>
          <span>200%</span>
        </div>
      </div>

      <!-- Valores -->
      <div style="text-align:right;min-width:90px">
        <div style="font-weight:700;font-size:13px;color:${pct >= 100 ? "#15803d" : "#b45309"}">${fmtR(it.ganho)}</div>
        <div style="font-size:10px;color:var(--txt3)">gerado</div>
      </div>
    </div>`;
  }).join("");
}

window.renderFin = renderFin;
window._finIrPag = function(p) { window._finPag = p; renderFin(); };
window.renderROI = renderROI;

// ── Aprovar transação pendente sem locação vinculada ──────────────────────────
window.aprovarTransacao = async function(transId, btn) {
  if (!transId) return;
  if (btn) { btn.disabled = true; btn.textContent = "Aprovando..."; }
  try {
    await updateDoc(doc(db,"transacoes",transId), {
      status: "aprovado", origem: "admin_confirmado", confirmadoEm: serverTimestamp(),
    });
    notif("✅ Transação aprovada!");
    window.renderTransacoes?.();
  } catch(e) {
    notif("Erro: " + e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = "✅ Aprovar"; }
  }
};

// ─── Transações online ────────────────────────────────────────────────────────
// ─── Helpers de pagamentos ────────────────────────────────────────────────────
function _getNomeCliente(t) {
  // Transações do Firestore podem ter clienteNome direto ou clienteId
  if (t.clienteNome) return t.clienteNome;
  if (t.clienteId) {
    const c = clientes.find(x => x.id === t.clienteId);
    if (c?.nome) return c.nome;
  }
  // Fallback: buscar via locacaoId
  if (t.locacaoId) {
    const loc = locacoes?.find(l => l.id === t.locacaoId);
    if (loc) {
      const c = clientes.find(x => x.id === loc.clienteId);
      if (c?.nome) return c.nome;
      if (loc.nomeCliente) return loc.nomeCliente;
    }
  }
  return t.clienteEmail || "—";
}

function _getTransacoesFull() {
  const trans = [...(window._transacoes || [])];
  const temTrans = (locId, tp) => trans.some(t => t.locacaoId === locId && (t.tipo||"total") === tp);
  for (const l of (locacoes || [])) {
    const c = clientes.find(x => x.id === l.clienteId);
    const nome = c?.nome || l.nomeCliente || "";
    if (l.pagEntradaEm && !temTrans(l.id, "entrada"))
      trans.push({ _fromLoc:true, id:l.id+"_ent", locacaoId:l.id,
        clienteNome:nome, clienteEmail:l.email||"",
        valor:l.entrada||0, metodo:"pix", status:"aprovado", tipo:"entrada",
        evento:l.evento||l.tipoEvento||"",
        criadoEm:{seconds:new Date(l.pagEntradaEm).getTime()/1000},
        origem:"manual", _locStatus:l.status });
    if (l.pagTotalEm && !temTrans(l.id, "total"))
      trans.push({ _fromLoc:true, id:l.id+"_tot", locacaoId:l.id,
        clienteNome:nome, clienteEmail:l.email||"",
        valor:l.entrada||l.total||0, metodo:"pix", status:"aprovado", tipo:"total",
        evento:l.evento||l.tipoEvento||"",
        criadoEm:{seconds:new Date(l.pagTotalEm).getTime()/1000},
        origem:"manual", _locStatus:l.status });
  }
  return trans.sort((a,b) => (b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
}

// ─── Atualizar cards de resumo ────────────────────────────────────────────────
function _atualizarStatsPag(trans) {
  const agora    = new Date();
  const mesAtual = agora.getMonth();
  const anoAtual = agora.getFullYear();

  const doMes    = trans.filter(t => {
    const d = t.criadoEm?.seconds ? new Date(t.criadoEm.seconds*1000) : null;
    return d && d.getMonth()===mesAtual && d.getFullYear()===anoAtual;
  });

  const recebido = doMes.filter(t => t.status==="aprovado").reduce((s,t)=>s+(t.valor||0),0);
  const pendente = trans.filter(t => t.status==="pendente").reduce((s,t)=>s+(t.valor||0),0);
  const qtd      = doMes.filter(t => t.status==="aprovado").length;

  // A receber = saldo em aberto de locações ativas
  const aReceber = (locacoes||[])
    .filter(l => ["ativo","aceito","aguardando_entrada","aguardando_assinatura"].includes(l.status))
    .reduce((s,l) => s + Math.max(0, (l.saldo||0)), 0);

  const sv = (id,v) => { const e=el(id); if(e) e.textContent=v; };
  sv("pag-stat-recebido", fmtR(recebido));
  sv("pag-stat-pendente",  fmtR(pendente));
  sv("pag-stat-areceber",  fmtR(aReceber));
  sv("pag-stat-qtd",       qtd + " transaç" + (qtd===1?"ão":"ões"));
}

// ─── renderTransacoes ─────────────────────────────────────────────────────────
window.renderTransacoes = function() {
  const divPag = el("pag-trans-lista");
  const divFin = el("fin-trans-lista");
  if (!divPag && !divFin) return;

  const allTrans = _getTransacoesFull();
  _atualizarStatsPag(allTrans);

  // Badges menu e aba
  const menuBadge = el("bdg-trans");
  const pendentes = allTrans.filter(t => t.status==="pendente").length;
  if (menuBadge) {
    menuBadge.textContent  = pendentes;
    menuBadge.style.display = pendentes > 0 ? "" : "none";
  }
  const abaBadge = el("pag-trans-badge-aba");
  if (abaBadge) abaBadge.textContent = allTrans.length || "0";

  // Atualizar lista fin (financeiro) sem filtros
  const badge2 = el("fin-trans-badge");
  if (badge2) badge2.textContent = allTrans.length + " pagamento" + (allTrans.length!==1?"s":"");
  if (divFin) {
    if (!allTrans.length) {
      divFin.innerHTML = `<div style="text-align:center;padding:20px;color:var(--txt3)"><i class="ti ti-credit-card" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>Nenhuma transação ainda.</div>`;
    } else {
      _renderTabelaTrans(divFin, allTrans);
    }
  }
  if (!divPag) return;

  // Filtros
  const busca       = (el("pag-busca")?.value||"").toLowerCase();
  const filtroSt    = el("pag-filtro-status")?.value||"";
  const filtroTipo  = el("pag-filtro-tipo")?.value||"";
  const filtroMes   = el("pag-filtro-mes")?.value;

  let trans = allTrans.filter(t => {
    if (busca && !(t.clienteNome||"").toLowerCase().includes(busca) && !(t.evento||"").toLowerCase().includes(busca)) return false;
    if (filtroSt   && t.status !== filtroSt)   return false;
    if (filtroTipo && (t.tipo||"total") !== filtroTipo) return false;
    if (filtroMes !== "" && filtroMes !== undefined && filtroMes !== null) {
      const d = t.criadoEm?.seconds ? new Date(t.criadoEm.seconds*1000) : null;
      if (!d || d.getMonth() !== parseInt(filtroMes)) return false;
    }
    return true;
  });

  // Resumo filtrado
  const resumoEl = el("pag-trans-resumo");
  if (resumoEl) {
    const total = trans.reduce((s,t)=>s+(t.valor||0),0);
    const aprov = trans.filter(t=>t.status==="aprovado").reduce((s,t)=>s+(t.valor||0),0);
    const pend  = trans.filter(t=>t.status==="pendente").length;
    const temFiltro = busca||filtroSt||filtroTipo||(filtroMes!==""&&filtroMes!=null&&filtroMes!==undefined);
    if (temFiltro && trans.length) {
      resumoEl.style.display = "";
      resumoEl.innerHTML = `${trans.length} transaç${trans.length===1?"ão":"ões"} filtrada${trans.length===1?"":"s"} &nbsp;·&nbsp; Total: <strong>${fmtR(total)}</strong> &nbsp;·&nbsp; Aprovado: <strong>${fmtR(aprov)}</strong>${pend?` &nbsp;·&nbsp; <span style="color:#b45309">${pend} pendente${pend>1?"s":""}</span>`:""}`;
    } else {
      resumoEl.style.display = "none";
    }
  }

  const badge = el("pag-trans-badge");
  if (badge) badge.textContent = trans.length + " pagamento" + (trans.length!==1?"s":"");

  if (!trans.length) {
    divPag.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--txt3)">
      <i class="ti ti-credit-card" style="font-size:36px;display:block;margin-bottom:10px;opacity:.2"></i>
      ${allTrans.length ? "Nenhuma transação encontrada com esses filtros." : "Nenhuma transação ainda."}
    </div>`;
    return;
  }

  _renderTabelaTrans(divPag, trans);
};

function _renderTabelaTrans(div, trans) {
  const corSt = { pendente:"#b45309", aprovado:"#15803d", recusado:"#b91c1c", processando:"#1d4ed8" };
  const bgSt  = { pendente:"#fef9c3", aprovado:"#f0fdf4", recusado:"#fff1f2", processando:"#eff6ff" };
  const metodoIcon = { pix:"⚡", dinheiro:"💵", ted:"🏦", debito:"💳", credito:"💳", deposito:"🏧", cheque:"📝", cartao:"💳" };

  const isMob = window.innerWidth < 700;
  if (isMob) {
    div.innerHTML = trans.map(t => {
      const nome = _getNomeCliente(t);
      const d    = t.criadoEm?.seconds ? new Date(t.criadoEm.seconds*1000) : null;
      const data = d ? d.toLocaleDateString("pt-BR") : "—";
      const metodo = t.metodo || (t._fromLoc ? "pix" : "—");
      const metIco = metodoIcon[metodo] || "💰";
      const tipoLabel = t.tipo==="entrada" ? "Entrada" : "Total";
      const tipoCor   = t.tipo==="entrada" ? "#1d4ed8" : "#7c3aed";
      const tipoBg    = t.tipo==="entrada" ? "#eff6ff" : "#f5f3ff";
      const stLabel   = t.status==="pendente" ? "Aguardando" : t.status==="aprovado" ? "Aprovado" : t.status==="recusado" ? "Recusado" : t.status||"—";
      const loc       = locacoes?.find(l => l.id === t.locacaoId);
      const jaAtivo   = loc?.status==="ativo" || loc?.status==="devolvido";
      const podeDel   = !t._fromLoc;
      return `<div style="background:var(--sur);border:1.5px solid var(--bdr);border-radius:14px;margin-bottom:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="padding:12px 14px;background:var(--bg);border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--txt)">${esc(nome)}</div>
            <div style="font-size:11px;color:var(--txt3);margin-top:2px">${esc(t.evento||"—")} · ${data}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:800;color:${t.status==="aprovado"?"#15803d":"var(--txt)"}">${fmtR(t.valor||0)}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;padding:10px 14px;gap:8px">
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase">Tipo</label>
            <span style="font-size:12px;font-weight:700;background:${tipoBg};color:${tipoCor};padding:2px 8px;border-radius:7px;display:inline-block">${tipoLabel}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase">Status</label>
            <span style="font-size:12px;font-weight:700;color:${corSt[t.status]||"var(--txt)"}">${metIco} ${t.status==="pendente"?"⏳":""} ${stLabel}</span>
          </div>
        </div>
        <div style="padding:10px 14px;border-top:1px solid var(--bdr);background:var(--bg);display:flex;flex-wrap:wrap;gap:7px">
          ${t.status==="pendente" && t.locacaoId ? `<button onclick="confirmarPagamentoAdmin('${t.locacaoId}','${t.tipo||"total"}',${t.valor||0},this)" style="padding:8px 14px;border-radius:10px;border:none;background:#16a34a;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ Aprovar</button>` :
           t.status==="pendente" ? `<button onclick="aprovarTransacao('${t.id}',this)" style="padding:8px 14px;border-radius:10px;border:none;background:#16a34a;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ Aprovar</button>` :
           (!jaAtivo && t.locacaoId && !t._fromLoc) ? `<button onclick="confirmarPagamentoAdmin('${t.locacaoId}','${t.tipo||"total"}',${t.valor||0},this)" style="padding:8px 14px;border-radius:10px;border:1.5px solid #16a34a;background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ Confirmar</button>` :
           `<span style="font-size:12px;color:#15803d;font-weight:600">✓ Confirmado</span>`}
          ${t.status==="aprovado" && t.locacaoId ? `
            <button onclick="enviarContratoCliente('${t.locacaoId}',this)" style="padding:8px 12px;border-radius:10px;border:1.5px solid #ddd6fe;background:#f5f3ff;color:#6d28d9;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px"><i class="ti ti-file-text"></i> Contrato</button>
            <button onclick="enviarReciboCliente('${t.locacaoId}','${t.tipo||"total"}',${t.valor||0},this)" style="padding:8px 12px;border-radius:10px;border:1.5px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px"><i class="ti ti-receipt"></i> Recibo</button>` : ""}
          ${podeDel ? `<button onclick="excluirTransacao('${t.id}',this)" style="padding:8px 10px;border-radius:10px;border:1.5px solid #fca5a5;background:#fff1f2;color:#b91c1c;font-size:13px;cursor:pointer"><i class="ti ti-trash"></i></button>` : ""}
        </div>
      </div>`;
    }).join("");
    return;
  }

  div.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:var(--bg)">
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;border-bottom:1px solid var(--bdr)">Data</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid var(--bdr)">Cliente / Evento</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;border-bottom:1px solid var(--bdr)">Tipo</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;border-bottom:1px solid var(--bdr)">Método</th>
      <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;border-bottom:1px solid var(--bdr)">Valor</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;border-bottom:1px solid var(--bdr)">Status</th>
      <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid var(--bdr)">Ação</th>
    </tr></thead><tbody>` +
  trans.map((t, i) => {
    const nome    = _getNomeCliente(t);
    const d       = t.criadoEm?.seconds ? new Date(t.criadoEm.seconds*1000) : null;
    const data    = d ? d.toLocaleDateString("pt-BR") : "—";
    const hora    = d ? d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";
    const tipoLabel = t.tipo==="entrada" ? "Entrada" : "Total";
    const tipoCor   = t.tipo==="entrada" ? "#1d4ed8" : "#7c3aed";
    const tipoBg    = t.tipo==="entrada" ? "#eff6ff" : "#f5f3ff";
    const loc     = locacoes?.find(l => l.id === t.locacaoId);
    const jaAtivo = loc?.status==="ativo" || loc?.status==="devolvido";
    const metodo  = t.metodo || (t._fromLoc ? "pix" : "—");
    const metIco  = metodoIcon[metodo] || "💰";
    const stLabel = t.status==="pendente" ? "Aguardando aprovação"
                  : t.status==="aprovado" ? "Aprovado"
                  : t.status==="recusado" ? "Recusado"
                  : t.status || "—";
    const isUlt = i === trans.length-1;
    const podeDel = !t._fromLoc; // só pode excluir transações reais do Firestore

    return `<tr style="border-bottom:${isUlt?"none":"1px solid var(--bdr)"}">
      <td style="padding:12px 14px;white-space:nowrap">
        <div style="font-size:12px;font-weight:600">${data}</div>
        <div style="font-size:10px;color:var(--txt3)">${hora}</div>
      </td>
      <td style="padding:12px 14px;max-width:200px">
        <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nome)}</div>
        <div style="font-size:11px;color:var(--txt3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.evento||"—")}</div>
      </td>
      <td style="padding:12px 14px">
        <span style="font-size:11px;font-weight:700;background:${tipoBg};color:${tipoCor};padding:3px 9px;border-radius:8px">${tipoLabel}</span>
      </td>
      <td style="padding:12px 14px;font-size:12px">
        <span title="${metodo}">${metIco} ${metodo.charAt(0).toUpperCase()+metodo.slice(1)}</span>
      </td>
      <td style="padding:12px 14px;text-align:right">
        <div style="font-weight:700;font-size:14px;color:${t.status==="aprovado"?"#15803d":"var(--txt)"}">${fmtR(t.valor||0)}</div>
      </td>
      <td style="padding:12px 14px">
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${corSt[t.status]||"var(--txt)"};background:${bgSt[t.status]||"var(--bg)"};padding:3px 9px;border-radius:20px;white-space:nowrap">
          ${t.status==="pendente"?"⏳":t.status==="aprovado"?"✓":t.status==="recusado"?"✗":"·"}
          ${stLabel}
        </span>
      </td>
      <td style="padding:12px 14px;text-align:right;white-space:nowrap">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap">
        ${t.status==="pendente" && t.locacaoId ? `
          <button onclick="confirmarPagamentoAdmin('${t.locacaoId}','${t.tipo||"total"}',${t.valor||0},this)"
            style="padding:5px 12px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
            ✅ Aprovar
          </button>` :
        t.status==="pendente" ? `
          <button onclick="aprovarTransacao('${t.id}',this)"
            style="padding:5px 12px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
            ✅ Aprovar
          </button>` :
        (!jaAtivo && t.locacaoId && !t._fromLoc) ? `
          <button onclick="confirmarPagamentoAdmin('${t.locacaoId}','${t.tipo||"total"}',${t.valor||0},this)"
            style="padding:4px 10px;border-radius:8px;border:1.5px solid #16a34a;background:#f0fdf4;color:#15803d;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
            ✅ Confirmar
          </button>` :
        `<span style="font-size:11px;color:#15803d;font-weight:600">✓ Confirmado</span>`}
        ${t.status==="aprovado" && t.locacaoId ? `
          <button onclick="enviarContratoCliente('${t.locacaoId}',this)" title="Enviar contrato para a área do cliente"
            style="padding:5px 8px;border-radius:8px;border:1.5px solid #ddd6fe;background:#f5f3ff;color:#6d28d9;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px">
            <i class="ti ti-file-text" style="font-size:12px"></i><span>Contrato</span>
          </button>
          <button onclick="enviarReciboCliente('${t.locacaoId}','${t.tipo||"total"}',${t.valor||0},this)" title="Gerar e enviar recibo para o cliente"
            style="padding:5px 8px;border-radius:8px;border:1.5px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px">
            <i class="ti ti-receipt" style="font-size:12px"></i><span>Recibo</span>
          </button>` : ""}
        ${podeDel ? `
          <button onclick="excluirTransacao('${t.id}',this)" title="Excluir transação"
            style="padding:5px 7px;border-radius:8px;border:1.5px solid #fca5a5;background:#fff1f2;color:#b91c1c;font-size:12px;cursor:pointer;line-height:1">
            <i class="ti ti-trash"></i>
          </button>` : ""}
        </div>
      </td>
    </tr>`;
  }).join("") + "</tbody></table></div>";
}

// ─── Exportar CSV ─────────────────────────────────────────────────────────────
window.exportarTransacoesCSV = function() {
  const trans = _getTransacoesFull();
  const linhas = [["Data","Hora","Cliente","Evento","Tipo","Método","Valor","Status"]];
  trans.forEach(t => {
    const d = t.criadoEm?.seconds ? new Date(t.criadoEm.seconds*1000) : null;
    linhas.push([
      d ? d.toLocaleDateString("pt-BR") : "—",
      d ? d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "—",
      _getNomeCliente(t),
      t.evento||"—",
      t.tipo==="entrada" ? "Entrada" : "Total",
      t.metodo||"—",
      (t.valor||0).toFixed(2).replace(".",","),
      t.status||"—"
    ]);
  });
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv);
  a.download = `pagamentos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  notif("✅ CSV exportado com sucesso!");
};

// ─── Exportar PDF (extrato simples) ──────────────────────────────────────────
// ─── Enviar contrato para área do cliente ────────────────────────────────────
window.enviarContratoCliente = async function(locId, btn) {
  const loc = locacoes?.find(l => l.id === locId);
  if (!loc) return notif("Locação não encontrada.", true);

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Enviando...'; }

  try {
    if (loc.contrato) {
      // Contrato já existe — apenas notificar
      notif("✅ Contrato já disponível na área do cliente!");
    } else {
      // Gerar o contrato (salva no Firestore automaticamente via gerarContrato)
      window.gerarContrato?.({ ...loc });
      // Aguardar um tick para o updateDoc do contrato.js completar
      await new Promise(r => setTimeout(r, 800));
      notif("✅ Contrato gerado e enviado para a área do cliente!");
    }
    window.renderTransacoes?.();
  } catch(e) {
    notif("Erro: " + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-text" style="font-size:12px"></i><span>Contrato</span>'; }
  }
};

// ─── Gerar e enviar recibo para área do cliente ───────────────────────────────
window.enviarReciboCliente = async function(locId, tipo, valor, btn) {
  const loc = locacoes?.find(l => l.id === locId);
  if (!loc) return notif("Locação não encontrada.", true);

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Gerando...'; }

  try {
    // Determinar forma de pagamento — buscar na transação mais recente
    const trans = (window._transacoes || []).find(t => t.locacaoId === locId && t.status === "aprovado");
    const forma = trans?.metodo || "pix";
    // gerarRecibo salva automaticamente no Firestore (loc.recibos)
    window.gerarRecibo?.(locId, valor, forma, tipo === "entrada" ? "entrada" : "quitacao");
    await new Promise(r => setTimeout(r, 600));
    notif("✅ Recibo gerado e disponível na área do cliente!");
    window.renderTransacoes?.();
  } catch(e) {
    notif("Erro: " + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-receipt" style="font-size:12px"></i><span>Recibo</span>'; }
  }
};

// ─── Excluir transação ────────────────────────────────────────────────────────
window.excluirTransacao = async function(id, btn) {
  const ok = await window.confirmar({
    titulo: "Excluir transação",
    msg: "Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.",
    tipo: "danger", labelOk: "Excluir"
  });
  if (!ok) return;
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="ti ti-loader"></i>'; }
  try {
    const { deleteDoc, doc: d2 } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await deleteDoc(d2(db,"transacoes",id));
    notif("Transação excluída.");
    window.renderTransacoes?.();
  } catch(e) {
    notif("Erro: "+e.message, true);
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="ti ti-trash"></i>'; }
  }
};

window.exportarTransacoesPDF = function() {
  const trans = _getTransacoesFull().filter(t => t.status==="aprovado");
  const total = trans.reduce((s,t)=>s+(t.valor||0),0);
  const rows  = trans.map(t => {
    const d = t.criadoEm?.seconds ? new Date(t.criadoEm.seconds*1000).toLocaleDateString("pt-BR") : "—";
    return `<tr><td>${d}</td><td>${t.clienteNome||"—"}</td><td>${t.evento||"—"}</td><td>${t.tipo==="entrada"?"Entrada":"Total"}</td><td style="text-align:right;font-weight:700;color:#15803d">${(t.valor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td></tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Extrato de Pagamentos</title>
  <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f5f5f5;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:8px 12px;border-bottom:1px solid #eee}.total{font-size:15px;font-weight:700;text-align:right;padding-top:16px}</style></head>
  <body><h1>Extrato de Pagamentos</h1><p>Gerado em ${new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})}</p>
  <table><thead><tr><th>Data</th><th>Cliente</th><th>Evento</th><th>Tipo</th><th style="text-align:right">Valor</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="total">Total recebido: ${total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</div>
  <script>window.print();</script></body></html>`;
  const w = window.open("","_blank");
  w.document.write(html);
  w.document.close();
};

// ─── Lançamento manual ────────────────────────────────────────────────────────
window.preencherDadosManual = function() {
  const sel = document.getElementById("pag-manual-loc");
  const locId = sel?.value;
  const resumo = el("pag-manual-resumo");
  if (!locId || !resumo) return;
  const loc = locacoes?.find(l => l.id === locId);
  if (!loc) { resumo.style.display="none"; return; }
  resumo.style.display = "";
  const sv2 = (id,v) => { const e=el(id); if(e) e.textContent=v; };
  sv2("pag-res-total",   fmtR(loc.total||0));
  sv2("pag-res-entrada", fmtR(loc.entrada||0));
  sv2("pag-res-saldo",   fmtR(Math.max(0,loc.saldo||0)));
  // Pré-preencher valor com o saldo em aberto
  const valEl = el("pag-manual-valor");
  if (valEl && loc.saldo > 0) valEl.value = loc.saldo.toFixed(2);
};

window.renderManualLoc = function() {
  const sel = document.getElementById("pag-manual-loc");
  if (!sel) return;
  const atual = sel.value;
  const opts = (locacoes||[])
    .filter(l => l.status==="ativo" || l.status==="aguardando_entrada")
    .sort((a,b) => {
      const na = clientes.find(x=>x.id===a.clienteId)?.nome || "";
      const nb = clientes.find(x=>x.id===b.clienteId)?.nome || "";
      return na.localeCompare(nb);
    })
    .map(l => {
      const c = clientes.find(x => x.id === l.clienteId);
      const nome = c?.nome || l.nomeCliente || "—";
      return `<option value="${l.id}" ${l.id===atual?"selected":""}>${esc(nome)} — ${esc(l.evento||l.tipoEvento||"—")} (saldo: ${fmtR(Math.max(0,l.saldo||0))})</option>`;
    });
  sel.innerHTML = `<option value="">Selecionar locação...</option>` + opts.join("");
};

window.lancarPagamentoManual = async function() {
  const locId  = el("pag-manual-loc")?.value;
  const tipo   = el("pag-manual-tipo")?.value || "total";
  const valor  = parseFloat(el("pag-manual-valor")?.value || 0);
  const forma  = el("pag-manual-forma")?.value || "dinheiro";
  const data   = el("pag-manual-data")?.value;
  const obs    = el("pag-manual-obs")?.value || "";

  if (!locId)  return notif("Selecione uma locação.", true);
  if (!valor || valor <= 0) return notif("Informe um valor válido.", true);

  const btn = document.querySelector("#pag-content-manual .btn-p");
  if (btn) { btn.disabled=true; btn.textContent="Registrando..."; }

  try {
    const loc   = locacoes.find(l => l.id === locId);
    const agora = new Date().toISOString();
    const total = loc?.total || 0;

    // Registrar transação
    await addDoc(collection(db,"transacoes"), {
      locacaoId:    locId,
      clienteNome:  loc?.nomeCliente || "",
      evento:       loc?.evento || loc?.tipoEvento || "",
      valor,
      tipo,
      metodo:       forma,
      status:       "aprovado",
      obs,
      dataRecebimento: data || agora.slice(0,10),
      criadoEm:     serverTimestamp(),
      lancadoManual: true,
    });

    // Atualizar locação
    let upd = {};
    if (tipo === "entrada") {
      upd = { status:"ativo", entrada:valor, saldo:Math.max(0,total-valor), pagEntradaEm:agora };
    } else if (tipo === "total" || (tipo==="parcial" && valor >= (loc?.saldo||0))) {
      upd = { status:"ativo", saldo:0, entrada:total, pagTotalEm:agora };
    } else {
      // Parcial
      const novoSaldo = Math.max(0,(loc?.saldo||total) - valor);
      const novaEntrada = (loc?.entrada||0) + valor;
      upd = { status:"ativo", entrada:novaEntrada, saldo:novoSaldo };
    }
    await updateDoc(doc(db,"locacoes",locId), upd);

    notif("✅ Pagamento registrado com sucesso!");
    // Limpar formulário
    ["pag-manual-loc","pag-manual-valor","pag-manual-obs"].forEach(id => { const e=el(id); if(e) e.value=""; });
    if (el("pag-manual-resumo")) el("pag-manual-resumo").style.display="none";
    window.renderTransacoes?.();
    window.renderLoc?.();
    window.renderManualHistorico?.();
  } catch(e) {
    notif("Erro: "+e.message, true);
  } finally {
    if (btn) { btn.disabled=false; btn.textContent="✓ Confirmar e registrar pagamento"; }
  }
};

window.renderManualHistorico = function() {
  const div = el("pag-manual-lista"); if (!div) return;
  const manuais = (_getTransacoesFull()).filter(t => t.lancadoManual || t._fromLoc);
  if (!manuais.length) {
    div.innerHTML = `<div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px"><i class="ti ti-clock" style="font-size:28px;display:block;margin-bottom:8px;opacity:.2"></i>Nenhum lançamento manual ainda.</div>`;
    return;
  }
  div.innerHTML = manuais.slice(0,20).map(t => {
    const d = t.criadoEm?.seconds ? new Date(t.criadoEm.seconds*1000).toLocaleDateString("pt-BR") : "—";
    const metodo = t.metodo||"—";
    const metIco = {pix:"⚡",dinheiro:"💵",ted:"🏦",debito:"💳",credito:"💳",deposito:"🏧",cheque:"📝"}[metodo]||"💰";
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--bdr)">
      <div style="width:36px;height:36px;border-radius:10px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${metIco}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${esc(t.clienteNome||"—")}</div>
        <div style="font-size:11px;color:var(--txt3)">${esc(t.evento||"—")} · ${d} · ${metodo}</div>
        ${t.obs?`<div style="font-size:11px;color:var(--txt2);margin-top:2px;font-style:italic">${esc(t.obs)}</div>`:""}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-weight:700;font-size:14px;color:#15803d">${fmtR(t.valor||0)}</div>
        <div style="font-size:10px;color:var(--txt3)">${t.tipo==="entrada"?"Entrada":"Total"}</div>
      </div>
    </div>`;
  }).join("");
};

// ─── Recibos ──────────────────────────────────────────────────────────────────
window.renderRecibos = function() {
  const div = el("pag-recibos-lista"); if (!div) return;
  const busca = (el("pag-recibo-busca")?.value||"").toLowerCase();
  const locs = (locacoes||[]).filter(l => {
    if (l.status!=="ativo" && l.status!=="devolvido") return false;
    if (!busca) return true;
    const c = clientes.find(x=>x.id===l.clienteId);
    const nome = (c?.nome||l.nomeCliente||"").toLowerCase();
    return nome.includes(busca) || (l.evento||"").toLowerCase().includes(busca);
  }).sort((a,b) => (b.retirada||"").localeCompare(a.retirada||""));

  if (!locs.length) {
    div.innerHTML = `<div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px"><i class="ti ti-file-text" style="font-size:28px;display:block;margin-bottom:8px;opacity:.2"></i>${busca?"Nenhuma locação encontrada.":"Nenhuma locação com pagamento ainda."}</div>`;
    return;
  }

  div.innerHTML = locs.map(l => {
    const c2     = clientes.find(x => x.id === l.clienteId);
    const nome   = c2?.nome || l.nomeCliente || "—";
    const saldo  = Math.max(0, l.saldo||0);
    const pago   = saldo <= 0;
    const status = pago ? `<span style="background:#f0fdf4;color:#15803d;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600">✓ Pago</span>`
                        : `<span style="background:#fef9c3;color:#b45309;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600">Saldo ${fmtR(saldo)}</span>`;
    return `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--bdr);flex-wrap:wrap">
      <div style="flex:1;min-width:160px">
        <div style="font-weight:600;font-size:13px">${esc(nome)}</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:2px">${esc(l.evento||l.tipoEvento||"—")} · ${fmtD(l.retirada)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-right:8px">
        <div style="font-weight:700;font-size:14px">${fmtR(l.total||0)}</div>
        ${status}
      </div>
      <button onclick="gerarReciboPag('${l.id}')" class="btn btn-s btn-sm">
        <i class="ti ti-file-text"></i> Gerar recibo
      </button>
    </div>`;
  }).join("");
};

window.gerarReciboPag = function(locId) {
  const l = locacoes?.find(x => x.id===locId); if (!l) return;
  const cfg = window._cfg || {};
  const cliRec = clientes.find(x => x.id === l.clienteId);
  const nomeRec = cliRec?.nome || l.nomeCliente || "—";
  const agora = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const saldo = Math.max(0,l.saldo||0);
  const pago  = (l.total||0)-(saldo);
  const html  = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recibo</title>
  <style>
    body{font-family:Arial,sans-serif;padding:40px;max-width:680px;margin:0 auto;color:#111}
    .logo{text-align:center;margin-bottom:24px}
    .logo h1{font-size:24px;color:#d4307a;margin:0}
    .logo p{font-size:12px;color:#666;margin:4px 0 0}
    h2{font-size:16px;text-align:center;letter-spacing:2px;text-transform:uppercase;margin:0 0 24px;padding-bottom:12px;border-bottom:2px solid #d4307a}
    .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:13px}
    .row strong{color:#111}.lbl{color:#666}
    .total{background:#fef9f5;border-radius:10px;padding:14px 18px;margin-top:16px;display:flex;justify-content:space-between;align-items:center}
    .total .v{font-size:22px;font-weight:800;color:#d4307a}
    .assinatura{margin-top:48px;text-align:center;font-size:11px;color:#888}
    .assinatura .linha{border-top:1px solid #ccc;width:220px;margin:0 auto 6px}
    @media print{body{padding:20px}}
  </style></head><body>
  <div class="logo"><h1>${esc(cfg.nome||"KATRESELI")}</h1><p>${esc(cfg.slogan||"Decorações para Festas")}</p></div>
  <h2>Recibo de Pagamento</h2>
  <div class="row"><span class="lbl">Cliente</span><span><strong>${esc(l.nomeCliente||"—")}</strong></span></div>
  <div class="row"><span class="lbl">Evento</span><span>${esc(l.evento||l.tipoEvento||"—")}</span></div>
  <div class="row"><span class="lbl">Período</span><span>${fmtD(l.retirada)} → ${fmtD(l.devolucao)}</span></div>
  <div class="row"><span class="lbl">Valor total do contrato</span><span><strong>${fmtR(l.total||0)}</strong></span></div>
  <div class="row"><span class="lbl">Valor pago</span><span style="color:#15803d;font-weight:700">${fmtR(pago)}</span></div>
  ${saldo>0?`<div class="row"><span class="lbl">Saldo a pagar</span><span style="color:#d97706;font-weight:700">${fmtR(saldo)}</span></div>`:""}
  <div class="total"><span>Total pago</span><span class="v">${fmtR(pago)}</span></div>
  <p style="font-size:12px;color:#888;margin-top:20px;text-align:center">Emitido em ${agora}</p>
  <div class="assinatura"><div class="linha"></div>${esc(cfg.responsavel||cfg.nome||"KATRESELI")}<br>Locador(a)</div>
  <script>window.print();</script></body></html>`;
  const w = window.open("","_blank");
  w.document.write(html);
  w.document.close();
};


window._finExportCSV = function() {
  const mesFiltro = document.getElementById("fin-filtro-mes")?.value ?? "";
  const anoFiltro = document.getElementById("fin-filtro-ano")?.value ?? "";
  let lns = locacoes.filter(l => l.status === "ativo" || l.status === "devolvido");
  if (mesFiltro !== "") lns = lns.filter(l => l.retirada && new Date(l.retirada+"T12:00:00").getMonth() === parseInt(mesFiltro));
  if (anoFiltro !== "") lns = lns.filter(l => l.retirada && new Date(l.retirada+"T12:00:00").getFullYear() === parseInt(anoFiltro));
  const h = ["Data","Cliente","Evento","Total","Custo","Lucro","Margem%","Entrada","Saldo","Status"];
  const rows = lns.sort((a,b)=>(a.retirada||"").localeCompare(b.retirada||"")).map(l => {
    const c   = clientes.find(x => x.id === l.clienteId);
    const cus = (l.itens||[]).filter(x=>x.tipo!=="kit").reduce((a,b)=>a+(b.custo||0)*b.qtd,0);
    const luc = (l.itens||[]).filter(x=>x.tipo!=="kit").reduce((a,b)=>a+(b.preco||0)*b.qtd,0);
    const mg  = l.total ? ((luc/l.total)*100).toFixed(1) : 0;
    return [l.retirada,c?.nome||"",l.evento||"",l.total||0,cus.toFixed(2),luc.toFixed(2),mg,l.entrada||0,l.saldo||0,l.status];
  });
  dl("financeiro.csv",[h,...rows].map(r=>r.join(";")).join("\n"));
  notif("Exportado!");
};

// ─── Calendário ───────────────────────────────────────────────────────────────
export function renderCal() {
  const mn = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  if (el("cal-label")) el("cal-label").textContent = `${mn[calMes]} ${calAno}`;
  if (el("cal-hdr"))   el("cal-hdr").innerHTML = ["D","S","T","Q","Q","S","S"].map(d => `<div class="cal-hdr">${d}</div>`).join("");

  const prim  = new Date(calAno, calMes, 1).getDay();
  const total = new Date(calAno, calMes + 1, 0).getDate();
  const hoje  = new Date();
  let html    = "";

  for (let i = 0; i < prim; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= total; d++) {
    const ds  = `${calAno}-${String(calMes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const lns = locacoes.filter(l => l.status === "ativo" && l.retirada <= ds && l.devolucao >= ds);
    const eh  = d === hoje.getDate() && calMes === hoje.getMonth() && calAno === hoje.getFullYear();
    let cls   = "cal-day";
    if (eh) cls += " today"; else if (lns.length >= 2) cls += " booked"; else if (lns.length === 1) cls += " partial";
    html += `<div class="${cls}" onclick="verDia('${ds}')">${d}${lns.length ? `<span class="cal-dot">${lns.length}</span>` : ""}</div>`;
  }
  if (el("cal-body")) el("cal-body").innerHTML = html;
}
window.renderCal = renderCal;

window.mudaMes = function (d) {
  let m = calMes + d, a = calAno;
  if (m > 11) { m = 0;  a++; }
  if (m < 0)  { m = 11; a--; }
  setCalMes(m); setCalAno(a);
  renderCal();
};

window.verDia = function (ds) {
  const lns = locacoes.filter(l => l.status === "ativo" && l.retirada <= ds && l.devolucao >= ds);
  if (el("cal-det-title")) el("cal-det-title").textContent = fmtD(ds);
  if (el("cal-det")) el("cal-det").innerHTML = lns.length
    ? lns.map(l => {
        const c = clientes.find(x => x.id === l.clienteId);
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bdr)">
          <div style="flex:1"><div style="font-weight:500">${c?.nome || "-"}</div>
          <div style="font-size:11px;color:var(--txt2)">${l.evento || "Sem evento"}</div></div>
          <button class="btn btn-b btn-xs" onclick="verContrato('${l.id}')"><i class="ti ti-file-text"></i></button>
        </div>`;
      }).join("")
    : '<div class="empty"><i class="ti ti-calendar"></i><p>Sem locacoes</p></div>';
};


// ─── Alertas inteligentes ─────────────────────────────────────────────────────
export function renderAlertas() {
  const div = el("dash-alertas"); if (!div) return;
  const hoje = new Date().toISOString().split("T")[0];
  const alertas = [];

  // 1. Devoluções hoje ou atrasadas
  const devHoje = locacoes.filter(l => l.status === "ativo" && l.devolucao <= hoje);
  if (devHoje.length) {
    alertas.push({
      tipo: "danger",
      ico: "ti-clock",
      msg: `${devHoje.length} devolução${devHoje.length>1?"ões":""} hoje ou atrasada${devHoje.length>1?"s":""}`,
      acao: "navTo('locacoes')",
      btn: "Ver"
    });
  }

  // 2. Saldos em aberto há mais de 7 dias
  const saldoVenc = locacoes.filter(l => {
    if ((l.status !== "ativo" && l.status !== "aguardando_entrada") || !(l.saldo > 0)) return false;
    if (!l.retirada) return false;
    const dias = Math.round((new Date() - new Date(l.retirada)) / 864e5);
    return dias > 7;
  });
  if (saldoVenc.length) {
    alertas.push({
      tipo: "warning",
      ico: "ti-cash",
      msg: `${saldoVenc.length} saldo${saldoVenc.length>1?"s":""} em aberto há mais de 7 dias`,
      acao: "setF('loc','ativo',document.querySelector('.chip'));navTo('locacoes')",
      btn: "Cobrar"
    });
  }

  // 3. Itens em quantidade zero com locação próxima (7 dias)
  const em7dias = hoje < new Date(Date.now() + 7*864e5).toISOString().split("T")[0];
  const locsProx = locacoes.filter(l =>
    (l.status === "ativo" || l.status === "aguardando_entrada" || l.status === "orcamento") && l.retirada && l.retirada <= new Date(Date.now() + 7*864e5).toISOString().split("T")[0]
  );
  const itensNaFila = new Set(locsProx.flatMap(l => (l.itens||[]).map(i => i.id)));
  const semEstoque  = itens.filter(i => itensNaFila.has(i.id) && (i.qtd || 0) === 0);
  if (semEstoque.length) {
    alertas.push({
      tipo: "danger",
      ico: "ti-package",
      msg: `${semEstoque.length} item${semEstoque.length>1?"ns":""} com estoque zero em locação dos próximos 7 dias`,
      acao: "navTo('itens')",
      btn: "Ver itens"
    });
  }

  // 4. Clientes sem retorno há 3+ meses
  const h3m = new Date(Date.now() - 90*864e5).toISOString().split("T")[0];
  const cliSemRetorno = clientes.filter(c => {
    const ultima = locacoes
      .filter(l => l.clienteId === c.id)
      .sort((a,b) => (b.retirada||"").localeCompare(a.retirada||""))[0];
    return ultima && ultima.retirada < h3m;
  });
  if (cliSemRetorno.length >= 3) {
    alertas.push({
      tipo: "info",
      ico: "ti-users",
      msg: `${cliSemRetorno.length} clientes sem locação nos últimos 90 dias`,
      acao: "navTo('clientes')",
      btn: "Ver clientes"
    });
  }

  if (!alertas.length) { div.style.display = "none"; return; }
  div.style.display = "";

  const cores = { danger:"#fee2e2:#b91c1c", warning:"#fef9c3:#854d0e", info:"#e0f2fe:#0369a1" };
  div.innerHTML = alertas.map(a => {
    const [bg, cor] = (cores[a.tipo] || "var(--bg):var(--txt)").split(":");
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:${bg};border-radius:10px;margin-bottom:6px;font-size:12px">
      <i class="ti ${a.ico}" style="color:${cor};font-size:16px;flex-shrink:0"></i>
      <span style="flex:1;color:${cor};font-weight:500">${a.msg}</span>
      <button onclick="${a.acao}" style="padding:3px 10px;border-radius:6px;border:1.5px solid ${cor}50;background:none;color:${cor};font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">${a.btn}</button>
    </div>`;
  }).join("");
}
window.renderAlertas = renderAlertas;
// ─── Relatórios ───────────────────────────────────────────────────────────────
export function renderRel() {
  // Itens mais locados
  const cnt = {};
  locacoes.forEach(l => (l.itens || []).filter(x => x.tipo !== "kit").forEach(it => {
    cnt[it.nome] = (cnt[it.nome] || 0) + it.qtd;
  }));
  const topI  = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxI  = topI[0]?.[1] || 1;
  const ri    = el("rel-itens");
  if (ri) ri.innerHTML = topI.length
    ? topI.map(([n, v]) =>
        `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
            <span>${n}</span><span style="font-weight:600">${v}x</span>
          </div>
          <div class="prog"><div class="prog-f" style="width:${(v / maxI * 100).toFixed(0)}%"></div></div>
        </div>`
      ).join("")
    : '<div class="empty"><i class="ti ti-chart-bar"></i><p>Sem dados</p></div>';

  // Clientes frequentes
  const cliC = {};
  locacoes.forEach(l => { cliC[l.clienteId] = (cliC[l.clienteId] || 0) + 1; });
  const topC = Object.entries(cliC).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxC = topC[0]?.[1] || 1;
  const rc   = el("rel-cli");
  if (rc) rc.innerHTML = topC.length
    ? topC.map(([id, v]) => {
        const c = clientes.find(x => x.id === id);
        return `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
            <span>${c?.nome || "?"}</span><span style="font-weight:600">${v} loc.</span>
          </div>
          <div class="prog"><div class="prog-f" style="width:${(v / maxC * 100).toFixed(0)}%"></div></div>
        </div>`;
      }).join("")
    : '<div class="empty"><i class="ti ti-users"></i><p>Sem dados</p></div>';
}
window.renderRel = renderRel;

// ═══════════════════════════════════════════════════════════════════════════════
// CARDS EXTRAS: OCUPAÇÃO + PROJEÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
export function renderCardsExtras() {
  const hoje = new Date().toISOString().split("T")[0];
  const em30  = new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0];

  // Ocupação: itens com locação ativa hoje / total itens
  const itensTotais = itens.reduce((a, i) => a + (i.qtd || 1), 0);
  let itensOcupados = 0;
  locacoes.filter(l => l.status === "ativo" && l.retirada <= hoje && l.devolucao >= hoje)
    .forEach(l => (l.itens || []).filter(x => x.tipo !== "kit")
      .forEach(it => { itensOcupados += it.qtd || 1; }));
  const ocup = itensTotais > 0 ? Math.min(100, Math.round(itensOcupados / itensTotais * 100)) : 0;
  const dOcup = el("d-ocup");
  if (dOcup) dOcup.textContent = ocup + "%";

  // Projeção: soma dos totais de locações ativas nos próximos 30 dias
  const proj = locacoes
    .filter(l => (l.status === "ativo" || l.status === "orcamento") && l.retirada >= hoje && l.retirada <= em30)
    .reduce((a, b) => a + (b.saldo || b.total || 0), 0);
  const dProj = el("d-proj");
  if (dProj) dProj.textContent = "R$" + proj.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
window.renderCardsExtras = renderCardsExtras;

// ── Comprovantes de pagamento ─────────────────────────────────────────────────
window.renderComprovantesAdmin = function() {
  const div   = el("pag-comp-lista"); if (!div) return;
  const badge = el("pag-comp-badge");
  const comps = (window._comprovantes_pag || []).sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));

  const pendentes = comps.filter(c => c.status === "pendente_revisao").length;
  if (badge) {
    badge.textContent = pendentes > 0 ? `${pendentes} pendente${pendentes>1?"s":""}` : "0 pendentes";
    badge.style.background = pendentes > 0 ? "#fef9c3" : "#f0fdf4";
    badge.style.color      = pendentes > 0 ? "#b45309" : "#15803d";
  }

  // Atualizar badge da aba
  const abaBadge = el("pag-comp-badge-aba");
  if (abaBadge) {
    abaBadge.textContent = pendentes || "0";
    abaBadge.style.background = pendentes > 0 ? "#fef9c3" : "#f0fdf4";
    abaBadge.style.color      = pendentes > 0 ? "#b45309" : "#15803d";
  }

  if (!comps.length) {
    div.innerHTML = `<div style="text-align:center;padding:20px;color:var(--txt3);font-size:13px">
      <i class="ti ti-file-invoice" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      Nenhum comprovante enviado ainda.
    </div>`;
    return;
  }

  div.innerHTML = comps.map(c => {
    const data  = c.criadoEm?.seconds ? new Date(c.criadoEm.seconds*1000).toLocaleDateString("pt-BR") : "—";
    const hora  = c.criadoEm?.seconds ? new Date(c.criadoEm.seconds*1000).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";
    const isPdf = c.mimeType === "application/pdf";
    const isPend = c.status === "pendente_revisao";
    const isImg = c.arquivo?.startsWith("data:image");

    return `<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--bdr);flex-wrap:wrap">
      <!-- Miniatura -->
      <div style="flex-shrink:0;width:64px;height:64px;border-radius:10px;overflow:hidden;border:1px solid var(--bdr2);background:#f9fafb;display:flex;align-items:center;justify-content:center;cursor:pointer"
        onclick="window._verComprovante('${c.id}')">
        ${isImg
          ? `<img src="${c.arquivo}" style="width:100%;height:100%;object-fit:cover">`
          : `<i class="ti ti-file-type-pdf" style="font-size:28px;color:#dc2626"></i>`}
      </div>
      <!-- Info -->
      <div style="flex:1;min-width:180px">
        <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:2px">${(() => {
          if (c.nomeCliente) return esc(c.nomeCliente);
          if (c.clienteId) { const cl=clientes.find(x=>x.id===c.clienteId); if(cl?.nome) return esc(cl.nome); }
          if (c.locId) { const l=locacoes?.find(x=>x.id===c.locId); if(l){ const cl=clientes.find(x=>x.id===l.clienteId); if(cl?.nome) return esc(cl.nome); } }
          return "—";
        })()}</div>
        <div style="font-size:11px;color:var(--txt3);margin-bottom:4px">${esc(c.evento||"—")} · ${data} ${hora}</div>
        <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:6px">R$ ${(c.valor||0).toFixed(2).replace(".",",")} — ${c.tipo==="entrada"?"Entrada":"Total"}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button onclick="window._verComprovante('${c.id}')"
            style="padding:5px 12px;border-radius:8px;border:1.5px solid var(--bdr2);background:var(--bg);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--txt2)">
            <i class="ti ti-eye"></i> Ver
          </button>
          ${isPend ? `
          <button onclick="window._confirmarComprovante('${c.id}','${c.locId}','${c.tipo}',${c.valor||0},this)"
            style="padding:5px 12px;border-radius:8px;border:1.5px solid #16a34a;background:#f0fdf4;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;color:#15803d">
            <i class="ti ti-check"></i> Confirmar pag.
          </button>
          <button onclick="window._rejeitarComprovante('${c.id}',this)"
            style="padding:5px 12px;border-radius:8px;border:1.5px solid #fca5a5;background:#fff1f2;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;color:#b91c1c">
            <i class="ti ti-x"></i> Rejeitar
          </button>` : `
          <span style="font-size:11px;font-weight:600;color:#15803d;padding:5px 10px;background:#f0fdf4;border-radius:8px">✓ Confirmado</span>`}
          <button onclick="excluirComprovante('${c.id}',this)" title="Excluir comprovante"
            style="padding:5px 7px;border-radius:8px;border:1.5px solid #fca5a5;background:#fff1f2;color:#b91c1c;font-size:12px;cursor:pointer;line-height:1;margin-left:2px">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join("");
};

window._verComprovante = function(id) {
  const c = (window._comprovantes_pag||[]).find(x => x.id === id);
  if (!c?.arquivo) return;
  const w = window.open("","_blank");
  if (c.mimeType === "application/pdf") {
    w.document.write(`<iframe src="${c.arquivo}" style="width:100%;height:100vh;border:none"></iframe>`);
  } else {
    w.document.write(`<img src="${c.arquivo}" style="max-width:100%;display:block;margin:auto">`);
  }
};

window._confirmarComprovante = async function(compId, locId, tipo, valor, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Confirmando..."; }
  try {
    const { updateDoc: ud2, doc: d2, addDoc: ad2, collection: c2, serverTimestamp: st2 } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    // Marcar comprovante como confirmado
    await ud2(d2(db,"comprovantes_pag",compId), { status:"confirmado", confirmadoEm: new Date() });

    // Atualizar locação se ainda não foi
    const loc = locacoes.find(l => l.id === locId);
    if (loc && loc.status !== "ativo" && loc.status !== "devolvido") {
      const agora = new Date().toISOString();
      const total = loc.total || 0;
      const upd   = tipo === "entrada"
        ? { status:"ativo", entrada:valor, saldo:total-valor, pagEntradaEm:agora }
        : { status:"ativo", saldo:0, entrada:total, pagTotalEm:agora };
      await ud2(d2(db,"locacoes",locId), upd);
    }

    notif("✅ Comprovante confirmado!");
    window.renderComprovantesAdmin?.();
    window.renderTransacoes?.();
  } catch(e) {
    notif("Erro: " + e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = "✅ Confirmar pag."; }
  }
};

window._rejeitarComprovante = async function(compId, btn) {
  if (!confirm("Rejeitar este comprovante?")) return;
  if (btn) { btn.disabled = true; }
  try {
    await updateDoc(doc(db,"comprovantes_pag",compId), { status:"rejeitado", rejeitadoEm: new Date() });
    notif("Comprovante rejeitado.");
    window.renderComprovantesAdmin?.();
  } catch(e) {
    notif("Erro: " + e.message, true);
    if (btn) btn.disabled = false;
  }
};

window.excluirComprovante = async function(id, btn) {
  const ok = await window.confirmar({
    titulo: "Excluir comprovante",
    msg: "Tem certeza que deseja excluir este comprovante? Esta ação não pode ser desfeita.",
    tipo: "danger", labelOk: "Excluir"
  });
  if (!ok) return;
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="ti ti-loader"></i>'; }
  try {
    const { deleteDoc, doc: d2 } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await deleteDoc(d2(db,"comprovantes_pag",id));
    notif("Comprovante excluído.");
    window.renderComprovantesAdmin?.();
  } catch(e) {
    notif("Erro: "+e.message, true);
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="ti ti-trash"></i>'; }
  }
};
