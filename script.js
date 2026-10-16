const CORES = {
  pendente: '#2ecc71',
  andamento: '#f1c40f',
  visitada: '#3498db',
  revisitar: '#e74c3c'
};

const FIREBASE_URL = 'https://mapa-territorio-5166c-default-rtdb.firebaseio.com';
const SENHA_ADM = 'admin123'; // senha do responsável (visão geral + reset)
const cacheLocal = {}; // id -> dados
let territorioAtual = null;
let quadraAtual = null;
let dados = {};
const camadas = {};
let visaoGeralAutorizado = false; // sessão: libera após acertar a senha uma vez

const mapa = L.map('mapa');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(mapa);
mapa.on('click', fecharPainel);

// ---------- Seletor de territórios ----------
const selTerritorio = document.getElementById('selTerritorio');
const optGeral = document.createElement('option');
optGeral.value = '__geral';
optGeral.textContent = '🌐 Visão geral (todos)';
selTerritorio.appendChild(optGeral);
TERRITORIOS.forEach(t => {
  const opt = document.createElement('option');
  opt.value = t.id;
  opt.textContent = t.nome;
  selTerritorio.appendChild(opt);
});
selTerritorio.addEventListener('change', () => selecionarTerritorio(selTerritorio.value));

// ---------- Dados ----------
async function carregarTerritorio(id) {
  let remoto = null;
  try {
    const r = await fetch(`${FIREBASE_URL}/territorios/${id}.json`);
    remoto = await r.json();
  } catch (e) { console.warn('Sem conexão com o Firebase', e); }
  if (remoto && typeof remoto === 'object') {
    cacheLocal[id] = remoto;
    localStorage.setItem('territorio-' + id, JSON.stringify(remoto));
  } else {
    const local = localStorage.getItem('territorio-' + id);
    if (local) cacheLocal[id] = JSON.parse(local);
  }
  if (!cacheLocal[id]) cacheLocal[id] = {};
  return cacheLocal[id];
}

