// Estado global da aplicação - importado por todos os módulos

export let itens      = [];
export let decoracoes = [];
export let clientes   = [];
export let locacoes   = [];

export let categorias = ["Acessorio", "Mobiliario", "Cenario", "Iluminacao", "Utensilio", "Outro"];
export let filtros    = { loc: "", item: "", dec: "" };
window._filtros = filtros; // expor para renderLoc e outros módulos
export let calMes     = new Date().getMonth();
export let calAno     = new Date().getFullYear();
export let metas      = { fat: 0, loc: 0, cli: 0 };
export let cfg        = {
  nome:             "Katreseli",
  slogan:           "Locacoes Infantis",
  cor:              "#d4307a",
  corD:             "#a0235c",
  corL:             "#fce4f3",
  corBg:            "#f8f4f7",
  logo:             "",
  clausAluguel:     "",
  rodAluguel:       "",
  clausMont:        "",
  rodMont:          "",
  hora:             0,
  clausulasAluguel: [],
  clausulasMont:    [],
  // Dados da empresa (locador)
  razao:            "",
  linkConfirmacao:  false,
  cnpj:             "",
  responsavel:      "",
  endEmpresa:       "",
};

export function setClausulas(tipo, lista) {
  const arr = tipo === "aluguel" ? cfg.clausulasAluguel : cfg.clausulasMont;
  arr.length = 0;
  arr.push(...lista);
}

// Setters para atualização reativa
export function setItens(v)      { itens.length = 0;      itens.push(...v); }
export function setDecoracoes(v) { decoracoes.length = 0; decoracoes.push(...v); }
export function setClientes(v)   { clientes.length = 0;   clientes.push(...v); }
export function setLocacoes(v)   { locacoes.length = 0;   locacoes.push(...v); }
export function setCategorias(v) { categorias.length = 0; categorias.push(...v); window.categorias = categorias; }
export function setFiltro(k, v)  { filtros[k] = v; if (window._filtros) window._filtros[k] = v; }
export function setCalMes(v)     { calMes = v; }
export function setCalAno(v)     { calAno = v; }
export function setMetas(v)      { Object.assign(metas, v); }
export function setCfg(v)        { Object.assign(cfg, v); }

// Expor ao window para módulos que precisam acessar sem import (contrato, inline scripts)
window.categorias = categorias;
window._clientes  = clientes;
window._cfg       = cfg;
window._locacoes  = locacoes;
window._decsCache = decoracoes;
