import { clientes, itens, cfg }  from "./state.js";
import { db, doc, updateDoc, getDoc } from "./firebase.js";
import { modelosContrato }       from "./editor-contrato.js";
import { fmtR, fmtD }            from "./helpers.js";

// ─── Substituição de placeholders ────────────────────────────────────────────
function _sub(txt, d) {
  if (!txt) return "";
  const m = [
    [/\{\{?\s*data_retirada\s*\}?\}/gi,    d.retirada],
    [/\{\{?\s*data_devolucao\s*\}?\}/gi,   d.devolucao],
    [/\{\{?\s*data_evento\s*\}?\}/gi,      d.retirada],
    [/\{\{?\s*data_contrato\s*\}?\}/gi,    d.hoje],
    [/\{\{?\s*data_emissao\s*\}?\}/gi,     d.hoje],
    [/dd\/mm\/aaaa/gi,                     d.devolucao],
    [/\{\{?\s*nome_cliente\s*\}?\}/gi,     d.nomeCliente],
    [/\{\{?\s*nome_locatario\s*\}?\}/gi,   d.nomeCliente],
    [/\{\{?\s*locatario\s*\}?\}/gi,        d.nomeCliente],
    [/\{\{?\s*cliente\s*\}?\}/gi,          d.nomeCliente],
    [/\{\{?\s*cpf_cliente\s*\}?\}/gi,      d.cpfCliente],
    [/\{\{?\s*cpf\s*\}?\}/gi,              d.cpfCliente],
    [/\{\{?\s*telefone\s*\}?\}/gi,         d.telefone],
    [/\{\{?\s*email\s*\}?\}/gi,            d.email],
    [/\{\{?\s*endereco_cliente\s*\}?\}/gi, d.enderecoCliente],
    [/\{\{?\s*endereco\s*\}?\}/gi,         d.enderecoCliente],
    [/\{\{?\s*evento\s*\}?\}/gi,           d.evento],
    [/\{\{?\s*local\s*\}?\}/gi,            d.local],
    [/\{\{?\s*valor_total\s*\}?\}/gi,      d.total],
    [/\{\{?\s*total\s*\}?\}/gi,            d.total],
    [/\{\{?\s*valor_entrada\s*\}?\}/gi,    d.entrada],
    [/\{\{?\s*entrada\s*\}?\}/gi,          d.entrada],
    [/\{\{?\s*saldo\s*\}?\}/gi,            d.saldo],
    [/\{\{?\s*saldo_restante\s*\}?\}/gi,   d.saldo],
    [/\{\{?\s*forma_pagamento\s*\}?\}/gi,  d.pagamento],
    [/\{\{?\s*pagamento\s*\}?\}/gi,        d.pagamento],
    [/R\$\s*0,00/g,                        d.total],
    [/\{\{?\s*empresa\s*\}?\}/gi,          d.empresa],
    [/\{\{?\s*cnpj\s*\}?\}/gi,             d.cnpj],
    [/\{\{?\s*responsavel\s*\}?\}/gi,      d.responsavel],
    [/\{\{?\s*locadora\s*\}?\}/gi,         d.empresa],
    [/\{\{?\s*numero_contrato\s*\}?\}/gi,  d.numContrato],
    [/@/g,                                  d.diasNum],
    [/\{\{?\s*dias\s*\}?\}/gi,             d.dias],
    [/\{\{?\s*prazo\s*\}?\}/gi,            d.dias],
    [/\{\{?\s*horas\s*\}?\}/gi,            String(d.horas || 0)],
    [/\{\{?\s*valor_hora\s*\}?\}/gi,       d.valorHora],
  ];
  let r = txt;
  for (const [rx, val] of m) {
    if (val !== undefined && val !== null && typeof val !== "function")
      r = r.replace(rx, String(val));
  }
  return r;
}

