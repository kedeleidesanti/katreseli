/**
 * estoque.js — Controle de disponibilidade de itens por período.
 *
 * Regra: um item está "comprometido" em uma locação se:
 *   - status é "ativo" ou "orcamento" confirmado (não "devolvido"/"cancelado")
 *   - O período [retirada, devolucao] se sobrepõe ao período solicitado
 *
 * Sobreposição: A.ret <= B.dev && A.dev >= B.ret
 */
import { locacoes, itens, decoracoes } from "./state.js";

/**
 * Retorna quantos exemplares de um item estão comprometidos
 * em locacoes que se sobrepõem ao período [ret, dev],
 * opcionalmente excluindo uma locação (para edição futura).
 */
export function qtdComprometida(itemId, ret, dev, ignorarLocId = null) {
  let total = 0;
  for (const loc of locacoes) {
    if (loc.status === "devolvido" || loc.status === "cancelado") continue;
    if (ignorarLocId && loc.id === ignorarLocId) continue;
    if (!loc.retirada || !loc.devolucao) continue;
    // Sobreposição de períodos
    if (loc.retirada <= dev && loc.devolucao >= ret) {
      for (const it of (loc.itens || [])) {
        if (it.tipo === "kit") continue;
        if (it.id === itemId) total += (it.qtd || 1);
      }
    }
  }
  return total;
}

/**
 * Retorna a qtd disponível de um item para um período.
 */
export function qtdDisponivel(itemId, ret, dev, ignorarLocId = null) {
  const item = itens.find(x => x.id === itemId);
  if (!item) return 0;
  const estoque     = item.qtd || 1;
  const comprometida = qtdComprometida(itemId, ret, dev, ignorarLocId);
  return Math.max(0, estoque - comprometida);
}

/**
 * Verifica se um item está disponível (pelo menos 1 unidade).
 */
export function estaDisponivel(itemId, ret, dev, ignorarLocId = null) {
  return qtdDisponivel(itemId, ret, dev, ignorarLocId) > 0;
}

/**
 * Retorna mapa { itemId: qtdDisponivel } para todos os itens num período.
 * Útil para popular selects e cards de uma vez só.
 */
export function mapaDisponibilidade(ret, dev, ignorarLocId = null) {
  const mapa = {};
  for (const item of itens) {
    mapa[item.id] = qtdDisponivel(item.id, ret, dev, ignorarLocId);
  }
  return mapa;
}

/**
 * Badge colorida de disponibilidade.
 * disp = qtd disponível, total = estoque total
 */
export function badgeDisp(disp, total) {
  if (disp <= 0)                         return `<span class="disp-badge disp-0">Indisponível</span>`;
  if (disp <= Math.ceil(total * 0.25))   return `<span class="disp-badge disp-low">${disp}/${total} restante${disp > 1 ? "s" : ""}</span>`;
  return `<span class="disp-badge disp-ok">${disp}/${total} disponív${disp > 1 ? "eis" : "el"}</span>`;
}

/**
 * Popula o select de itens da locação com disponibilidade em tempo real.
 * Chamado sempre que as datas mudam ou ao abrir o step 2.
 */
export function popularSelectItens(ret, dev) {
  const si = document.getElementById("loc-item-sel");
  if (!si) return;

  if (!ret || !dev) {
    si.innerHTML = '<option value="">⚠ Selecione as datas primeiro</option>';
    si.disabled = true;
    return;
  }
  si.disabled = false;

  const mapa = mapaDisponibilidade(ret, dev);
  const disponiveis = itens.filter(i =>
    !(i.estado || "").toLowerCase().includes("manut")
  );

  if (!disponiveis.length) {
    si.innerHTML = '<option value="">Nenhum item cadastrado</option>';
    return;
  }

  // Ordenar: disponíveis primeiro, depois indisponíveis
  const ordenados = [...disponiveis].sort((a, b) => {
    const da = mapa[a.id] ?? 0;
    const db2 = mapa[b.id] ?? 0;
    if (da > 0 && db2 <= 0) return -1;
    if (da <= 0 && db2 > 0) return 1;
    return (a.nome || "").localeCompare(b.nome || "");
  });

  si.innerHTML = '<option value="">Selecione um item...</option>' +
    ordenados.map(i => {
      const disp  = mapa[i.id] ?? 0;
      const total = i.qtd || 1;
      const label = disp <= 0
        ? `🔴 ${i.nome} — Indisponível`
        : disp <= Math.ceil(total * 0.25)
          ? `🟡 ${i.nome} — ${disp}/${total} disp. — ${window.fmtR ? window.fmtR(i.aluguel) : "R$" + i.aluguel}`
          : `🟢 ${i.nome} — ${disp}/${total} disp. — ${window.fmtR ? window.fmtR(i.aluguel) : "R$" + i.aluguel}`;
      return `<option value="${i.id}" ${disp <= 0 ? "disabled" : ""}>${label}</option>`;
    }).join("");
}

