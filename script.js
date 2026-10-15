/*
  PokéLance — front-end
  1) Crie um projeto Supabase e execute supabase-schema.sql (ou patch.sql) no SQL Editor.
  2) Preencha SUPABASE_URL e SUPABASE_ANON_KEY abaixo (chave anon/public — nunca a service_role).
  3) Promova sua conta para admin usando o SQL do LEIA-ME.txt.
*/
const SUPABASE_URL = "https://mqzammkcdnjqbjcqthic.supabase.co".trim().replace(/\/(rest|auth|realtime|storage)\/v1.*$/, "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = "sb_publishable_0-YTPU0ZWznaOlsfLqW2Sg_cAR2yJD1";
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("COLE_");
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = id => document.getElementById(id);

/* ---------- Constantes ---------- */
const POKEAPI = "https://pokeapi.co/api/v2";
const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const PAGE_SIZE = 24;
const CACHE_KEY = "pokelance.catalog.v1";
const CACHE_TTL = 30 * 24 * 3600 * 1000;

const TYPE_PT = { normal: "Normal", fire: "Fogo", water: "Água", grass: "Planta", electric: "Elétrico", ice: "Gelo", fighting: "Lutador", poison: "Veneno", ground: "Terra", flying: "Voador", psychic: "Psíquico", bug: "Inseto", rock: "Pedra", ghost: "Fantasma", dragon: "Dragão", dark: "Sombrio", steel: "Aço", fairy: "Fada" };
const TYPE_ICON = { Normal: "⭐", Fogo: "🔥", Água: "💧", Planta: "🌿", Elétrico: "⚡", Gelo: "❄️", Lutador: "🥊", Veneno: "☠️", Terra: "🌍", Voador: "🕊️", Psíquico: "🔮", Inseto: "🐛", Pedra: "🪨", Fantasma: "👻", Dragão: "🐉", Sombrio: "🌑", Aço: "⚙️", Fada: "✨" };
const TYPE_GLOW = { Normal: "#c9c9a855", Fogo: "#ff754466", Água: "#52bfff66", Planta: "#65dc8a66", Elétrico: "#f7cf4b66", Gelo: "#9be7f066", Lutador: "#d6564a66", Veneno: "#b25ce066", Terra: "#d9b56a66", Voador: "#a7b8ff66", Psíquico: "#ff6fa866", Inseto: "#b4d83a66", Pedra: "#c2b06a66", Fantasma: "#b27aff66", Dragão: "#7a5cff66", Sombrio: "#8a7a7066", Aço: "#b7c4d466", Fada: "#ffa6e066" };
const NAME_FIX = { "nidoran-f": "Nidoran ♀", "nidoran-m": "Nidoran ♂", "mr-mime": "Mr. Mime", "mime-jr": "Mime Jr.", "mr-rime": "Mr. Rime", "farfetchd": "Farfetch'd", "sirfetchd": "Sirfetch'd", "type-null": "Type: Null", "flabebe": "Flabébé", "ho-oh": "Ho-Oh", "porygon-z": "Porygon-Z", "jangmo-o": "Jangmo-o", "hakamo-o": "Hakamo-o", "kommo-o": "Kommo-o", "wo-chien": "Wo-Chien", "chien-pao": "Chien-Pao", "ting-lu": "Ting-Lu", "chi-yu": "Chi-Yu" };

/* ---------- Estado ---------- */
let mode = "login", user = null, profile = null, walletBalance = 0;
let lots = [];                               // linhas da tabela pokemon (lotes já criados)
let settings = { bidding_open: true, default_start_bid: 100 };
let catalog = [], catalogById = new Map(), typesById = {};
let catalogState = "idle", typesState = "idle";  // idle | loading | ok | error
let players = [], recentBids = [];
let dataChannel = null, adminChannel = null, ownChannel = null;
let visible = PAGE_SIZE, catalogStarted = false;

/* ---------- Utilidades ---------- */
function money(n) { return "₽ " + Number(n || 0).toLocaleString("pt-BR"); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function norm(s) { return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function simp(s) { return norm(s).replace(/[^a-z0-9]/g, ""); }   // "Mr. Mime", "mr-mime" e "mr mime" viram "mrmime"
function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 3600); }
function setMessage(msg) { $("authMessage").textContent = msg; }
function isAdmin() { return profile?.role === "admin"; }
function prettyName(slug) {
  if (NAME_FIX[slug]) return NAME_FIX[slug];
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function idFromUrl(u) { const m = String(u).match(/\/(\d+)\/?$/); return m ? Number(m[1]) : null; }
function friendlyError(err) {
  const msg = err?.message || "Algo deu errado.";
  if (err?.code === "PGRST202" || /could not find the function|schema cache/i.test(msg)) return "O banco ainda não tem as funções novas. Rode o patch.sql no SQL Editor do Supabase.";
  return msg;
}
async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }

/* ---------- Autenticação ---------- */
function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  $("authTitle").textContent = mode === "login" ? "Bem-vindo de volta, treinador!" : "Crie sua conta de treinador";
  $("authSubmit").textContent = mode === "login" ? "Entrar no leilão" : "Criar conta";
  $("nicknameWrap").classList.toggle("hidden", mode !== "signup");
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  setMessage("");
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

async function authSubmit(e) {
  e.preventDefault();
  if (!sb) { setMessage("Configure a URL e a chave do Supabase no arquivo script.js primeiro."); return; }
  const email = $("email").value.trim(), password = $("password").value, nickname = $("nickname").value.trim();
  $("authSubmit").disabled = true; setMessage("Conectando...");
  try {
    if (mode === "signup") {
      if (!nickname) { setMessage("Escolha um nome de treinador."); return; }
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nickname }, ...(location.protocol.startsWith("http") ? { emailRedirectTo: location.origin + location.pathname } : {}) } });
      if (error) throw error;
      if (!data.session) { setMessage("Conta criada! Confira seu e-mail para confirmar e depois entre."); return; }
      toast("Conta criada! Bem-vindo ao leilão.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    await loadSession();
  } catch (err) { setMessage(err.message || "Não foi possível entrar."); }
  finally { $("authSubmit").disabled = false; }
}
$("authForm").addEventListener("submit", authSubmit);