function _subHtml(html, d) {
  if (!html) return "";
  if (!html.includes("<")) return _sub(html, d);
  return html
    .replace(/>([^<]*)</g, (_, t) => ">" + _sub(t, d) + "<")
    .replace(/^([^<]+)/, (_, t) => _sub(t, d))
    .replace(/([^>]+)$/, (_, t) => _sub(t, d));
}

// ─── Formatadores ─────────────────────────────────────────────────────────────
function _fmtCpf(v) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v || "—";
}
function _fmtTel(v) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length === 11) return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0,2) + ") " + d.slice(2,6) + "-" + d.slice(6);
  return v || "—";
}

// ─── Cláusulas padrão ────────────────────────────────────────────────────────
const PAD_ALUGUEL = [
  { titulo: "CLÁUSULA 1ª – OBJETO", texto: "O presente contrato tem por objeto a locação de itens de decoração para festas, conforme Lista de Itens Locados, destinados ao evento {{evento}}, acordado entre as partes." },
  { titulo: "CLÁUSULA 2ª – PRAZO DE LOCAÇÃO", texto: "O prazo de locação é de {{dias}}, com retirada em {{data_retirada}} e devolução até as 18h00 do dia {{data_devolucao}}. Atrasos incorrerão em multa conforme Cláusula 6ª." },
  { titulo: "CLÁUSULA 3ª – VALOR E FORMA DE PAGAMENTO", texto: "O valor total é de {{valor_total}}, sendo {{entrada}} de entrada (sinal de reserva, não reembolsável) e saldo de {{saldo}} a pagar na retirada. A reserva só é confirmada após pagamento da entrada." },
  { titulo: "CLÁUSULA 4ª – OBRIGAÇÕES DO(A) LOCATÁRIO(A)", texto: "O(A) LOCATÁRIO(A) se obriga a: (a) retirar e devolver os itens no endereço do(a) LOCADOR(A) dentro do prazo; (b) zelar pelos itens, responsabilizando-se por danos, perdas e extravios; (c) não sublocar ou usar os itens para fins diferentes dos acordados; (d) devolver os itens limpos e em perfeito estado." },
  { titulo: "CLÁUSULA 5ª – OBRIGAÇÕES DO(A) LOCADOR(A)", texto: "O(A) LOCADOR(A) se obriga a disponibilizar os itens descritos, limpos, higienizados e em bom estado, na data e horário acordados, prestando suporte básico sobre montagem quando solicitado." },
  { titulo: "CLÁUSULA 6ª – MULTAS E RESPONSABILIDADES", texto: "Atraso na devolução: multa de R$ 100,00 por dia. Dano, perda ou extravio: cobrança do valor de reposição conforme tabela vigente. Não comparecimento sem aviso prévio de 48h: perda integral da entrada." },
  { titulo: "CLÁUSULA 7ª – CANCELAMENTO", texto: "Cancelamento com mais de 48h: retenção de 50% do valor pago. Com menos de 48h ou no dia do evento: retenção integral da entrada, a título de perdas e danos." },
  { titulo: "CLÁUSULA 8ª – CASO FORTUITO E FORÇA MAIOR", texto: "Em casos de eventos imprevisíveis que impossibilitem a realização do evento (calamidade pública, pandemia, decreto governamental), as partes poderão renegociar data sem cobrança de multa, mediante comunicação prévia e comprovação." },
  { titulo: "CLÁUSULA 9ª – DISPOSIÇÕES FINAIS", texto: "O contrato é firmado em caráter irrevogável, obrigando as partes e seus sucessores. Qualquer alteração deve ser formalizada por escrito. Fica eleito o Foro da Comarca de Piraquara/PR para dirimir quaisquer litígios." },
];

