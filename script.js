const CORES = {
  pendente: '#2ecc71',
  andamento: '#f1c40f',
  visitada: '#3498db',
  revisitar: '#e74c3c'
};

let dados = JSON.parse(localStorage.getItem('territorio') || '{}');
const mapa = L.map('mapa');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(mapa);

const bounds = [];
const camadas = {};
let quadraAtual = null;

Object.keys(dados).forEach(k => { if (!QUADRAS.some(q => q.nome === k)) delete dados[k]; });
QUADRAS.forEach(q => {
  if (!dados[q.nome]) dados[q.nome] = { status: 'pendente', responsavel: '', data: '', obs: '' };
  const pol = L.polygon(q.pontos, { color: '#333', weight: 2, fillColor: CORES[dados[q.nome].status], fillOpacity: 0.5 }).addTo(mapa);
  pol.bindTooltip(q.nome);
  pol.on('click', (e) => { L.DomEvent.stopPropagation(e); abrirPainel(q.nome); });
  camadas[q.nome] = pol;
  bounds.push(...q.pontos);
});
mapa.fitBounds(bounds);
mapa.on('click', fecharPainel);
setTimeout(() => {
  document.querySelectorAll('.leaflet-interactive').forEach(p => p.setAttribute('tabindex', '-1'));
}, 500);

function abrirPainel(nome) {
  quadraAtual = nome;
  const d = dados[nome];
  document.getElementById('painelTitulo').textContent = nome;
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
  localStorage.setItem('territorio', JSON.stringify(dados));
  camadas[quadraAtual].setStyle({ fillColor: CORES[dados[quadraAtual].status] });
  atualizarProgresso();
  aplicarFiltros();
  fecharPainel();
}

function atualizarProgresso() {
  const total = Object.keys(dados).length;
  const visitadas = Object.values(dados).filter(d => d.status === 'visitada').length;
  const pct = Math.round((visitadas / total) * 100);
  document.getElementById('textoProgresso').textContent = `${visitadas} de ${total} quadras visitadas — ${pct}% de cobertura`;
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
const SENHA_ADM = 'admin123'; // 🔑 altere aqui sua senha de administrador
document.getElementById('btnResetar').addEventListener('click', () => {
  const senha = prompt('🔒 Digite a senha de administrador:');
  if (senha !== SENHA_ADM) { alert('Senha incorreta. Acesso negado.'); return; }
  if (!confirm('Resetar tudo? Todas as quadras voltarão para PENDENTE e os dados (responsável, data, observações) serão apagados.')) return;
  QUADRAS.forEach(q => {
    dados[q.nome] = { status: 'pendente', responsavel: '', data: '', obs: '' };
    camadas[q.nome].setStyle({ fillColor: CORES['pendente'] });
  });
  localStorage.setItem('territorio', JSON.stringify(dados));
  atualizarProgresso();
  aplicarFiltros();
});

atualizarProgresso();