async function loadSession() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  user = session?.user || null;
  $("authPanel").classList.toggle("hidden", !!user);
  $("gamePanel").classList.toggle("hidden", !user);
  $("logoutBtn").classList.toggle("hidden", !user);
  if (!user) return;

  let { data: prof, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!prof) {
    const nick = user.user_metadata?.nickname || user.email.split("@")[0];
    const result = await sb.from("profiles").insert({ id: user.id, nickname: nick }).select().single();
    if (result.error) throw result.error;
    prof = result.data;
  }
  profile = prof;
  walletBalance = prof.balance;
  $("playerName").textContent = profile.nickname;
  $("adminPanel").classList.toggle("hidden", !isAdmin());
  buildTypeFilter();
  startCatalog();
  await refreshAll();
  subscribeRealtime();
}

/* ---------- Pokédex (PokéAPI) ---------- */
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && Date.now() - c.t < CACHE_TTL && Array.isArray(c.species) && c.species.length && c.types) return c;
  } catch (e) { /* sem cache */ }
  return null;
}
function writeCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), species: catalog.map(c => [c.id, c.name]), types: typesById })); } catch (e) { /* sem cache */ }
}
function setCatalog(list) { catalog = list; catalogById = new Map(list.map(c => [c.id, c])); }

async function startCatalog() {
  if (catalogStarted) return;
  catalogStarted = true;
  const cached = readCache();
  if (cached) {
    setCatalog(cached.species.map(([id, name]) => ({ id, name })));
    typesById = cached.types; catalogState = "ok"; typesState = "ok";
    renderGrid(); return;
  }
  catalogState = "loading"; renderGrid();
  try {
    const data = await getJson(`${POKEAPI}/pokemon-species?limit=2000`);
    setCatalog(data.results.map(r => ({ id: idFromUrl(r.url), slug: r.name })).filter(c => c.id)
      .sort((a, b) => a.id - b.id).map(c => ({ id: c.id, name: prettyName(c.slug) })));
    if (!catalog.length) throw new Error("lista vazia");
    catalogState = "ok";
  } catch (e) { catalogState = "error"; renderGrid(); return; }
  typesState = "loading"; renderGrid();

  const slugs = Object.keys(TYPE_PT);
  const results = await Promise.allSettled(slugs.map(t => getJson(`${POKEAPI}/type/${t}`)));
  const tmp = {};
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    for (const p of r.value.pokemon) {
      const id = idFromUrl(p.pokemon.url);
      if (!catalogById.has(id)) continue;     // ignora formas alternativas (ids 10000+)
      (tmp[id] ||= []).push([p.slot, TYPE_PT[slugs[i]]]);
    }
  });
  typesById = {};
  for (const id in tmp) typesById[id] = tmp[id].sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const allOk = results.every(r => r.status === "fulfilled");
  typesState = allOk ? "ok" : "error";
  if (allOk) writeCache();
  renderGrid();
}