const PAD_MONT = [
  { titulo: "CLÁUSULA 1ª – OBJETO", texto: "O presente contrato tem por objeto a prestação de serviço de montagem e desmontagem de decoração para o evento \"{{evento}}\", a ser realizado em {{local}}, na data de {{data_retirada}}, conforme proposta aprovada." },
  { titulo: "CLÁUSULA 2ª – VALOR E FORMA DE PAGAMENTO", texto: "O valor total do serviço é de {{valor_total}}, sendo {{entrada}} de sinal/reserva (não reembolsável) e saldo de {{saldo}} a pagar até a data do evento." },
  { titulo: "CLÁUSULA 3ª – OBRIGAÇÕES DO(A) CONTRATANTE", texto: "O(A) CONTRATANTE se obriga a: (a) garantir acesso ao local no horário acordado; (b) informar previamente quaisquer restrições do espaço; (c) efetuar o pagamento conforme acordado." },
  { titulo: "CLÁUSULA 4ª – OBRIGAÇÕES DO(A) CONTRATADO(A)", texto: "O(A) CONTRATADO(A) se obriga a realizar a montagem e desmontagem conforme proposta aprovada, com profissionalismo e dentro do horário estabelecido." },
  { titulo: "CLÁUSULA 5ª – CANCELAMENTO", texto: "Cancelamento com mais de 48h: retenção de 30% do valor pago. Com menos de 48h: retenção de 50%. No dia do evento sem aviso: cobrança integral." },
  { titulo: "CLÁUSULA 6ª – DISPOSIÇÕES FINAIS", texto: "O contrato é irrevogável, obrigando as partes e sucessores. Fica eleito o Foro da Comarca de Piraquara/PR para dirimir quaisquer litígios." },
];

// ─── GERAÇÃO ─────────────────────────────────────────────────────────────────
// silent=true → só salva no Firestore, não abre janela
export async function gerarContrato(loc, silent) {
  // Buscar cláusulas e modelo SEMPRE do Firestore
  let cAlug = [], cMont = [], mAlug = "", mMont = "";
  try {
    const [sCl, sMod] = await Promise.all([
      getDoc(doc(db, "config", "clausulas")),
      getDoc(doc(db, "config", "modelos_contrato")),
    ]);
    if (sCl.exists()) {
      cAlug = (sCl.data().aluguel  || []).filter(x => x.ativa !== false);
      cMont = (sCl.data().montagem || []).filter(x => x.ativa !== false);
    }
    if (sMod.exists()) {
      mAlug = sMod.data().aluguel  || "";
      mMont = sMod.data().montagem || "";
    }
  } catch(e) { console.warn("[contrato] config:", e); }

  _gerar(loc, cAlug, cMont, mAlug, mMont, silent);
}