async function salvarTerritorio() {
  localStorage.setItem('territorio-' + territorioAtual.id, JSON.stringify(dados));
  try {
    await fetch(`${FIREBASE_URL}/territorios/${territorioAtual.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
  } catch (e) { console.warn('Falha ao salvar no Firebase', e); }
}

// ---------- Desenho ----------
function limparCamadas() {
  Object.values(camadas).forEach(p => mapa.removeLayer(p));
  Object.keys(camadas).forEach(k => delete camadas[k]);
}

function desenharTerritorio(t) {
  limparCamadas();
  const bounds = [];
  dados = cacheLocal[t.id] || {};
  t.quadras.forEach(q => {
    if (!dados[q.nome]) dados[q.nome] = { status: 'pendente', responsavel: '', data: '', obs: '' };
    const pol = L.polygon(q.pontos, { color: '#333', weight: 2, fillColor: CORES[dados[q.nome].status], fillOpacity: 0.5 }).addTo(mapa);
    pol.bindTooltip(q.nome);
    pol.on('click', (e) => { L.DomEvent.stopPropagation(e); abrirPainel(q.nome); });
    camadas[q.nome] = pol;
    bounds.push(...q.pontos);
  });
  mapa.invalidateSize();
  mapa.fitBounds(bounds);
  setTimeout(() => {
    document.querySelectorAll('.leaflet-interactive').forEach(p => p.setAttribute('tabindex', '-1'));
  }, 500);
  atualizarProgresso();
  aplicarFiltros();
}

async function selecionarTerritorio(id) {
  if (id === '__geral') {
    if (!visaoGeralAutorizado) {
      const senha = prompt('🔒 Visão geral restrita. Digite a senha do responsável:');
      if (senha !== SENHA_ADM) {
        alert('Senha incorreta. Acesso negado.');
        selTerritorio.value = territorioAtual ? territorioAtual.id : TERRITORIOS[0].id;
        return;
      }
      visaoGeralAutorizado = true;
    }
    await visaoGeral(); return;
  }
  document.getElementById('resumo').classList.add('oculto');
  territorioAtual = TERRITORIOS.find(t => t.id === id);
  await carregarTerritorio(id);
  desenharTerritorio(territorioAtual);
}

// ---------- Visão geral (admin) ----------
async function visaoGeral(jaCarregado = false) {
  territorioAtual = null;
  limparCamadas();
  dados = {};
  const todosBounds = [];
  const resumo = document.getElementById('resumo');
  resumo.innerHTML = '<h3>🌐 Visão geral dos territórios</h3>';
  resumo.classList.remove('oculto');

  let totalGeral = 0, visitadasGeral = 0;

  for (const t of TERRITORIOS) {
    const d = jaCarregado ? (cacheLocal[t.id] || {}) : await carregarTerritorio(t.id);
    let visitadas = 0;
    t.quadras.forEach(q => {
      const info = d[q.nome] || { status: 'pendente', responsavel: '', data: '', obs: '' };
      visitadas += info.status === 'visitada' ? 1 : 0;
      const pol = L.polygon(q.pontos, {
        color: '#333', weight: 1.5,
        fillColor: CORES[info.status] || CORES.pendente, fillOpacity: 0.55
      }).addTo(mapa);
      pol.bindTooltip(
        `${q.nome} — ${info.status}` +
        (info.responsavel ? `<br>👤 ${info.responsavel}` : '') +
        (info.data ? `<br>📅 ${info.data}` : '')
      );
      pol.on('click', (e) => { L.DomEvent.stopPropagation(e); });
      camadas[q.nome] = pol;
      todosBounds.push(...q.pontos);
    });
    const total = t.quadras.length;
    const pct = total ? Math.round((visitadas / total) * 100) : 0;
    totalGeral += total;
    visitadasGeral += visitadas;

    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div class="linha"><strong>${t.nome}</strong><span>${visitadas}/${total} — ${pct}%</span></div>
      <div class="mini"><span style="width:${pct}%"></span></div>`;
    item.querySelector('.linha').onclick = () => {
      selTerritorio.value = t.id;
      selecionarTerritorio(t.id);
    };
    resumo.appendChild(item);
  }

  const pctGeral = totalGeral ? Math.round((visitadasGeral / totalGeral) * 100) : 0;
  document.getElementById('textoProgresso').textContent =
    `🌐 Todos os territórios — ${visitadasGeral} de ${totalGeral} quadras visitadas — ${pctGeral}% de cobertura`;
  document.getElementById('barraFill').style.width = pctGeral + '%';

  // Atualiza a referência do sync para não entrar em loop
  try {
    const snap = {};
    for (const t of TERRITORIOS) snap[t.id] = cacheLocal[t.id] || {};
    ultimaBuscaGeral = JSON.stringify(snap);
  } catch (e) { /* ignora */ }

  if (!jaCarregado && todosBounds.length) {
    mapa.invalidateSize();
    mapa.fitBounds(todosBounds);
  } else {
    mapa.invalidateSize();
  }
  setTimeout(() => {
    document.querySelectorAll('.leaflet-interactive').forEach(p => p.setAttribute('tabindex', '-1'));
  }, 500);
}

// ---------- Painel ----------
function abrirPainel(nome) {
  quadraAtual = nome;
  const d = dados[nome];
  document.getElementById('painelTitulo').textContent = `${territorioAtual.nome} — ${nome}`;
  document.getElementById('status').value = d.status;
  document.getElementById('responsavel').value = d.responsavel;
  document.getElementById('data').value = d.data;
  document.getElementById('obs').value = d.obs;
  document.getElementById('painel').classList.remove('oculto');
}

function fecharPainel() {
  document.getElementById('painel').classList.add('oculto');
  quadraAtual = null;
}

function salvarQuadra() {
  dados[quadraAtual] = {
    status: document.getElementById('status').value,
    responsavel: document.getElementById('responsavel').value,
    data: document.getElementById('data').value,
    obs: document.getElementById('obs').value
  };
  salvarTerritorio();
  camadas[quadraAtual].setStyle({ fillColor: CORES[dados[quadraAtual].status] });
  atualizarProgresso();
  aplicarFiltros();
  fecharPainel();
}

function atualizarProgresso() {
  const total = Object.keys(dados).length;
  const visitadas = Object.values(dados).filter(d => d.status === 'visitada').length;
  const pct = total ? Math.round((visitadas / total) * 100) : 0;
  document.getElementById('textoProgresso').textContent =
    `${territorioAtual ? territorioAtual.nome + ' — ' : ''}${visitadas} de ${total} quadras visitadas — ${pct}% de cobertura`;
  document.getElementById('barraFill').style.width = pct + '%';
}

function aplicarFiltros() {
  const b = document.getElementById('busca').value.toLowerCase();
  const f = document.getElementById('filtroStatus').value;
  Object.keys(camadas).forEach(nome => {
    const d = dados[nome];
    const ok = nome.toLowerCase().includes(b) && (f === 'todos' || d.status === f);
    camadas[nome].setStyle({ opacity: ok ? 1 : 0, fillOpacity: ok ? 0.5 : 0 });
    if (!ok) camadas[nome].closeTooltip();
  });
}

document.getElementById('busca').addEventListener('input', aplicarFiltros);
document.getElementById('filtroStatus').addEventListener('change', aplicarFiltros);

document.getElementById('btnResetar').addEventListener('click', () => {
  if (!territorioAtual) { alert('Selecione um território específico para resetar.'); return; }
  const senha = prompt('🔒 Digite a senha de administrador:');
  if (senha !== SENHA_ADM) { alert('Senha incorreta. Acesso negado.'); return; }
  if (!confirm(`Resetar "${territorioAtual.nome}"? Todas as quadras voltarão para PENDENTE.`)) return;
  territorioAtual.quadras.forEach(q => {
    dados[q.nome] = { status: 'pendente', responsavel: '', data: '', obs: '' };
    camadas[q.nome].setStyle({ fillColor: CORES['pendente'] });
  });
  salvarTerritorio();
  atualizarProgresso();
  aplicarFiltros();
});

// ---------- Sincronização em tempo real ----------
let ultimaBusca = '';
let ultimaBuscaGeral = '';
setInterval(async () => {
  try {
    // Modo território único
    if (territorioAtual) {
      const r = await fetch(`${FIREBASE_URL}/territorios/${territorioAtual.id}.json`);
      const remoto = await r.json();
      const s = JSON.stringify(remoto || {});
      if (s !== ultimaBusca) {
        ultimaBusca = s;
        if (remoto && typeof remoto === 'object') {
          cacheLocal[territorioAtual.id] = remoto;
          localStorage.setItem('territorio-' + territorioAtual.id, s);
          dados = remoto;
          desenharTerritorio(territorioAtual);
        }
      }
      return;
    }
    // Modo visão geral: observa TODOS os territórios
    if (selTerritorio.value === '__geral') {
      const snapshot = {};
      for (const t of TERRITORIOS) {
        try {
          const r = await fetch(`${FIREBASE_URL}/territorios/${t.id}.json`);
          snapshot[t.id] = await r.json() || {};
        } catch (e) { snapshot[t.id] = cacheLocal[t.id] || {}; }
      }
      const s = JSON.stringify(snapshot);
      if (s !== ultimaBuscaGeral) {
        ultimaBuscaGeral = s;
        for (const t of TERRITORIOS) {
          cacheLocal[t.id] = snapshot[t.id] || {};
          localStorage.setItem('territorio-' + t.id, JSON.stringify(cacheLocal[t.id]));
        }
        await visaoGeral(true);
      }
    }
  } catch (e) { /* offline */ }
}, 8000);

// ---------- Início ----------
(async () => {
  if (TERRITORIOS.length) {
    selTerritorio.value = TERRITORIOS[0].id;
    await selecionarTerritorio(TERRITORIOS[0].id);
    try {
      const r = await fetch(`${FIREBASE_URL}/territorios/${TERRITORIOS[0].id}.json`);
      const remoto = await r.json();
      ultimaBusca = JSON.stringify(remoto || {});
    } catch (e) { /* offline */ }
  }
})();