function buildTypeFilter() {
  const sel = $("typeFilter");
  if (sel.options.length > 1) return;
  Object.values(TYPE_PT).sort((a, b) => a.localeCompare(b, "pt-BR")).forEach(t => {
    const o = document.createElement("option"); o.value = t; o.textContent = `${TYPE_ICON[t]} ${t}`; sel.appendChild(o);
  });
}

/* ---------- Dados do Supabase ---------- */
async function refreshAll() { await Promise.all([loadLots(), loadWallet(), loadSettings(), isAdmin() ? loadAdminData() : Promise.resolve()]); }

async function loadLots() {
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from("pokemon").select("*").order("id").range(from, from + 999);
    if (error) { toast(error.message); return; }
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  lots = all;
  renderGrid(); renderHistory(); updateStats(); renderAdmin();
}
async function loadWallet() {
  const { data, error } = await sb.from("profiles").select("balance,nickname,role").eq("id", user.id).single();
  if (error) return;
  walletBalance = data.balance; profile = { ...profile, ...data };
  $("playerName").textContent = data.nickname;
  $("adminPanel").classList.toggle("hidden", !isAdmin());
  updateStats();
}
async function loadSettings() {
  const { data, error } = await sb.from("auction_settings").select("*").limit(1).maybeSingle();
  if (error || !data) return;           // sem a tabela (patch ainda não rodou): usa os padrões
  settings = data;
  $("pausedBanner").classList.toggle("hidden", settings.bidding_open);
  renderGrid(); renderAdmin();
}
async function loadAdminData() {
  const [p, b] = await Promise.all([
    sb.from("profiles").select("id,nickname,balance,role").order("nickname"),
    sb.from("bid_history").select("bidder_name,amount,total_bid,pokemon_id,created_at").order("created_at", { ascending: false }).limit(15)
  ]);
  if (!p.error) players = p.data || [];
  if (!b.error) recentBids = b.data || [];
  renderAdmin();
}

/* ---------- Modelo de exibição ---------- */
function lotName(l) { return catalogById.get(l.pokedex_number)?.name || l.name; }
function lotTypes(l) { return typesById[l.pokedex_number] || (l.type ? [l.type] : []); }