function _gerar(loc, cAlug, cMont, mAlug, mMont, silent) {
  const l   = loc;
  console.log("[_gerar] assinadoEm:", l.assinadoEm, "| assinadoPor:", l.assinadoPor);
  const cli = clientes.find(x => x.id === l.clienteId) || {};
  const cor = cfg.cor || "#d4307a";
  const isMont = !!(l.montagem || l.isMontagem);

  // Número do contrato
  const ord  = [...(window._locacoes || [])].sort((a,b) => (a.criadoEm?.seconds||0)-(b.criadoEm?.seconds||0));
  const idx  = ord.findIndex(x => x.id === l.id);
  const num  = "K3L" + String(idx >= 0 ? 1000+idx : 1000).padStart(4,"0");
  const hoje = new Date().toLocaleDateString("pt-BR");

  // Dias
  const dias = (l.retirada && l.devolucao)
    ? Math.max(1, Math.round((new Date(l.devolucao)-new Date(l.retirada))/86400000)+1) : 1;

  // Endereço cliente
  const endCli = cli.end ||
    [cli.rua?(cli.rua+(cli.num?" "+cli.num:"")):"", cli.bairro,
     cli.cidade?(cli.cidade+(cli.uf?"/"+cli.uf:"")):""]
    .filter(Boolean).join(", ") || "—";

  const saldoOk = (l.saldo||0) <= 0;

  // Dados para substituição
  const d = {
    numContrato: num, hoje,
    nomeCliente: cli.nome||"—", cpfCliente: _fmtCpf(cli.cpf),
    telefone: _fmtTel(cli.tel), email: cli.email||"—",
    enderecoCliente: endCli,
    evento: l.evento||l.tipoEvento||"—", local: l.local||endCli||"—",
    retirada: fmtD(l.retirada), devolucao: fmtD(l.devolucao),
    dias: dias+(dias===1?" dia":" dias"), diasNum: String(dias),
    total: fmtR(l.total||0), entrada: fmtR(l.entrada||0),
    saldo: saldoOk ? "Quitado" : fmtR(l.saldo),
    pagamento: l.pagamento||"—",
    empresa: cfg.nome||"KATRESELI decorações", cnpj: cfg.cnpj||"",
    responsavel: cfg.responsavel||"", endEmpresa: cfg.endEmpresa||"",
    horas: l.horas||0, valorHora: fmtR(l.valorHora||cfg.hora||0),
  };

  // ── Cláusulas: config > modelo livre > padrão ────────────────────────────
  const clausConf  = isMont ? cMont : cAlug;
  const modeloLivre = isMont ? mMont : mAlug;
  const clausPad   = isMont ? PAD_MONT : PAD_ALUGUEL;

  let corpoHtml = "";
  const mkCl = (cl, i) =>
    '<div class="cl-blk">'
    + (cl.titulo ? '<div class="cl-t"><span class="cl-n">'+(i+1)+'.</span> '+_sub(cl.titulo,d)+'</div>' : "")
    + '<div class="cl-tx"'+( cl.titulo?' style="margin-left:18px"':"")+'>'+_subHtml(cl.texto||"",d)+'</div>'
    + '</div>';

  if (clausConf.length > 0) {
    corpoHtml = '<div class="sec">Cláusulas e Condições Gerais</div>'
      + clausConf.map(mkCl).join("");
  } else if (modeloLivre && modeloLivre.trim().length > 100) {
    corpoHtml = _subHtml(modeloLivre, d);
  } else {
    corpoHtml = '<div class="sec">Cláusulas e Condições Gerais</div>'
      + clausPad.map(mkCl).join("");
  }

  // ── Itens ────────────────────────────────────────────────────────────────
  let rows = "";
  if (isMont) rows += "<tr><td>"+(l.descMont||"Serviço de montagem e desmontagem")+"</td><td class='tc'>"+(l.horas||0)+"h</td></tr>";
  (l.itens||[]).filter(x=>x.tipo!=="kit").forEach(it => {
    const cad = itens.find(x=>x.id===it.id);
    rows += "<tr><td><strong>"+it.nome+"</strong>"
      +(cad?.subitens?.length
        ? "<div style='margin-top:3px'>"+cad.subitens.map(s=>"<div style='font-size:9pt;color:#888;padding-left:12px'>↳ "+s.nome+" × "+(s.qtd*it.qtd)+"</div>").join("")+"</div>":"")
      +"</td><td class='tc'>"+it.qtd+" "+(it.qtd===1?"unidade":"unidades")+"</td></tr>";
  });
  if ((l.entrega||0)>0) rows += "<tr><td>Taxa de entrega"+(l.entregaEnd?" — "+l.entregaEnd:"")+"</td><td class='tc'>—</td></tr>";

  // ── Logo ─────────────────────────────────────────────────────────────────
  const logo = cfg.logo
    ? '<img src="'+cfg.logo+'" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid '+cor+'">'
    : '<div style="width:60px;height:60px;border-radius:50%;background:'+cor+';display:flex;align-items:center;justify-content:center;font-size:28px">🎀</div>';

  // ── Assinatura do locatário ──────────────────────────────────────────────
  // Se assinado → mostra nome em cursiva rosa + info digital
  // Se não assinado → traço em branco
  const nomeAssin = l.assinadoPor || cli.nome || "—";
  const dataAssin = l.assinadoEm
    ? new Date(l.assinadoEm).toLocaleDateString("pt-BR")
    : hoje;
  const horaAssin = l.assinadoEm
    ? new Date(l.assinadoEm).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
    : "";

  const assLoc = l.assinadoEm
    ? '<div style="font-family:Georgia,serif;font-size:22px;color:'+cor+';font-style:italic;margin-bottom:4px">'+nomeAssin+'</div>'
      +'<div style="font-size:8pt;color:#15803d;margin-top:2px">&#10003; Assinado digitalmente em '+dataAssin+' às '+horaAssin+' | IP: '+(l.assinadoIP||"—")+'</div>'
    : '<div style="border-top:1.5px solid #555;margin-bottom:10px;margin-top:36px"></div>';

  // ── Bloco de certificação ────────────────────────────────────────────────
  const certBlock = l.assinadoEm
    ? '<div style="margin:28px auto;max-width:700px;padding:16px 20px;background:#f0fdf4;border:2px solid #86efac;border-radius:10px;font-size:10pt;color:#15803d;line-height:1.9">'
      +'<strong>&#10003; Assinado digitalmente pelo LOCATÁRIO(A)</strong><br>'
      +'Nome: <strong>'+nomeAssin+'</strong><br>'
      +'Data/Hora: '+dataAssin+' às '+horaAssin+'<br>'
      +'E-mail: '+(l.assinadoEmail||cli.email||"—")+'<br>'
      +'IP: '+(l.assinadoIP||"—")+'<br>'
      +'<span style="font-size:8pt;color:#16a34a">Validade jurídica conforme Lei 14.063/2020</span>'
      +'</div>'
    : '<div style="margin:28px auto;max-width:700px;padding:14px 18px;background:#fefce8;border:2px solid #fde68a;border-radius:10px;font-size:10pt;color:#92400e;line-height:1.8">'
      +'<strong>&#9888; Aguardando assinatura digital do LOCATÁRIO(A)</strong><br>'
      +'Este documento ainda não foi assinado pelo cliente.<br>'
      +'<span style="font-size:8pt;color:#a16207">O cliente deve acessar a área do cliente e clicar em "Assinar contrato".</span>'
      +'</div>';

  // ── CSS ──────────────────────────────────────────────────────────────────
  const css = "*{box-sizing:border-box;margin:0;padding:0}"
    +"body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#1a0a14;background:#fff;padding:36px 40px;max-width:820px;margin:0 auto;line-height:1.65}"
    +"@media print{body{padding:20px}@page{margin:1.2cm;size:A4}}"
    +".hd{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:18px;margin-bottom:24px;border-bottom:3px solid "+cor+"}"
    +".hd-logo{display:flex;align-items:center;gap:14px}"
    +".hd-nome{font-size:20pt;font-weight:800;color:"+cor+";font-family:Georgia,serif}"
    +".hd-sub{font-size:9pt;color:#aaa;margin-top:3px}"
    +".hd-right{text-align:right}"
    +".hd-num{font-size:16pt;font-weight:800;color:"+cor+"}"
    +".sec{font-size:8pt;font-weight:800;color:"+cor+";text-transform:uppercase;letter-spacing:2px;margin:22px 0 10px;display:flex;align-items:center;gap:10px}"
    +".sec::after{content:'';flex:1;height:1.5px;background:linear-gradient(to right,"+cor+"60,transparent)}"
    +"table{width:100%;border-collapse:collapse;margin:10px 0}"
    +"thead th{background:"+cor+";color:#fff;padding:9px 14px;font-size:9pt;text-align:left;font-weight:700}"
    +"thead th.tc{text-align:center;width:110px}"
    +"tbody tr:nth-child(even){background:#fdf5fa}"
    +"tbody td{padding:9px 14px;font-size:10pt;border-bottom:1px solid #f5e8f2}"
    +"tbody td.tc{text-align:center;font-weight:600}"
    +".pg-box{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:10px 0}"
    +".pg-card{padding:13px;border-radius:10px;border:1.5px solid #eee;text-align:center}"
    +".pg-lbl{font-size:7.5pt;color:#bbb;text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px}"
    +".pg-val{font-size:13pt;font-weight:800}"
    +".cl-blk{margin-bottom:14px}"
    +".cl-t{font-weight:800;font-size:10.5pt;margin-bottom:5px}"
    +".cl-n{color:"+cor+";margin-right:4px}"
    +".cl-tx{font-size:10pt;color:#333;line-height:1.75}"
    +".ass{display:flex;gap:40px;margin-top:40px;flex-wrap:wrap}"
    +".ass>div{flex:1;min-width:200px}"
    +".ass-blk{text-align:center;font-size:9pt}"
    +".ass-nome{font-size:11pt;font-weight:700;margin-bottom:4px}"
    +".ass-sub{color:#666;margin-top:3px}"
    +".rf{margin-top:24px;text-align:center;font-size:8pt;color:#bbb;border-top:1px solid #eee;padding-top:12px}";

  // ── Partes do contrato ────────────────────────────────────────────────────
  const razao     = cfg.razao||"Katreseli Decorações de Festa";
  const cnpj      = cfg.cnpj||"";
  const endEmp    = cfg.endEmpresa||"";
  const resp      = cfg.responsavel||"";
  const rodape    = (isMont?cfg.rodMont:cfg.rodAluguel)||cfg.rodape||"";

  const locadorTxt = razao+(cnpj?" – CNPJ nº "+cnpj:"")+(endEmp?", com sede na "+endEmp:"")+(resp?", neste ato representado por "+resp:"")+", doravante denominado(a) <strong>LOCADOR(A)</strong>.";
  const locatTxt   = (cli.nome||"—")+(cli.cpf?", CPF nº "+_fmtCpf(cli.cpf):"")+(endCli!=="—"?", residente em "+endCli:"")+(cli.tel?", telefone "+_fmtTel(cli.tel):"")+", doravante denominado(a) <strong>CONTRATANTE</strong>.";

  // ── HTML FINAL ───────────────────────────────────────────────────────────
  const html = "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='UTF-8'>"
    +"<title>Contrato #"+num+" — "+(cli.nome||"Cliente")+"</title>"
    +"<style>"+css+"</style></head><body>"

    // Cabeçalho
    +"<div class='hd'><div class='hd-logo'>"+logo
    +"<div><div class='hd-nome'>"+(cfg.nome||"KATRESELI")+"</div>"
    +"<div class='hd-sub'>"+(cfg.slogan||"Locações de Decoração")+"</div></div></div>"
    +"<div class='hd-right'><div class='hd-num'>Contrato #"+num+"</div>"
    +"<div style='font-size:8.5pt;color:#bbb;margin-top:4px'>Emitido em "+hoje+"</div></div></div>"

    // Partes
    +"<div class='sec'>Partes</div>"
    +"<p style='margin-bottom:10px'><strong>LOCADOR(A):</strong> "+locadorTxt+"</p>"
    +"<p style='margin-bottom:18px'><strong>CONTRATANTE:</strong> "+locatTxt+"</p>"

    // Pagamento
    +"<div class='sec'>Condições de Pagamento</div>"
    +"<div class='pg-box'>"
    +"<div class='pg-card'><div class='pg-lbl'>Valor Total</div><div class='pg-val' style='color:"+cor+"'>"+fmtR(l.total||0)+"</div></div>"
    +"<div class='pg-card'><div class='pg-lbl'>Entrada Paga</div><div class='pg-val' style='color:#059669'>"+fmtR(l.entrada||0)+"</div></div>"
    +"<div class='pg-card' style='background:"+(saldoOk?"#f0fdf4":"#fffbeb")+";border-color:"+(saldoOk?"#86efac":"#fde68a")+"'>"
    +"<div class='pg-lbl'>Saldo na Entrega</div>"
    +"<div class='pg-val' style='color:"+(saldoOk?"#15803d":"#b45309")+"'>"+(saldoOk?"✓ Quitado":fmtR(l.saldo))+"</div></div>"
    +"</div>"

    // Itens
    +"<div class='sec'>Lista de Itens Locados</div>"
    +"<table><thead><tr><th>Item</th><th class='tc'>Qtde</th></tr></thead>"
    +"<tbody>"+rows+"</tbody></table>"

    // Cláusulas
    +corpoHtml

    // Assinaturas
    +"<div class='ass'>"
    +"<div><div class='ass-blk'>"+assLoc
    +"<div class='ass-nome'>"+(cli.nome||"LOCATÁRIO(A)")+"</div>"
    +"<div class='ass-sub'>Assinatura do(a) LOCATÁRIO(A)</div>"
    +"<div class='ass-sub'>CPF: "+(_fmtCpf(cli.cpf)||"________________________")+"</div>"
    +"<div class='ass-sub'>Data: "+dataAssin+"</div>"
    +"</div></div>"
    +"<div><div class='ass-blk'>"
    +"<div style='font-family:Georgia,serif;font-size:22px;color:#333;font-style:italic;margin-bottom:4px'>"+(resp||cfg.nome||"KATRESELI")+"</div>"
    +"<div class='ass-nome'>"+(resp||cfg.nome||"KATRESELI")+"</div>"
    +"<div class='ass-sub'>Assinatura do(a) LOCADOR(A)</div>"
    +"<div class='ass-sub'>"+(cfg.nome||"KATRESELI decorações")+"</div>"
    +"<div class='ass-sub'>Data: "+hoje+"</div>"
    +"</div></div></div>"

    // Certificação digital
    +certBlock

    // Rodapé
    +"<div style='margin-top:24px;text-align:center;font-size:9pt;color:#555;font-style:italic'>E por estarem assim justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor e forma.</div>"
    +"<div class='rf'>"+(rodape?_sub(rodape,d):(cfg.nome||"KATRESELI")+" · "+(cfg.slogan||"Locações de Decoração")+" · Contrato #"+num+" · "+hoje+" · Documento com validade legal quando assinado por ambas as partes.")+"</div>"

    +"</body></html>";

  // ── Barra de admin ───────────────────────────────────────────────────────
  const barra = "<div id='barra-print' style='position:fixed;top:0;left:0;right:0;z-index:999;background:linear-gradient(135deg,#0e0518,#250845);display:flex;align-items:center;justify-content:space-between;padding:12px 24px'>"
    +"<span style='color:#fff;font-weight:700;font-size:14px'>🎀 Contrato #"+num+" — "+(cli.nome||"Cliente")+"</span>"
    +"<div style='display:flex;gap:10px'>"
    +"<button onclick='window.print()' style='background:#d4307a;color:#fff;border:none;border-radius:8px;padding:8px 22px;font-size:14px;font-weight:700;cursor:pointer'>🖨️ Imprimir / Salvar PDF</button>"
    +"<button onclick='window.close()' style='background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer'>✕ Fechar</button>"
    +"</div></div><div style='height:60px'></div>";

  // Versão cliente (limpa) → salvar no Firestore
  if (l.id) {
    updateDoc(doc(db,"locacoes",l.id),{contrato:html,numContrato:num}).catch(()=>{});
  }

  // Modo silencioso → só salva, não abre janela
  if (silent) return;

  // Versão admin (com barra) → abrir popup
  const bc  = "<" + "/body>";
  const hFinal = html.includes(bc) ? html.split(bc)[0]+barra+bc : html+barra;

  const w = window.open("","_blank","width=960,height=880");
  if (w) {
    w.document.write(hFinal);
    w.document.close();
    const ps = w.document.createElement("style");
    ps.textContent = "@media print{#barra-print,div[style*='height:60px']{display:none!important}}";
    w.document.head.appendChild(ps);
  } else {
    window.notif && window.notif("Ative pop-ups para gerar o contrato",true);
  }
}

window.gerarContrato = gerarContrato;
