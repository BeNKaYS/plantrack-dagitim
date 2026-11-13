#!/usr/bin/env node
/**
 * Plantrack — Kurulum (macOS + Windows)
 *
 * Çalıştırma:  Kur_Mac.command  /  Kur_Windows.bat   (ya da: node kurulum/kur.js)
 * Seçenekler:  --evet        tüm soruları "evet" kabul et
 *              --mcp-yok     AI istemcisi ayarlarına dokunma
 *              --masaustu-yok  Windows'ta masaüstüne Plantrack.cmd koyma (kurulum paketi kendi kısayolunu açar)
 *
 * Ne yapar:
 *   1. Node sürümünü denetler (>= 18).
 *   2. ~/PlantrackMCP/{web,mcp,data,jYedek} klasörlerini hazırlar.
 *   3. Var olan arayüz ve sunucu kodunu jYedek/kurulum_<zaman>/ altına yedekler,
 *      sonra yenilerini kopyalar ve birebir aynı olduklarını doğrular.
 *   4. Veritabanı yoksa boş şablonu koyar. VAR OLAN VERİYE ASLA DOKUNMAZ.
 *   5. Kurulu AI istemcilerinde (Claude Desktop, Cursor, Gemini) "plantrack"
 *      MCP kaydını, onay alarak ve ayar dosyasını yedekleyerek ekler/günceller.
 *   6. Başlatıcı oluşturur (macOS: Plantrack Baslat.command, Windows: Masaüstü\Plantrack.cmd).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const ARGS = new Set(process.argv.slice(2));
const HEPSI_EVET = ARGS.has('--evet');
const MCP_YOK = ARGS.has('--mcp-yok');
const MASAUSTU_YOK = ARGS.has('--masaustu-yok');
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

const KAYNAK = path.resolve(__dirname, '..');
const HOME = os.homedir();
const HEDEF = process.env.PLANTRACK_HOME || path.join(HOME, 'PlantrackMCP');
const WEB = path.join(HEDEF, 'web');
const MCP = path.join(HEDEF, 'mcp');
const DATA = path.join(HEDEF, 'data');
const YEDEK = path.join(HEDEF, 'jYedek');
const PORT = 38888;

// Güncelleme akışıyla (mcp/server.js) aynı dosya kümesi
const WEB_DOSYALAR = ['index.html', 'tokens.css', 'style.css', 'app.js', 'version.json', 'assets/logo.svg', 'assets/icon.png'];
const WEB_KLASORLER = ['js', 'assets/vendor'];

const yesil = (s) => `\x1b[32m${s}\x1b[0m`;
const sari = (s) => `\x1b[33m${s}\x1b[0m`;
const kirmizi = (s) => `\x1b[31m${s}\x1b[0m`;
const mavi = (s) => `\x1b[36m${s}\x1b[0m`;
const ok = (s) => console.log('  ' + yesil('✔') + ' ' + s);
const uyar = (s) => console.log('  ' + sari('⚠') + ' ' + s);
const baslik = (s) => console.log('\n' + mavi(s));

function dur(mesaj) {
  console.error('\n' + kirmizi('✖ ' + mesaj));
  process.exitCode = 1;
  throw new Error('__dur__');
}

const zaman = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

let rl = null;
function sor(soru) {
  if (HEPSI_EVET) { console.log(`  ${soru} [E/h] e`); return Promise.resolve(true); }
  if (!process.stdin.isTTY) return Promise.resolve(false);
  rl = rl || readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${soru} [E/h] `, (c) => resolve(!/^h|^n/i.test(String(c).trim())));
  });
}

function dosyalariListele(kok, alt) {
  const tam = path.join(kok, alt);
  if (!fs.existsSync(tam)) return [];
  const sonuc = [];
  for (const e of fs.readdirSync(tam, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = path.join(alt, e.name);
    if (e.isDirectory()) sonuc.push(...dosyalariListele(kok, rel));
    else sonuc.push(rel);
  }
  return sonuc;
}

function klasoruYedekle(klasor, etiket, hedefKok) {
  if (!fs.existsSync(klasor)) return false;
  const dosyalar = dosyalariListele(klasor, '');
  if (!dosyalar.length) return false;
  for (const rel of dosyalar) {
    const d = path.join(hedefKok, etiket, rel);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(path.join(klasor, rel), d);
  }
  return true;
}

function kopyalaVeDogrula(kaynakDosya, hedefDosya) {
  fs.mkdirSync(path.dirname(hedefDosya), { recursive: true });
  fs.copyFileSync(kaynakDosya, hedefDosya);
  if (!fs.readFileSync(kaynakDosya).equals(fs.readFileSync(hedefDosya))) {
    throw new Error('Doğrulanamadı: ' + hedefDosya);
  }
}

// ── AI istemcisi ayar dosyaları ───────────────────────────────────────────
function istemciler() {
  const appData = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
  return [
    { ad: 'Claude Desktop', dosya: MAC ? path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
                                       : WIN ? path.join(appData, 'Claude', 'claude_desktop_config.json')
                                             : path.join(HOME, '.config', 'Claude', 'claude_desktop_config.json') },
    { ad: 'Cursor', dosya: path.join(HOME, '.cursor', 'mcp.json') },
    { ad: 'Gemini CLI', dosya: path.join(HOME, '.gemini', 'settings.json') },
    { ad: 'Gemini / Antigravity', dosya: path.join(HOME, '.gemini', 'config', 'mcp_config.json') }
  ];
}

function mcpKaydiYaz(dosya, kayit) {
  let veri = {};
  if (fs.existsSync(dosya)) {
    const ham = fs.readFileSync(dosya, 'utf8');
    if (ham.trim()) {
      try { veri = JSON.parse(ham); }
      catch (e) { return { ok: false, neden: 'ayar dosyası geçerli JSON değil, dokunulmadı' }; }
    }
    if (!veri || typeof veri !== 'object' || Array.isArray(veri)) {
      return { ok: false, neden: 'ayar dosyası beklenen biçimde değil, dokunulmadı' };
    }
    const once = JSON.stringify((veri.mcpServers || {}).plantrack || null);
    if (once === JSON.stringify(kayit)) return { ok: true, ayni: true };
    fs.copyFileSync(dosya, `${dosya}.plantrack-yedek-${zaman()}`);
  } else {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
  }
  veri.mcpServers = veri.mcpServers && typeof veri.mcpServers === 'object' ? veri.mcpServers : {};
  veri.mcpServers.plantrack = kayit;
  const tmp = `${dosya}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(veri, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, dosya);
  return { ok: true };
}

// ── Başlatıcılar ──────────────────────────────────────────────────────────
function baslaticiOlustur(nodeYolu) {
  const sunucu = path.join(MCP, 'server.js');
  const log = path.join(HEDEF, 'mcp_server.log');
  const url = `http://127.0.0.1:${PORT}/`;

  if (WIN) {
    // Sunucu ayrı, küçük bir .cmd ile çalışır; böylece yönlendirmeler iç içe tırnağa girmez.
    const sunucuCmd = path.join(HEDEF, 'sunucu-baslat.cmd');
    fs.writeFileSync(sunucuCmd, [
      '@echo off',
      `"${nodeYolu}" "${sunucu}" < nul >> "${log}" 2>&1`,
      ''
    ].join('\r\n'), 'utf8');
    const cmd = [
      '@echo off',
      'rem Plantrack baslatici - kurulum/kur.js tarafindan olusturuldu',
      `powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '${url}api/status' | Out-Null; exit 0 } catch { exit 1 }"`,
      'if errorlevel 1 (',
      `  start "Plantrack Sunucu" /min "${sunucuCmd}"`,
      '  timeout /t 2 /nobreak >nul',
      ')',
      `start "" "${url}"`,
      ''
    ].join('\r\n');
    const hedefler = [path.join(HEDEF, 'Plantrack.cmd')];
    const masaustu = path.join(HOME, 'Desktop');
    if (!MASAUSTU_YOK && fs.existsSync(masaustu)) hedefler.push(path.join(masaustu, 'Plantrack.cmd'));
    for (const h of hedefler) fs.writeFileSync(h, cmd, 'utf8');
    return [sunucuCmd, ...hedefler];
  }

  const sh = `#!/usr/bin/env bash
# Plantrack başlatıcı — kurulum/kur.js tarafından oluşturuldu
URL="${url}"
if ! curl -s -m 1 "\${URL}api/status" >/dev/null 2>&1; then
  nohup "${nodeYolu}" "${sunucu}" </dev/null >>"${log}" 2>&1 &
  for _ in $(seq 1 30); do
    curl -s -m 1 "\${URL}api/status" >/dev/null 2>&1 && break
    sleep 0.2
  done
fi
${MAC ? 'open' : 'xdg-open'} "$URL"
`;
  const dosya = path.join(HEDEF, MAC ? 'Plantrack Baslat.command' : 'plantrack-baslat.sh');
  fs.writeFileSync(dosya, sh, { encoding: 'utf8', mode: 0o755 });
  return [dosya];
}

// Node yolu: sürüm klasörü yerine PATH'teki kalıcı yol (örn. /opt/homebrew/bin/node).
// process.execPath Homebrew'da .../Cellar/node/26.x/bin/node olur ve güncellemede bozulur.
function kaliciNodeYolu() {
  let gercek;
  try { gercek = fs.realpathSync(process.execPath); } catch (_) { return process.execPath; }
  const adlar = WIN ? ['node.exe'] : ['node'];
  for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const ad of adlar) {
      const aday = path.join(dir, ad);
      try { if (fs.realpathSync(aday) === gercek) return aday; } catch (_) {}
    }
  }
  return process.execPath;
}

// ── Ana akış ──────────────────────────────────────────────────────────────
async function main() {
  console.log(mavi('══════════════════════════════════════════'));
  console.log(mavi('   Plantrack Kurulum'));
  console.log(mavi('══════════════════════════════════════════'));

  baslik('[1/6] Ortam denetleniyor');
  const anaSurum = parseInt(process.versions.node.split('.')[0], 10);
  if (anaSurum < 18) dur(`Node.js ${process.versions.node} çok eski. En az 18 gerekli: https://nodejs.org`);
  ok(`Node.js ${process.versions.node} (${process.execPath})`);
  for (const f of ['index.html', 'app.js', 'version.json', 'mcp/server.js', 'mcp/db.js']) {
    if (!fs.existsSync(path.join(KAYNAK, f))) dur(`Kaynak klasör eksik: ${f} bulunamadı (${KAYNAK})`);
  }
  const surum = (JSON.parse(fs.readFileSync(path.join(KAYNAK, 'version.json'), 'utf8')).surum) || '?';
  ok(`Kaynak: ${KAYNAK} (v${surum})`);
  ok(`Hedef:  ${HEDEF}`);

  baslik('[2/6] Klasörler hazırlanıyor');
  for (const d of [WEB, MCP, DATA, YEDEK]) fs.mkdirSync(d, { recursive: true });
  ok('web · mcp · data · jYedek');

  baslik('[3/6] Önceki kurulum yedekleniyor');
  const yedekKok = path.join(YEDEK, `kurulum_${zaman()}`);
  const w = klasoruYedekle(WEB, 'web', yedekKok);
  const m = klasoruYedekle(MCP, 'mcp', yedekKok);
  if (w || m) ok(`Yedek: ${yedekKok}`); else ok('İlk kurulum, yedeklenecek bir şey yok');

  baslik('[4/6] Dosyalar kopyalanıyor');
  const webListe = WEB_DOSYALAR.filter(f => fs.existsSync(path.join(KAYNAK, f)));
  for (const k of WEB_KLASORLER) webListe.push(...dosyalariListele(KAYNAK, k));
  const mcpListe = fs.readdirSync(path.join(KAYNAK, 'mcp')).filter(f => f.endsWith('.js'));
  try {
    for (const rel of webListe) kopyalaVeDogrula(path.join(KAYNAK, rel), path.join(WEB, rel));
    for (const f of mcpListe) kopyalaVeDogrula(path.join(KAYNAK, 'mcp', f), path.join(MCP, f));
  } catch (err) {
    uyar('Kopyalama başarısız: ' + err.message);
    if (w) for (const rel of dosyalariListele(path.join(yedekKok, 'web'), '')) kopyalaVeDogrula(path.join(yedekKok, 'web', rel), path.join(WEB, rel));
    if (m) for (const rel of dosyalariListele(path.join(yedekKok, 'mcp'), '')) kopyalaVeDogrula(path.join(yedekKok, 'mcp', rel), path.join(MCP, rel));
    if (w || m) uyar('Önceki sürüm geri yüklendi.');
    dur('Kurulum tamamlanamadı.');
  }
  ok(`${webListe.length} arayüz dosyası, ${mcpListe.length} sunucu dosyası (doğrulandı)`);

  const db = path.join(DATA, 'plantrack_db.json');
  if (fs.existsSync(db)) {
    ok(`Mevcut veritabanı korundu: ${db}`);
  } else {
    const sablon = path.join(KAYNAK, 'data', 'plantrack_db.json');
    if (fs.existsSync(sablon)) { fs.copyFileSync(sablon, db); ok('Boş veritabanı şablonu yerleştirildi'); }
    else ok('Veritabanı ilk açılışta sunucu tarafından oluşturulacak');
  }

  baslik('[5/6] AI asistanı (MCP) bağlantısı');
  const nodeYolu = kaliciNodeYolu();
  const kayit = { command: nodeYolu, args: [path.join(MCP, 'server.js')] };
  if (MCP_YOK) {
    uyar('--mcp-yok: istemci ayarlarına dokunulmadı');
  } else {
    let bulunan = 0;
    for (const ist of istemciler()) {
      if (!fs.existsSync(path.dirname(ist.dosya))) continue;
      bulunan++;
      if (!(await sor(`${ist.ad} için Plantrack MCP kaydı eklensin mi?`))) { uyar(`${ist.ad}: atlandı`); continue; }
      try {
        const r = mcpKaydiYaz(ist.dosya, kayit);
        if (!r.ok) uyar(`${ist.ad}: ${r.neden} (${ist.dosya})`);
        else if (r.ayni) ok(`${ist.ad}: zaten güncel`);
        else ok(`${ist.ad}: kaydedildi (eski ayar yedeklendi) → ${ist.dosya}`);
      } catch (e) {
        uyar(`${ist.ad}: yazılamadı — ${e.message}`);
      }
    }
    if (!bulunan) uyar('Kurulu bir AI istemcisi bulunamadı.');
    console.log('    Claude Code için:  ' + mavi(`claude mcp add plantrack -s user -- "${kayit.command}" "${kayit.args[0]}"`));
    console.log('    Not: AI uygulamasını tamamen kapatıp yeniden açın; MCP yalnızca açılışta yüklenir.');
  }

  baslik('[6/6] Başlatıcı oluşturuluyor');
  for (const b of baslaticiOlustur(nodeYolu)) ok(b);
  if (MAC && fs.existsSync('/Applications/Plantrack.app')) ok('Plantrack.app kurulu; uygulamayı doğrudan da açabilirsiniz.');

  console.log('\n' + yesil('✔ Kurulum tamamlandı.') + ` Plantrack v${surum}`);
  console.log(`  Veriler: ${DATA}`);
  console.log(`  Arayüz:  http://127.0.0.1:${PORT}/  (sunucu çalışırken)`);
}

main()
  .catch((e) => { if (e.message !== '__dur__') { console.error(kirmizi('✖ ' + (e.stack || e.message))); process.exitCode = 1; } })
  .finally(() => { if (rl) rl.close(); });