function buildEntries() {
  const byDex = new Map(lots.filter(l => l.pokedex_number != null).map(l => [l.pokedex_number, l]));
  const fromLot = l => ({ dex: l.pokedex_number, name: l.name, types: l.type ? [l.type] : [], lot: l });
  const list = [];
  if (catalog.length) {
    for (const c of catalog) list.push({ dex: c.id, name: c.name, types: typesById[c.id] || [], lot: byDex.get(c.id) || null });
    for (const l of lots) if (l.pokedex_number == null || !catalogById.has(l.pokedex_number)) list.push(fromLot(l));
  } else {
    for (const l of lots) list.push(fromLot(l));
  }
  return list;
}
function statusOf(e) {
  if (!e.lot) return "free";
  if (e.lot.status === "closed") return "sold";
  return e.lot.highest_bidder_id === user?.id ? "mine" : "open";
}
function matches(e) {
  const raw = $("search").value.trim().replace(/^#/, "");
  if (raw) {
    if (/^\d+$/.test(raw)) { if (e.dex !== Number(raw)) return false; }
    else {
      const q = simp(raw);
      if (q && !simp(e.name).includes(q) && !e.types.some(t => simp(t).includes(q))) return false;
    }
  }
  const tf = $("typeFilter").value;
  if (tf !== "Todos" && !e.types.includes(tf)) return false;
  const sf = $("statusFilter").value, st = statusOf(e);
  if (sf === "livres" && st !== "free") return false;
  if (sf === "abertos" && st !== "open" && st !== "mine") return false;
  if (sf === "meus" && st !== "mine") return false;
  if (sf === "vendidos" && st !== "sold") return false;
  return true;
}

/* ---------- Renderização ---------- */
function cardHtml(e) {
  const lot = e.lot, st = statusOf(e), admin = isAdmin();
  const paused = !settings.bidding_open;
  const sold = st === "sold", mine = st === "mine", free = st === "free";
  const glow = TYPE_GLOW[e.types[0]] || "#ffcc4d44";
  const pills = e.types.map(t => `${TYPE_ICON[t] || "✨"} ${esc(t)}`).join(" · ");
  const visual = e.dex
    ? `<img class="pokemon-img" loading="lazy" alt="${esc(e.name)}" src="${SPRITE(e.dex)}" onerror="this.style.visibility='hidden'">`
    : `<div class="pokemon-emoji">${esc(lot?.emoji || "⭐")}</div>`;
  const statusText = sold ? "LEILÃO ENCERRADO" : mine ? "VOCÊ ESTÁ NA LIDERANÇA" : free ? "● DISPONÍVEL" : "● LEILÃO ABERTO";
  const statusCls = sold ? "closed" : free ? "free" : "";
  const value = free ? settings.default_start_bid : sold ? (lot.winning_bid ?? lot.current_bid) : lot.current_bid;
  const label1 = sold ? "LANCE VENCEDOR" : free ? "LANCE INICIAL" : "LANCE ATUAL";
  const label2 = sold ? "VENCEDOR" : "MAIOR LANCE";
  const who = sold ? (lot.winner_name || "Sem vencedor") : (lot?.highest_bidder_name || (free ? "Sem lances" : "Lance inicial"));
  const ids = `data-dex="${e.dex ?? ""}" data-lot="${lot?.id ?? ""}"`;
  const locked = mine || paused;
  const bidBtns = sold
    ? `<button class="bid-btn" disabled>Encerrado</button>`
    : [25, 50, 100].map(a => `<button class="bid-btn${a === 100 ? " main" : ""}" data-act="bid" ${ids} data-amount="${a}" ${locked ? "disabled" : ""}>+ ₽${a}</button>`).join("");
  let adminBtns = "";
  if (admin) {
    const b = [];
    if (free && e.dex) b.push(`<button class="bid-btn adm" data-act="openlot" ${ids}>Definir preço</button>`);
    if (lot && st !== "sold" && !lot.highest_bidder_id) b.push(`<button class="bid-btn adm" data-act="openlot" ${ids}>Preço inicial</button>`);
    if (lot && st !== "sold") b.push(`<button class="bid-btn adm" data-act="close" ${ids}>✓ Encerrar</button>`);
    if (lot) b.push(`<button class="bid-btn adm" data-act="release" ${ids}>${sold ? "↺ Devolver ao mercado" : "✕ Cancelar lote"}</button>`);
    if (b.length) adminBtns = `<div class="bid-actions adm-row">${b.join("")}</div>`;
  }
  return `<article class="pokemon-card"><div class="card-visual" style="--glow:${esc(glow)}"><span class="type-pill">${pills || "✨ ..."}</span><span class="lot">${e.dex ? "#" + String(e.dex).padStart(4, "0") : "LOTE #" + esc(lot?.id)}</span>${visual}</div>`
    + `<div class="card-body"><div class="pokemon-title"><h3>${esc(e.name)}</h3></div>`
    + `<div class="status ${statusCls}">${statusText}</div>`
    + `<div class="bid-row"><div><div class="bid-label">${label1}</div><div class="bid-value">${money(value)}</div></div><div><div class="bid-label">${label2}</div><div class="bidder">${esc(who)}</div></div></div>`
    + `<div class="bid-actions">${bidBtns}</div>${adminBtns}</div></article>`;
}

function renderGrid() {
  if (!user) return;
  const entries = buildEntries();
  const list = entries.filter(matches);
  const shown = list.slice(0, visible);
  $("count").textContent = list.length === entries.length ? String(list.length) : `${list.length} / ${entries.length}`;
  let status = "";
  if (catalogState === "loading") status = "Carregando a Pokédex da PokéAPI...";
  else if (catalogState === "error") status = "Não foi possível carregar a PokéAPI agora. Mostrando só os Pokémon que já têm lote. Recarregue a página para tentar de novo.";
  else if (typesState === "loading") status = "Carregando os tipos dos Pokémon...";
  else if (typesState === "error") status = "Alguns tipos não carregaram; o filtro por tipo pode estar incompleto. Recarregue a página para tentar de novo.";
  $("catalogStatus").textContent = status;
  $("pokemonGrid").innerHTML = shown.length ? shown.map(cardHtml).join("")
    : `<p class="muted">${catalogState === "loading" ? "Carregando..." : "Nenhum Pokémon encontrado com esses filtros."}</p>`;
  const more = list.length - shown.length;
  $("loadMore").classList.toggle("hidden", more <= 0);
  $("loadMore").textContent = `Mostrar mais (${more} restantes)`;
}

function updateStats() {
  if (!user) return;
  const committed = lots.filter(l => l.status === "open" && l.highest_bidder_id === user.id).reduce((t, l) => t + l.current_bid, 0);
  $("balance").textContent = money(walletBalance - committed);
  $("committed").textContent = committed ? `Total ${money(walletBalance)} · ${money(committed)} em lances` : "";
  const mineWon = lots.filter(l => l.status === "closed" && l.winner_id === user.id);
  $("wins").textContent = String(mineWon.length);
  $("myList").innerHTML = mineWon.length
    ? mineWon.map(l => `<div class="history-item"><span>${esc(lotName(l))}</span><b>${money(l.winning_bid || 0)}</b></div>`).join("")
    : "Você ainda não arrematou nenhum Pokémon.";
}
function renderHistory() {
  const done = lots.filter(l => l.status === "closed").sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 8);
  $("historyList").innerHTML = done.length
    ? done.map(l => `<div class="history-item"><span>${esc(lotName(l))} — ${esc(l.winner_name || "Sem vencedor")}</span><b>${l.winning_bid ? money(l.winning_bid) : "—"}</b></div>`).join("")
    : "Nenhum Pokémon arrematado ainda.";
}
function renderAdmin() {
  if (!isAdmin()) return;
  $("biddingState").textContent = settings.bidding_open ? "Lances abertos" : "Lances pausados";
  $("toggleBidding").textContent = settings.bidding_open ? "⏸ Pausar lances" : "▶ Retomar lances";
  if (document.activeElement !== $("defaultBid")) $("defaultBid").value = settings.default_start_bid;
  $("playersList").innerHTML = players.length ? players.map(p =>
    `<div class="history-item"><span>${esc(p.nickname)}${p.role === "admin" ? '<em class="badge">ADM</em>' : ""}</span>`
    + `<span><b>${money(p.balance)}</b> <button class="mini" data-act="setbal" data-id="${esc(p.id)}">Saldo</button>`
    + (p.id === user.id ? "" : ` <button class="mini" data-act="setrole" data-id="${esc(p.id)}" data-role="${p.role === "admin" ? "player" : "admin"}">${p.role === "admin" ? "Remover adm" : "Tornar adm"}</button>`)
    + `</span></div>`).join("") : "Nenhum jogador.";
  $("bidsList").innerHTML = recentBids.length ? recentBids.map(b => {
    const l = lots.find(x => x.id === b.pokemon_id);
    const t = new Date(b.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `<div class="history-item"><span>${esc(b.bidder_name)} +${esc(b.amount)} em ${esc(l ? lotName(l) : "lote removido")}</span><b>${money(b.total_bid)} · ${t}</b></div>`;
  }).join("") : "Nenhum lance ainda.";
}

/* ---------- Ações ---------- */
async function callRpc(fn, args, fallbackMsg) {
  try {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    toast(data?.message || fallbackMsg);
    await refreshAll();
    return true;
  } catch (err) { toast(friendlyError(err)); return false; }
}
function findEntry(dex, lotId) {
  return buildEntries().find(e => (dex && e.dex === dex) || (!dex && lotId && e.lot?.id === lotId));
}
async function placeBid(dex, lotId, amount, btn) {
  if (btn) btn.disabled = true;
  const e = findEntry(dex, lotId);
  const ok = dex
    ? await callRpc("place_bid_dex", { p_dex: dex, p_name: e?.name || "Pokémon", p_type: e?.types?.[0] || "Normal", p_amount: amount }, "Lance registrado!")
    : await callRpc("place_bid", { p_pokemon_id: lotId, p_amount: amount }, "Lance registrado!");
  if (!ok && btn) btn.disabled = false;
}
async function openLot(dex, lotId) {
  const e = findEntry(dex, lotId); if (!e || !e.dex) return;
  const cur = e.lot ? e.lot.starting_bid : settings.default_start_bid;
  const v = prompt(`Lance inicial para ${e.name}:`, String(cur));
  if (v === null) return;
  const n = Math.floor(Number(v));
  if (!(n >= 1)) { toast("Informe um valor maior que zero."); return; }
  await callRpc("admin_open_lot", { p_dex: e.dex, p_name: e.name, p_type: e.types[0] || "Normal", p_start: n }, "Lote atualizado.");
}
async function closeLot(lotId) {
  if (!confirm("Encerrar este leilão agora? O maior lance será o vencedor e o valor será cobrado dele.")) return;
  await callRpc("close_auction", { p_pokemon_id: lotId }, "Leilão encerrado.");
}
async function releaseLot(lotId) {
  const l = lots.find(x => x.id === lotId); if (!l) return;
  const msg = l.status === "closed"
    ? `Devolver ${lotName(l)} ao mercado? O vencedor será reembolsado e os lances deste lote serão apagados.`
    : `Cancelar o lote de ${lotName(l)}? Os lances serão apagados (ninguém foi cobrado ainda).`;
  if (!confirm(msg)) return;
  await callRpc("admin_release_lot", { p_pokemon_id: lotId }, "Lote removido.");
}

$("pokemonGrid").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-act]"); if (!b || b.disabled) return;
  const dex = b.dataset.dex ? Number(b.dataset.dex) : null, lotId = b.dataset.lot ? Number(b.dataset.lot) : null;
  switch (b.dataset.act) {
    case "bid": placeBid(dex, lotId, Number(b.dataset.amount), b); break;
    case "openlot": openLot(dex, lotId); break;
    case "close": closeLot(lotId); break;
    case "release": releaseLot(lotId); break;
  }
});

