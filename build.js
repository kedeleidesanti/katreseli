#!/usr/bin/env node
/**
 * KATRESELI — Script de Build / Pré-deploy
 * ==========================================
 * Roda ANTES de fazer upload para o Hostinger.
 *
 * O que faz:
 *   1. Gera um BUILD_ID único (timestamp YYMMDDHHmm) a cada execução
 *   2. Atualiza CACHE_V no sw.js → força o browser a baixar o novo SW
 *   3. Adiciona ?v=BUILD_ID nos <script src> e <link href> do adm.html,
 *      index.html, cliente.html e solicitar.html → quebra cache do browser
 *      para todos os arquivos JS e CSS
 *
 * Como usar:
 *   node build.js
 *
 * Ou com npm (após "npm init -y"):
 *   npm run build
 */

const fs   = require("fs");
const path = require("path");

// ── 1. Gerar BUILD_ID ──────────────────────────────────────────────────────────
const now     = new Date();
const pad     = n => String(n).padStart(2, "0");
const BUILD_ID = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
const CACHE_V  = `katreseli-v${BUILD_ID}`;

console.log(`\n🎀  KATRESELI Build — ${CACHE_V}\n`);

// ── 2. Atualizar sw.js ─────────────────────────────────────────────────────────
const swPath = path.join(__dirname, "sw.js");
let sw = fs.readFileSync(swPath, "utf8");
const oldCache = sw.match(/const CACHE_V\s*=\s*"([^"]+)"/);
if (oldCache) {
  sw = sw.replace(/const CACHE_V\s*=\s*"[^"]+"/, `const CACHE_V = "${CACHE_V}"`);
  fs.writeFileSync(swPath, sw, "utf8");
  console.log(`✅  sw.js         ${oldCache[1]}  →  ${CACHE_V}`);
} else {
  console.warn("⚠️  sw.js: CACHE_V não encontrado — verifique o arquivo.");
}

// ── 3. Adicionar ?v= nos HTML ──────────────────────────────────────────────────
const HTML_FILES = ["adm.html", "index.html", "cliente.html", "solicitar.html"];

// Regex: captura src="...js" ou href="...css" que são arquivos locais (sem http)
const ASSET_RE = /(src|href)="((?!https?:\/\/)[^"]+\.(js|css))(\?[^"]*)?"(\s|>)/g;

for (const filename of HTML_FILES) {
  const filepath = path.join(__dirname, filename);
  if (!fs.existsSync(filepath)) continue;

  let html    = fs.readFileSync(filepath, "utf8");
  let count   = 0;
  const patched = html.replace(ASSET_RE, (_, attr, file, _ext, _qs, trail) => {
    // Remove qualquer ?v= anterior e adiciona o novo
    const clean = file.replace(/\?.*$/, "");
    count++;
    return `${attr}="${clean}?v=${BUILD_ID}"${trail}`;
  });

  fs.writeFileSync(filepath, patched, "utf8");
  console.log(`✅  ${filename.padEnd(18)} ${count} asset(s) com ?v=${BUILD_ID}`);
}

// ── 4. Injetar <meta name="build-id"> no adm.html ────────────────────────────
// Permite que o JS leia a versão atual sem fetch extra
const admPath = path.join(__dirname, "adm.html");
if (fs.existsSync(admPath)) {
  let adm = fs.readFileSync(admPath, "utf8");
  // Substitui ou insere a meta tag de build-id (apenas no HTML, não em comentários JS)
  if (/<meta\s+name="build-id"/.test(adm)) {
    adm = adm.replace(/<meta\s+name="build-id"[^>]*>/, `<meta name="build-id" content="${BUILD_ID}">`);
  } else {
    // Inserir logo após o charset — garante que está no <head>
    adm = adm.replace(/(<meta\s+charset="UTF-8">)/, `$1\n  <meta name="build-id" content="${BUILD_ID}">`);
  }
  fs.writeFileSync(admPath, adm, "utf8");
  console.log(`✅  adm.html meta   build-id = ${BUILD_ID}`);
}

// ── 6. Salvar BUILD_ID no manifest para referência ────────────────────────────
const mPath = path.join(__dirname, "manifest.json");
if (fs.existsSync(mPath)) {
  const mf = JSON.parse(fs.readFileSync(mPath, "utf8"));
  mf._build = BUILD_ID;
  fs.writeFileSync(mPath, JSON.stringify(mf, null, 2), "utf8");
  console.log(`✅  manifest.json  _build = ${BUILD_ID}`);
}

console.log(`\n🚀  Pronto! Faça o upload para o Hostinger agora.\n`);