/**
 * Popula o select de kits/decoracoes com disponibilidade.
 * Um kit está disponível se TODOS os seus itens têm estoque suficiente.
 */
export function popularSelectDecs(ret, dev) {
  const sd = document.getElementById("loc-dec-sel");
  if (!sd) return;

  if (!ret || !dev) {
    sd.innerHTML = '<option value="">⚠ Selecione as datas primeiro</option>';
    sd.disabled = true;
    return;
  }
  sd.disabled = false;

  const mapa = mapaDisponibilidade(ret, dev);
  const ativos = decoracoes.filter(d => d.status !== "Em manutencao");

  if (!ativos.length) {
    sd.innerHTML = '<option value="">Nenhum kit cadastrado</option>';
    return;
  }

  sd.innerHTML = '<option value="">Selecione um kit...</option>' +
    ativos.map(d => {
      // Verificar se todos os itens do kit têm estoque suficiente
      const itensKit = (d.itensInclusos || []);
      let bloqueado = false;
      let motivo    = "";

      // Agrupa itens do kit por id (pode ter o mesmo item repetido)
      const qtdNecessaria = {};
      for (const ki of itensKit) {
        qtdNecessaria[ki.id] = (qtdNecessaria[ki.id] || 0) + (ki.qtd || 1);
      }

      for (const [id, qtdNec] of Object.entries(qtdNecessaria)) {
        const dispItem = mapa[id] ?? 0;
        if (dispItem < qtdNec) {
          const itemEncontrado = itens.find(x => x.id === id);
          const nomeItem = itemEncontrado?.nome || "Item removido do catálogo";
          bloqueado = true;
          motivo = itemEncontrado
            ? `${nomeItem}: ${dispItem} disp.`
            : nomeItem;
          break;
        }
      }

      const emoji = bloqueado ? "🔴" : "🟢";
      const label = bloqueado
        ? `${emoji} ${d.nome} — Indisponível (${motivo})`
        : `${emoji} ${d.nome} — ${window.fmtR ? window.fmtR(d.valorTotal) : "R$" + d.valorTotal}`;

      return `<option value="${d.id}" ${bloqueado ? "disabled" : ""}>${label}</option>`;
    }).join("");
}

/**
 * Valida se a qtd atual de um item no carrinho respeita o estoque disponível.
 * Retorna { ok, max, msg }
 */
export function validarQtdItem(itemId, qtdSolicitada, ret, dev, locItensAtual = []) {
  const item = itens.find(x => x.id === itemId);
  if (!item) return { ok: false, max: 0, msg: "Item não encontrado" };

  const comprometidoGeral = qtdComprometida(itemId, ret, dev);
  // Qtd já no carrinho atual (não conta como "comprometida" ainda)
  const noCarrinho = locItensAtual
    .filter(x => x.id === itemId && x.tipo !== "kit")
    .reduce((a, b) => a + b.qtd, 0);

  const estoque   = item.qtd || 1;
  const disponivel = Math.max(0, estoque - comprometidoGeral);

  if (qtdSolicitada > disponivel) {
    return {
      ok:  false,
      max: disponivel,
      msg: `Estoque insuficiente! Disponivel: ${disponivel} de ${estoque} (${comprometidoGeral} em outras locacoes)`
    };
  }
  return { ok: true, max: disponivel, msg: "" };
}

// Expor no window para uso em locacoes.js via window.*
window._estoque = {
  qtdComprometida,
  qtdDisponivel,
  estaDisponivel,
  mapaDisponibilidade,
  badgeDisp,
  popularSelectItens,
  popularSelectDecs,
  validarQtdItem
};

window.popularSelectItens = popularSelectItens;
window.popularSelectDecs  = popularSelectDecs;