$("adminPanel").addEventListener("click", async ev => {
  const b = ev.target.closest("button"); if (!b) return;
  if (b.id === "toggleBidding") {
    await callRpc("admin_update_settings", { p_bidding_open: !settings.bidding_open, p_default_start_bid: settings.default_start_bid }, "Configurações salvas.");
  } else if (b.id === "saveDefaultBid") {
    const n = Math.floor(Number($("defaultBid").value));
    if (!(n >= 1)) { toast("Informe um lance inicial maior que zero."); return; }
    await callRpc("admin_update_settings", { p_bidding_open: settings.bidding_open, p_default_start_bid: n }, "Configurações salvas.");
  } else if (b.id === "resetSeason") {
    if (prompt("Isso apaga TODOS os lotes e lances e redefine os saldos.\nDigite REINICIAR para confirmar:") !== "REINICIAR") return;
    const bal = Math.floor(Number(prompt("Saldo inicial de cada jogador:", "1000")));
    if (!(bal >= 0)) { toast("Saldo inválido."); return; }
    await callRpc("admin_reset_season", { p_balance: bal }, "Temporada reiniciada.");
  } else if (b.dataset.act === "setbal") {
    const p = players.find(x => x.id === b.dataset.id); if (!p) return;
    const v = prompt(`Novo saldo para ${p.nickname}:`, String(p.balance));
    if (v === null) return;
    const n = Math.floor(Number(v));
    if (!(n >= 0)) { toast("Saldo inválido."); return; }
    await callRpc("admin_set_balance", { p_user: p.id, p_balance: n }, "Saldo atualizado.");
  } else if (b.dataset.act === "setrole") {
    const p = players.find(x => x.id === b.dataset.id); if (!p) return;
    const role = b.dataset.role;
    if (!confirm(`${role === "admin" ? "Tornar" : "Remover como"} administrador: ${p.nickname}?`)) return;
    await callRpc("admin_set_role", { p_user: p.id, p_role: role }, "Papel atualizado.");
  }
});

/* ---------- Filtros ---------- */
function onFilterChange() { visible = PAGE_SIZE; renderGrid(); }
$("search").addEventListener("input", onFilterChange);
$("typeFilter").addEventListener("change", onFilterChange);
$("statusFilter").addEventListener("change", onFilterChange);
$("loadMore").addEventListener("click", () => { visible += PAGE_SIZE; renderGrid(); });

/* ---------- Sair / tempo real ---------- */
$("logoutBtn").addEventListener("click", async () => {
  if (sb) {
    for (const ch of [dataChannel, adminChannel, ownChannel]) if (ch) await sb.removeChannel(ch);
    await sb.auth.signOut();
  }
  location.reload();
});

function subscribeRealtime() {
  for (const ch of [dataChannel, adminChannel, ownChannel]) if (ch) sb.removeChannel(ch);
  adminChannel = null;
  let t;
  const soon = fn => { clearTimeout(t); t = setTimeout(fn, 150); };
  dataChannel = sb.channel("pokelance-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "pokemon" }, () => soon(() => { loadLots(); loadWallet(); if (isAdmin()) loadAdminData(); }))
    .on("postgres_changes", { event: "*", schema: "public", table: "auction_settings" }, () => loadSettings())
    .subscribe();
  ownChannel = sb.channel("pokelance-own")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => loadWallet())
    .subscribe();
  if (isAdmin()) {
    adminChannel = sb.channel("pokelance-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadAdminData())
      .subscribe();
  }
}

/* ---------- Início ---------- */
(async () => {
  if (!configured) { $("setupWarning").classList.remove("hidden"); return; }
  $("setupWarning").classList.add("hidden");
  sb.auth.onAuthStateChange((_event, session) => {
    if (!session) { $("authPanel").classList.remove("hidden"); $("gamePanel").classList.add("hidden"); $("logoutBtn").classList.add("hidden"); }
  });
  try { await loadSession(); } catch (err) { toast(err.message || "Erro ao carregar o perfil."); }
})();
