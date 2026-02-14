const SUPABASE_URL = 'https://adozejfhxwtbyuczvzyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkb3plamZoeHd0Ynl1Y3p2enljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODgwNzIsImV4cCI6MjA4NjU2NDA3Mn0.yXccuiEV1sjZKHVJ4q-TuEuHDOsn7ywrus8RlA-o628';

let DADOS = {
    usuarios: [],
    horarios: [],
    atividades: [],
    notificacoes: [],
    solicitacoes: [],
    bloqueios: [],
    logs: []
};

let usuarioEncontrado = null;
let avaliadosCount = 0;
let currentPage = 1;
let itemsPerPage = 3;
let currentFilter = 'all';
let usuariosOnline = new Set();
let notificacoesNaoLidas = 0;
let paginaBloqueada = { coleta: false, avMensal: false };
let intervaloAtualizacao = null;
let aguardandoRedirecionamento = false;
const INTERVALO_ATUALIZACAO = 2000;

const HORARIOS = [
    '00h a 01h', '01h a 02h', '02h a 03h', '03h a 04h', '04h a 05h', '05h a 06h',
    '06h a 07h', '07h a 08h', '08h a 09h', '09h a 10h', '10h a 11h', '11h a 12h',
    '12h a 13h', '13h a 14h', '14h a 15h', '15h a 16h', '16h a 17h', '17h a 18h',
    '18h a 19h', '19h a 20h', '20h a 21h', '21h a 22h', '22h a 23h', '23h a 00h'
];

function getTurno(horario) {
    const hora = parseInt(horario.split('h')[0]);
    if (hora >= 0 && hora < 6) return 'madrugada';
    if (hora >= 6 && hora < 13) return 'manhã';
    if (hora >= 13 && hora < 18) return 'tarde';
    return 'noite';
}

function mostrarToast(titulo, mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    
    let icone = 'ph-info';
    if (tipo === 'success') icone = 'ph-check-circle';
    else if (tipo === 'error') icone = 'ph-x-circle';
    else if (tipo === 'warning') icone = 'ph-warning';
    
    toast.innerHTML = `
        <i class="ph ${icone}"></i>
        <div class="toast-content">
            <div class="toast-title">${titulo}</div>
            <div class="toast-message">${mensagem}</div>
        </div>
        <div class="toast-close" onclick="this.parentElement.remove()">×</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 5000);
}

async function pegarUsername() {
    try {
        let resposta = await fetch("/forum");
        let html = await resposta.text();
        let regex = /_userdata\["username"\]\s*=\s*"([^"]+)"/;
        let match = html.match(regex);
        if (match && match[1]) return match[1];
    } catch (err) {
        console.error('Erro ao pegar username:', err);
    }
    return ',youiz';
}

async function carregarDados() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY
            },
            cache: 'no-store'
        });

        if (response.ok) {
            const dadosArray = await response.json();
            if (dadosArray && dadosArray.length > 0) {
                DADOS = dadosArray[0].conteudo;
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        return false;
    }
}

async function salvarDados() {
    try {
        const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?select=id`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY
            }
        });

        if (!checkResponse.ok) return false;

        const registros = await checkResponse.json();

        if (registros && registros.length > 0) {
            const id = registros[0].id;
            await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conteudo: DADOS,
                    updated_at: new Date().toISOString()
                })
            });
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conteudo: DADOS
                })
            });
        }
        return true;
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
        return false;
    }
}

function verificarPermissaoAdmin() {
    return usuarioEncontrado && (usuarioEncontrado.cargo === 'Admin' || usuarioEncontrado.cargo === 'DEV');
}

function atualizarVisibilidadeAdmin() {
    const temPermissao = verificarPermissaoAdmin();
    const menuAdmin = document.getElementById('menu-admin');
    const drawerAdmin = document.getElementById('drawer-admin');
    if (menuAdmin) menuAdmin.style.display = temPermissao ? 'flex' : 'none';
    if (drawerAdmin) drawerAdmin.style.display = temPermissao ? 'flex' : 'none';
}

async function carregarLogs() {
    if (!verificarPermissaoAdmin()) return;
    
    const container = document.getElementById('log-container');
    if (!container) return;
    
    const logs = DADOS.logs || [];
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="log-item" style="color:#888; text-align:center;">Nenhum log encontrado.</div>';
        return;
    }
    
    container.innerHTML = logs.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 50).map(l => `
        <div class="log-item">
            <span class="log-data">${new Date(l.data).toLocaleString('pt-BR')}</span>
            <span class="log-tipo ${l.tipo || ''}">${l.tipo || 'sistema'}</span>
            <strong>${l.responsavel || 'Sistema'}</strong> - ${l.acao || 'Ação sem descrição'}
        </div>
    `).join('');
}

async function registrarLog(tipo, acao, responsavel, detalhes = {}) {
    if (!DADOS.logs) DADOS.logs = [];
    DADOS.logs.push({
        id: Date.now() + Math.random(),
        tipo,
        acao,
        responsavel,
        detalhes,
        data: new Date().toISOString()
    });
}

async function carregarHorarios() {
    const tbody = document.getElementById('coleta-table-body');
    if (!tbody) return;
    
    const horarios = DADOS.horarios || [];
    
    if (horarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #888; padding: 20px;">Nenhum horário registrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = horarios.map(h => {
        const horariosArray = h.horarios || [];
        const turnosArray = h.turnos || [];
        const turnosFormatados = turnosArray.join(' / ');
        const horariosFormatados = horariosArray.join(' / ');
        const infoExtra = `<span style="color: #888; font-size: 10px; margin-left: 8px;">${horariosArray.length}h • ${turnosArray.length}t</span>`;
        
        return `
            <tr>
                <td><strong>${h.nickname}</strong> ${infoExtra}</td>
                <td>${turnosFormatados || '-'}</td>
                <td>${horariosFormatados || '-'}</td>
            </tr>
        `;
    }).join('');
}

async function consultarHorario() {
    const nick = document.getElementById('consultar-nickname')?.value;
    if (!nick) {
        mostrarToast('Erro', 'Digite um nickname', 'error');
        return;
    }
    
    const horario = (DADOS.horarios || []).find(h => h.nickname.toLowerCase() === nick.toLowerCase());
    
    if (horario) {
        const horariosArray = horario.horarios || [];
        const turnosArray = horario.turnos || [];

        const horariosPorTurno = {};
        horariosArray.forEach(h => {
            const turno = getTurno(h);
            if (!horariosPorTurno[turno]) horariosPorTurno[turno] = [];
            horariosPorTurno[turno].push(h);
        });
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #242424;
            border-radius: 14px;
            padding: 13px;
            z-index: 10001;
            box-shadow: 0 0 30px rgba(0,0,0,0.5);
            min-width: 400px;
            max-width: 500px;
        `;
        
        const turnosList = Object.entries(horariosPorTurno).map(([turno, horariosDoTurno]) => {
            const turnoClass = `turno-${turno}`;
            const horariosStr = horariosDoTurno.join(' / ');
            
            return `
                <div style="margin: 15px 0; padding: 10px; background: #1b1b1b; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                        <span class="turno-badge ${turnoClass}" style="font-size: 12px; padding: 4px 11px;">${turno.toUpperCase()}</span>
                        <span style="color: #888; font-size: 11px;">${horariosDoTurno.length} horário(s)</span>
                    </div>
                    <div style="color: #fff; font-size: 12px;">
                        ${horariosStr}
                    </div>
                </div>
            `;
        }).join('');
        
        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <div>
                    <h3 style="color: #85e300; margin: 0; font-size: 18px;">${nick}</h3>
                    <span style="color: #888; font-size: 12px;">Última atualização: ${new Date(horario.data_atualizacao || horario.data_registro).toLocaleString('pt-BR')}</span>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #888; font-size: 24px; cursor: pointer;">×</button>
            </div>
            <div>
                ${turnosList}
            </div>
            <div style="margin-top: 20px; text-align: center; padding-top: 15px; border-top: 1px solid #333; background: #1b1b1b; border-radius: 8px; padding: 15px;">
                <div style="display: flex; justify-content: space-around; align-items: center;">
                    <div>
                        <span style="color: #85e300; font-size: 24px; font-weight: 700;">${horariosArray.length}</span>
                        <span style="color: #ccc; font-size: 12px; display: block;">Horários</span>
                    </div>
                    <div style="width: 1px; height: 30px; background: #333;"></div>
                    <div>
                        <span style="color: #85e300; font-size: 24px; font-weight: 700;">${turnosArray.length}</span>
                        <span style="color: #ccc; font-size: 12px; display: block;">Turnos</span>
                    </div>
                    <div style="width: 1px; height: 30px; background: #333;"></div>
                    <div>
                        <span style="color: #85e300; font-size: 14px; font-weight: 600;">${turnosArray.join(' / ')}</span>
                        <span style="color: #ccc; font-size: 12px; display: block;">Turnos</span>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        setTimeout(() => {
            document.addEventListener('click', function fechar(e) {
                if (!modal.contains(e.target)) {
                    modal.remove();
                    document.removeEventListener('click', fechar);
                }
            });
        }, 100);
        
    } else {
        mostrarToast('Não encontrado', `${nick} não possui horário registrado`, 'info');
    }
}

async function atualizarHorario() {
    const nick = document.getElementById('atualizar-nickname')?.value;
    const selecionados = document.querySelectorAll('.horario-btn.selected');
    
    if (!nick || selecionados.length === 0) {
        mostrarToast('Erro', 'Selecione pelo menos um horário', 'error');
        return;
    }
    
    try {
        const horariosSelecionados = [];
        const turnosEncontrados = new Set();
        
        for (const btn of selecionados) {
            const horario = btn.textContent;
            const turno = getTurno(horario);
            horariosSelecionados.push(horario);
            turnosEncontrados.add(turno);
        }

        const turnosArray = Array.from(turnosEncontrados);
        
        if (!DADOS.horarios) DADOS.horarios = [];
        
        const index = DADOS.horarios.findIndex(h => h.nickname.toLowerCase() === nick.toLowerCase());
        
        if (index !== -1) {
            DADOS.horarios[index] = {
                ...DADOS.horarios[index],
                horarios: horariosSelecionados,
                turnos: turnosArray,
                data_atualizacao: new Date().toISOString()
            };
        } else {
            DADOS.horarios.push({
                nickname: nick,
                horarios: horariosSelecionados,
                turnos: turnosArray,
                data_registro: new Date().toISOString(),
                data_atualizacao: new Date().toISOString()
            });
        }

        await registrarLog('horario', 'atualizacao_horario', usuarioEncontrado.nickname, { 
            alvo: nick, 
            horarios: horariosSelecionados,
            turnos: turnosArray
        });
        
        mostrarToast('Sucesso', `${horariosSelecionados.length} horário(s) em ${turnosArray.length} turno(s) atualizado(s)`, 'success');
        document.getElementById('data-alteracao').value = new Date().toLocaleString('pt-BR');

        document.querySelectorAll('.horario-btn.selected').forEach(b => b.classList.remove('selected'));
        
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro', 'Erro ao atualizar horário', 'error');
    }
}

function initHorariosGrid() {
    const container = document.getElementById('horarios-grid-container');
    if (!container) return;

    if (usuarioEncontrado && usuarioEncontrado.nickname) {
        const nickInput = document.getElementById('atualizar-nickname');
        if (nickInput) {
            nickInput.value = usuarioEncontrado.nickname;
            nickInput.readOnly = true;
            nickInput.style.background = '#333';
            nickInput.style.cursor = 'not-allowed';
        }
    }
    
    container.innerHTML = HORARIOS.map(h => `
        <button class="horario-btn" onclick="toggleHorario(this)">${h}</button>
    `).join('');
}

async function initLogin() {
    const overlay = document.getElementById('login-overlay');
    const loading = document.getElementById('login-loading');
    const content = document.getElementById('login-content');
    if (!overlay) return;
    
    await carregarDados();
    
    loading.style.display = 'block';
    content.style.display = 'none';
    
    const nick = await pegarUsername();
    if (!nick) {
        mostrarMensagem('error', 'Não foi possível identificar seu usuário do fórum.');
        loading.style.display = 'none';
        content.style.display = 'block';
        return;
    }
    
    const avatarUrl = `https://www.habbo.com.br/habbo-imaging/avatarimage?&user=${nick}&action=std&direction=2&head_direction=3&img_format=png&gesture=sml&headonly=0&size=l`;
    const loginAvatar = document.getElementById('login-avatar');
    const solicitacaoAvatar = document.getElementById('solicitacao-avatar');
    const loginNick = document.getElementById('login-nick');
    const solicitacaoNick = document.getElementById('solicitacao-nick');
    
    if (loginAvatar) loginAvatar.src = avatarUrl;
    if (solicitacaoAvatar) solicitacaoAvatar.src = avatarUrl;
    if (loginNick) loginNick.textContent = nick;
    if (solicitacaoNick) solicitacaoNick.textContent = nick;
    
    const usuario = DADOS.usuarios?.find(u => u.nickname?.toLowerCase() === nick.toLowerCase());
    usuarioEncontrado = usuario;
    
    if (usuario) {
        if (usuario.status === 'aprovado') {
            document.getElementById('login-usuario-encontrado').style.display = 'block';
            document.getElementById('login-solicitacao').style.display = 'none';
            if (usuario.cargo_executivo) {
                document.getElementById('login-cargo-executivo').value = usuario.cargo_executivo;
            }
            document.getElementById('login-btn-confirmar').disabled = false;
        } else if (usuario.status === 'pendente') {
            mostrarMensagem('info', 'Aguarde enquanto não é aceito.');
            document.getElementById('login-usuario-encontrado').style.display = 'none';
            document.getElementById('login-solicitacao').style.display = 'block';
            const btn = document.getElementById('btn-solicitar');
            btn.disabled = true;
            btn.textContent = 'Aguardando aprovação';
            document.getElementById('motivo-solicitacao').disabled = true;
        } else if (usuario.status === 'rejeitado') {
            const solicitacao = DADOS.solicitacoes?.find(s => s.nickname === nick && s.status === 'rejeitada');
            const justificativa = solicitacao?.justificativa || 'não informado';
            
            mostrarMensagem('error', `Acesso negado. Motivo: ${justificativa}. Aguarde 3s...`);
            document.getElementById('login-usuario-encontrado').style.display = 'none';
            document.getElementById('login-solicitacao').style.display = 'block';
            
            setTimeout(() => {
                document.getElementById('btn-solicitar').disabled = false;
                document.getElementById('btn-solicitar').textContent = 'Solicitar Acesso';
                document.getElementById('motivo-solicitacao').disabled = false;
                mostrarMensagem('info', 'Você pode solicitar acesso novamente.');
            }, 3000);
        }
    } else {
        document.getElementById('login-usuario-encontrado').style.display = 'none';
        document.getElementById('login-solicitacao').style.display = 'block';
        document.getElementById('btn-solicitar').disabled = false;
        document.getElementById('btn-solicitar').textContent = 'Solicitar Acesso';
        document.getElementById('motivo-solicitacao').disabled = false;
        mostrarMensagem('info', 'Usuário não encontrado. Solicite acesso.');
    }
    loading.style.display = 'none';
    content.style.display = 'block';
}

async function confirmarLogin() {
    if (!usuarioEncontrado) return;
    
    const cargoExecutivo = document.getElementById('login-cargo-executivo')?.value;
    if (!cargoExecutivo) {
        mostrarMensagem('error', 'Selecione seu cargo executivo');
        return;
    }
    
    const index = DADOS.usuarios.findIndex(u => u.nickname === usuarioEncontrado.nickname);
    if (index !== -1) {
        DADOS.usuarios[index].cargo_executivo = cargoExecutivo;
        usuarioEncontrado.cargo_executivo = cargoExecutivo;
    }
    
    sessionStorage.setItem('usuario', JSON.stringify({
        nickname: usuarioEncontrado.nickname,
        cargo: usuarioEncontrado.cargo,
        cargo_executivo: cargoExecutivo,
        avatar: document.getElementById('login-avatar')?.src || ''
    }));
    
    await registrarLog('login', 'login', usuarioEncontrado.nickname, { cargo: usuarioEncontrado.cargo, cargo_executivo: cargoExecutivo });
    await salvarDados();
    
    mostrarToast('Acesso liberado!', 'Redirecionando em 3 segundos...', 'success');
    
    setTimeout(() => {
        document.getElementById('login-overlay').classList.add('hidden');
        
        const headerAvatar = document.getElementById('header-profile-avatar');
        const headerName = document.getElementById('header-profile-name');
        const headerRole = document.getElementById('header-profile-role');
        if (headerAvatar) headerAvatar.src = document.getElementById('login-avatar')?.src || '';
        if (headerName) headerName.textContent = usuarioEncontrado.nickname;
        if (headerRole) headerRole.textContent = usuarioEncontrado.cargo;
        
        const sidebarName = document.getElementById('profile-sidebar-name');
        const sidebarImg = document.getElementById('profile-sidebar-img');
        if (sidebarName) sidebarName.textContent = usuarioEncontrado.nickname;
        if (sidebarImg) sidebarImg.src = document.getElementById('login-avatar')?.src || '';
        
        const profileNick = document.getElementById('profile-nickname');
        const profileCargoExecutivo = document.getElementById('profile-cargo-executivo');
        const profileCargoTag = document.getElementById('profile-cargo-tag');
        const profileAvatar = document.getElementById('profile-avatar-img');
        if (profileNick) profileNick.textContent = usuarioEncontrado.nickname;
        if (profileCargoExecutivo) profileCargoExecutivo.textContent = cargoExecutivo;
        if (profileCargoTag) {
            if (usuarioEncontrado.cargo === 'Admin') profileCargoTag.textContent = 'ADMIN';
            else if (usuarioEncontrado.cargo === 'DEV') profileCargoTag.textContent = 'DEV';
            else if (usuarioEncontrado.cargo === 'Membro') profileCargoTag.textContent = 'MEMBRO';
            else profileCargoTag.style.display = 'none';
        }
        if (profileAvatar) profileAvatar.src = document.getElementById('login-avatar')?.src || '';
        
        const drawerAvatar = document.getElementById('drawer-avatar-img');
        const drawerName = document.getElementById('drawer-name');
        const drawerRole = document.getElementById('drawer-role');
        if (drawerAvatar) drawerAvatar.src = document.getElementById('login-avatar')?.src || '';
        if (drawerName) drawerName.textContent = usuarioEncontrado.nickname;
        if (drawerRole) drawerRole.textContent = usuarioEncontrado.cargo;
        
        const avAvaliador = document.getElementById('av-avaliador');
        if (avAvaliador) avAvaliador.value = usuarioEncontrado.nickname;
        const sindicanteNick = document.getElementById('sindicante-nick');
        if (sindicanteNick) sindicanteNick.value = usuarioEncontrado.nickname;
        const ouvAutor = document.getElementById('ouv-autor');
        if (ouvAutor) ouvAutor.value = usuarioEncontrado.nickname;
        
        usuariosOnline.add(usuarioEncontrado.nickname);
        atualizarVisibilidadeAdmin();
        carregarAtividades();
        carregarNotificacoes();
        carregarBloqueios();
        carregarHorarios();
        iniciarAtualizacaoEmTempoReal();
        mostrarToast('Bem-vindo', `Login realizado como ${usuarioEncontrado.nickname}`, 'success');
    }, 3000);
}

function iniciarAtualizacaoEmTempoReal() {
    if (intervaloAtualizacao) clearInterval(intervaloAtualizacao);
    intervaloAtualizacao = setInterval(verificarAtualizacoesEmTempoReal, INTERVALO_ATUALIZACAO);
}

async function verificarAtualizacoesEmTempoReal() {
    try {
        const dadosAntigos = JSON.stringify(DADOS);
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY
            },
            cache: 'no-store'
        });

        if (response.ok) {
            const dadosArray = await response.json();
            if (dadosArray && dadosArray.length > 0) {
                const novosDados = dadosArray[0].conteudo;
                const novosDadosString = JSON.stringify(novosDados);
                
                if (dadosAntigos !== novosDadosString) {
                    const DADOS_ANTIGOS = { ...DADOS };
                    DADOS = novosDados;
                    
                    if (usuarioEncontrado) {
                        const usuarioAtualizado = DADOS.usuarios?.find(u => u.nickname === usuarioEncontrado.nickname);
                        
                        if (usuarioAtualizado && usuarioAtualizado.status === 'aprovado' && usuarioEncontrado.status !== 'aprovado' && !aguardandoRedirecionamento) {
                            aguardandoRedirecionamento = true;
                            mostrarToast('Acesso aprovado!', 'Redirecionando em 3 segundos...', 'success');
                            
                            setTimeout(() => {
                                location.reload();
                            }, 3000);
                        }
                        
                        if (usuarioAtualizado) {
                            usuarioEncontrado = usuarioAtualizado;
                        }
                    }
                    
                    carregarHorarios();
                    carregarAtividades();
                    carregarNotificacoes();
                    carregarBloqueios();
                    carregarLogs();
                    
                    if (verificarPermissaoAdmin()) {
                        carregarSolicitacoes();
                        carregarMembros();
                    }
                    
                    atualizarBadgeNotificacoes();
                    
                    const novasNotificacoes = (DADOS.notificacoes || []).filter(n => 
                        n.usuario_nick === usuarioEncontrado?.nickname && 
                        !(DADOS_ANTIGOS.notificacoes || []).some(old => old.id === n.id)
                    );
                    
                    novasNotificacoes.forEach(n => {
                        if (n.titulo.includes('Atividade')) {
                            mostrarToast(n.titulo, n.mensagem, n.tipo);
                        }
                        if (n.titulo.includes('página') || n.mensagem.includes('página')) {
                            mostrarToast(n.titulo, n.mensagem, n.tipo);
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error('Erro na atualização em tempo real:', error);
    }
}

async function carregarBloqueios() {
    const bloqueios = DADOS.bloqueios || [];
    bloqueios.forEach(b => {
        if (b.pagina === 'coleta') {
            paginaBloqueada.coleta = b.bloqueado;
            const toggle = document.getElementById('toggle-coleta');
            if (toggle) toggle.checked = !b.bloqueado;
        } else if (b.pagina === 'av-mensal') {
            paginaBloqueada.avMensal = b.bloqueado;
            const toggle = document.getElementById('toggle-av-mensal');
            if (toggle) toggle.checked = !b.bloqueado;
        }
    });
}

function mostrarMensagem(tipo, texto) {
    const msg = document.getElementById('login-message');
    if (!msg) return;
    msg.className = `login-message ${tipo}`;
    msg.textContent = texto;
    msg.style.display = 'block';
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageId}`);
    if (page) page.classList.add('active');
    
    const titles = {
        'home': '[CE] SYSTEM', 'profile': 'MEU PERFIL', 'coleta-horarios': 'COLETA DE HORÁRIOS',
        'form-av-mensal': 'FORMULÁRIO AV MENSAL', 'registro-avs': 'REGISTRO DAS AVs',
        'sindicancias': 'CENTRAL DE SINDICÂNCIAS', 'atividades': 'ATIVIDADES',
        'ouvidoria': 'OUVIDORIA', 'admin': 'PAINEL ADMINISTRATIVO'
    };
    
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = titles[pageId] || '[CE] SYSTEM';
    
    if (!verificarBloqueioPagina(pageId)) {
        if (pageId === 'admin' && verificarPermissaoAdmin()) {
            carregarSolicitacoes();
            carregarMembros();
            carregarLogs();
            carregarDiasSelect();
        }
        if (pageId === 'atividades') carregarAtividades();
        if (pageId === 'coleta-horarios') {
            carregarHorarios();
            initHorariosGrid();
        }
    }
    closeDrawer();
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
}

function verificarBloqueioPagina(pageId) {
    const page = document.getElementById(`page-${pageId}`);
    if (!page) return false;
    
    if (pageId === 'coleta-horarios' && paginaBloqueada.coleta) {
        mostrarPaginaBloqueada(page, 'atualizar/consultar seus horários');
        return true;
    } else if (pageId === 'form-av-mensal' && paginaBloqueada.avMensal) {
        mostrarPaginaBloqueada(page, 'avaliar os executivos');
        return true;
    }
    return false;
}

function mostrarPaginaBloqueada(page, acao) {
    page.innerHTML = `
        <div class="page-blocked">
            <div class="blocked-message">
                <i class="ph ph-lock"></i>
                <h3>Ação bloqueada</h3>
                <p>Aguarde a próxima abertura para ${acao}</p>
                <p style="margin-top: 15px; font-size: 12px;">Se algum erro acontecer, comunique um administrador.</p>
            </div>
        </div>
    `;
}

function openDrawer() {
    document.getElementById('side-drawer').classList.add('active');
    document.getElementById('drawer-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDrawer() {
    document.getElementById('side-drawer').classList.remove('active');
    document.getElementById('drawer-overlay').classList.remove('active');
    document.body.style.overflow = '';
}

function switchColetaTab(tab) {
    document.querySelectorAll('.coleta-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.coleta-form').forEach(f => f.classList.remove('active'));
    if (tab === 'consultar') {
        document.querySelector('.coleta-tab:first-child')?.classList.add('active');
        document.getElementById('coleta-form-consultar')?.classList.add('active');
    } else {
        document.querySelector('.coleta-tab:last-child')?.classList.add('active');
        document.getElementById('coleta-form-atualizar')?.classList.add('active');
    }
}

function toggleHorario(btn) {
    btn.classList.toggle('selected');
}

function adicionarAvaliado() {
    if (avaliadosCount >= 10) {
        mostrarToast('Limite atingido', 'Máximo de 10 avaliados por formulário', 'warning');
        return;
    }
    avaliadosCount++;
    const container = document.getElementById('avaliados-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'avaliado-row';
    row.id = `avaliado-${avaliadosCount}`;
    row.innerHTML = `
        <input type="text" placeholder="Nick do Avaliado ${avaliadosCount}">
        <input type="text" placeholder="Nota">
        <textarea placeholder="Campo de avaliação..."></textarea>
        <button type="button" class="btn-remove-avaliado" onclick="removerAvaliado(${avaliadosCount})"><i class="ph ph-trash"></i></button>
    `;
    container.appendChild(row);
}

function removerAvaliado(id) {
    const row = document.getElementById(`avaliado-${id}`);
    if (row) {
        row.remove();
        const rows = document.querySelectorAll('.avaliado-row');
        avaliadosCount = rows.length;
        rows.forEach((r, index) => {
            const newId = index + 1;
            r.id = `avaliado-${newId}`;
            const btn = r.querySelector('.btn-remove-avaliado');
            if (btn) btn.setAttribute('onclick', `removerAvaliado(${newId})`);
            const input = r.querySelector('input[type="text"]');
            if (input) input.placeholder = `Nick do Avaliado ${newId}`;
        });
    }
}

function handleAvMensalSubmit(e) {
    e.preventDefault();
    const avaliador = document.getElementById('av-avaliador')?.value;
    const mes = document.getElementById('av-mes')?.value;
    const avaliados = [];
    document.querySelectorAll('.avaliado-row').forEach(row => {
        const inputs = row.querySelectorAll('input, textarea');
        if (inputs.length >= 3) {
            avaliados.push({ nick: inputs[0].value, nota: inputs[1].value, avaliacao: inputs[2].value });
        }
    });
    mostrarToast('Avaliação enviada', `Avaliação mensal de ${avaliados.length} executivos registrada`, 'success');
}

function switchSindicanciaTab(tab) {
    document.querySelectorAll('.sindicancia-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sindicancia-form').forEach(f => f.classList.remove('active'));
    const forms = document.getElementById(`sindicancia-form-${tab}`);
    const tabs = document.querySelectorAll('.sindicancia-tab');
    const tabIndex = ['avaliacao-mensal', 'avanco-indeferida', 'regresso-especializacao'].indexOf(tab);
    if (tabs[tabIndex]) tabs[tabIndex].classList.add('active');
    if (forms) forms.classList.add('active');
}

function enviarSindicancia(tipo) {
    mostrarToast('Sindicância enviada', `Sindicância de ${tipo} registrada com sucesso`, 'success');
}

function handleOuvidoriaSubmit(e) {
    e.preventDefault();
    mostrarToast('Proposta enviada', 'Sua proposta foi registrada na ouvidoria', 'success');
    document.getElementById('ouv-sintese').value = '';
    document.getElementById('ouv-desenvolvimento').value = '';
    document.querySelectorAll('#checkbox-group-container input').forEach(cb => cb.checked = false);
}

function setFilter(filter) {
    currentFilter = filter;
    currentPage = 1;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) btn.classList.add('active');
    });
    updateContentList();
    updatePagination();
}

function updateContentList() {
    const container = document.getElementById('content-list');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="ph ph-folder-open"></i><p>Nenhum conteúdo encontrado.</p></div>`;
}

function updatePagination() {
    const currentPageEl = document.getElementById('current-page');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (currentPageEl) currentPageEl.textContent = String(currentPage).padStart(2, '0');
    if (btnPrev) btnPrev.disabled = currentPage === 1;
    if (btnNext) btnNext.disabled = currentPage >= 1;
}

function changePage(direction) {
    const newPage = currentPage + direction;
    if (newPage >= 1) {
        currentPage = newPage;
        updateContentList();
        updatePagination();
    }
}

async function carregarSolicitacoes() {
    if (!verificarPermissaoAdmin()) return;
    
    const container = document.getElementById('admin-solicitacoes');
    if (!container) return;
    
    const solicitacoes = (DADOS.solicitacoes || []).filter(s => s.status === 'pendente');
    
    if (solicitacoes.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center;">Nenhuma solicitação pendente.</p>';
        return;
    }
    
    container.innerHTML = solicitacoes.sort((a, b) => new Date(b.data_solicitacao) - new Date(a.data_solicitacao)).map(s => `
        <div class="solicitacao-card" style="padding: 10px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #85e300; font-weight: 600;">${s.nickname}</span>
                <span style="font-size: 10px; color: #888;">${new Date(s.data_solicitacao).toLocaleString('pt-BR')}</span>
            </div>
            <div style="font-size: 11px; margin: 5px 0;">${s.motivo || 'Não informado'}</div>
            <div style="display: flex; gap: 5px;">
                <button class="btn-aprovar" style="padding: 5px 10px; font-size: 11px;" onclick="processarSolicitacao('${s.nickname}', 'aprovada')">Aprovar</button>
                <button class="btn-rejeitar" style="padding: 5px 10px; font-size: 11px;" onclick="processarSolicitacao('${s.nickname}', 'rejeitada')">Rejeitar</button>
            </div>
        </div>
    `).join('');
}

async function processarSolicitacao(nick, status) {
    if (!verificarPermissaoAdmin()) return;
    
    let justificativa = '';
    if (status === 'rejeitada') {
        justificativa = prompt('Digite o motivo da rejeição:');
        if (!justificativa) {
            mostrarToast('Cancelado', 'É necessário informar um motivo para rejeitar', 'warning');
            return;
        }
    }
    
    const solicitacaoIndex = DADOS.solicitacoes?.findIndex(s => s.nickname === nick && s.status === 'pendente');
    if (solicitacaoIndex !== -1) {
        DADOS.solicitacoes[solicitacaoIndex].status = status;
        DADOS.solicitacoes[solicitacaoIndex].justificativa = justificativa;
        DADOS.solicitacoes[solicitacaoIndex].processado_por = usuarioEncontrado.nickname;
        DADOS.solicitacoes[solicitacaoIndex].data_processamento = new Date().toISOString();
    }
    
    const usuarioIndex = DADOS.usuarios?.findIndex(u => u.nickname === nick);
    if (usuarioIndex !== -1) {
        DADOS.usuarios[usuarioIndex].status = status === 'aprovada' ? 'aprovado' : 'rejeitado';
    }
    
    await registrarLog('usuario', `solicitacao_${status}`, usuarioEncontrado.nickname, { alvo: nick, justificativa });
    
    if (!DADOS.notificacoes) DADOS.notificacoes = [];
    DADOS.notificacoes.push({
        id: Date.now() + Math.random(),
        usuario_nick: nick,
        titulo: status === 'aprovada' ? 'Acesso aprovado' : 'Acesso negado',
        mensagem: status === 'aprovada' ? 'Sua solicitação de acesso foi aprovada. Faça login novamente.' : `Sua solicitação de acesso foi negada. Motivos: ${justificativa}`,
        tipo: status === 'aprovada' ? 'success' : 'error',
        lida: false,
        data_criacao: new Date().toISOString()
    });
    
    await salvarDados();
    
    mostrarToast('Solicitação processada', `Acesso ${status === 'aprovada' ? 'aprovado' : 'rejeitado'} para ${nick}`, 'success');
}

async function criarNotificacao(usuarioNick, titulo, mensagem, tipo = 'info') {
    if (!DADOS.notificacoes) DADOS.notificacoes = [];
    DADOS.notificacoes.push({
        id: Date.now() + Math.random(),
        usuario_nick: usuarioNick,
        titulo: titulo,
        mensagem: mensagem,
        tipo: tipo,
        lida: false,
        data_criacao: new Date().toISOString()
    });
    
    await salvarDados();
    
    if (usuarioNick === usuarioEncontrado?.nickname) {
        carregarNotificacoes();
        mostrarToast(titulo, mensagem, tipo);
    }
}

async function carregarNotificacoes() {
    if (!usuarioEncontrado?.nickname) return;
    
    const notificacoes = (DADOS.notificacoes || []).filter(n => n.usuario_nick === usuarioEncontrado.nickname);
    
    notificacoesNaoLidas = notificacoes.filter(n => !n.lida).length;
    renderNotificacoes(notificacoes);
    atualizarBadgeNotificacoes();
}

async function marcarNotificacaoLida(id) {
    const index = DADOS.notificacoes?.findIndex(n => n.id === id);
    if (index !== -1) {
        DADOS.notificacoes[index].lida = true;
        DADOS.notificacoes[index].data_leitura = new Date().toISOString();
        await salvarDados();
        carregarNotificacoes();
    }
}

async function deletarNotificacao(id) {
    if (DADOS.notificacoes) {
        DADOS.notificacoes = DADOS.notificacoes.filter(n => n.id !== id);
        await salvarDados();
        carregarNotificacoes();
        mostrarToast('Apagada', 'Mensagem excluída com sucesso', 'success');
    }
}

async function marcarTodasLidas() {
    if (DADOS.notificacoes) {
        let mudou = false;
        DADOS.notificacoes.forEach(n => {
            if (!n.lida && n.usuario_nick === usuarioEncontrado?.nickname) {
                n.lida = true;
                n.data_leitura = new Date().toISOString();
                mudou = true;
            }
        });
        if (mudou) {
            await salvarDados();
            carregarNotificacoes();
        }
        mostrarToast('Notificações', 'As notificações foram marcadas como lidas', 'success');
    }
}

async function carregarMembros() {
    if (!verificarPermissaoAdmin()) return;
    
    const tbody = document.getElementById('membros-tbody');
    if (!tbody) return;
    
    const membros = DADOS.usuarios || [];
    
    tbody.innerHTML = membros.map(m => `
        <tr>
            <td><span class="online-indicator ${usuariosOnline.has(m.nickname) ? 'online' : 'offline'}"></span></td>
            <td>${m.nickname}</td>
            <td>
                <select class="cargo-select" onchange="alterarCargo('${m.nickname}', this.value)" style="font-size: 11px; padding: 3px;">
                    <option value="Membro" ${m.cargo === 'Membro' ? 'selected' : ''}>Membro</option>
                    <option value="Admin" ${m.cargo === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="DEV" ${m.cargo === 'DEV' ? 'selected' : ''}>DEV</option>
                </select>
            </td>
            <td><button class="btn-remove-avaliado" style="padding: 3px 6px; font-size: 10px;" onclick="removerUsuario('${m.nickname}')"><i class="ph ph-trash"></i></button></td>
        </tr>
    `).join('');
}

async function alterarCargo(nickname, novoCargo) {
    if (!verificarPermissaoAdmin()) return;
    
    const index = DADOS.usuarios?.findIndex(u => u.nickname === nickname);
    if (index !== -1) {
        DADOS.usuarios[index].cargo = novoCargo;
        await registrarLog('usuario', 'alteracao_cargo', usuarioEncontrado.nickname, { alvo: nickname, novoCargo });
        await salvarDados();
        mostrarToast('Cargo alterado', `${nickname} agora é ${novoCargo}`, 'success');
        atualizarVisibilidadeAdmin();
    }
}

async function removerUsuario(nickname) {
    if (!verificarPermissaoAdmin()) return;
    if (!confirm(`Tem certeza que deseja remover o usuário ${nickname}?`)) return;
    
    if (DADOS.usuarios) {
        DADOS.usuarios = DADOS.usuarios.filter(u => u.nickname !== nickname);
        await registrarLog('usuario', 'remocao_usuario', usuarioEncontrado.nickname, { alvo: nickname });
        await salvarDados();
        mostrarToast('Usuário removido', `${nickname} foi removido do sistema`, 'success');
    }
}

function carregarDiasSelect() {
    const select = document.getElementById('atividade-dia');
    if (!select) return;
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    let options = '';
    for (let dia = 1; dia <= ultimoDia; dia++) {
        const data = new Date(ano, mes, dia);
        const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'short' });
        options += `<option value="${dia}">${dia} - ${diaSemana}</option>`;
    }
    select.innerHTML = options;
}

async function carregarAtividades() {
    const atividades = DADOS.atividades || [];
    
    const agora = new Date();
    atividades.forEach(a => {
        const dataAtividade = new Date(`${a.data}T${a.hora}`);
        if (agora > dataAtividade) {
            a.status = 'concluido';
        } else if (agora.toDateString() === dataAtividade.toDateString() && agora <= dataAtividade) {
            a.status = 'em_andamento';
        } else {
            a.status = 'pendente';
        }
    });
    
    const titulo = document.getElementById('calendario-titulo');
    if (titulo) {
        const hoje = new Date();
        titulo.textContent = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    }
    
    const calendarGrid = document.getElementById('calendar-grid');
    if (calendarGrid) {
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        let calendarHTML = diasSemana.map(d => `<div class="calendar-day-header">${d}</div>`).join('');
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = hoje.getMonth();
        const primeiroDia = new Date(ano, mes, 1).getDay();
        const ultimoDia = new Date(ano, mes + 1, 0).getDate();
        
        for (let i = 0; i < primeiroDia; i++) {
            calendarHTML += `<div class="calendar-day"></div>`;
        }
        
        for (let dia = 1; dia <= ultimoDia; dia++) {
            const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const temAtividade = atividades.some(a => a.data === dataStr);
            const isToday = dia === hoje.getDate() ? 'today' : '';
            calendarHTML += `<div class="calendar-day ${temAtividade ? 'has-event' : ''} ${isToday}">${dia}</div>`;
        }
        calendarGrid.innerHTML = calendarHTML;
    }
    
    const eventList = document.getElementById('event-list');
    if (eventList) {
        const eventosOrdenados = [...atividades].sort((a, b) => new Date(b.data + 'T' + b.hora) - new Date(a.data + 'T' + a.hora));
        
        eventList.innerHTML = eventosOrdenados.map(e => {
            let statusClass = '';
            let statusTexto = e.status;
            if (e.status === 'pendente') { statusClass = 'status-pendente'; statusTexto = 'Pendente'; }
            else if (e.status === 'em_andamento') { statusClass = 'status-em_andamento'; statusTexto = 'Em Andamento'; }
            else if (e.status === 'concluido') { statusClass = 'status-concluido'; statusTexto = 'Concluído'; }
            
            const dataHora = new Date(e.data + 'T' + e.hora);
            const dataFormatada = dataHora.toLocaleDateString('pt-BR');
            const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="event-item">
                    <div class="event-date"><strong>${dataFormatada} - ${horaFormatada}</strong></div>
                    <div class="event-title">${e.titulo}</div>
                    ${e.descricao ? `<div style="font-size:12px; color:#ccc; margin: 5px 0;">${e.descricao}</div>` : ''}
                    <div class="event-meta">
                        <span class="status-badge ${statusClass}">${statusTexto}</span>
                        <span>Por: ${e.criado_por || 'Sistema'}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        if (eventosOrdenados.length === 0) {
            eventList.innerHTML = '<div class="empty-state" style="padding: 20px;"><i class="ph ph-calendar-blank"></i><p>Nenhuma atividade encontrada.</p></div>';
        }
    }
    
    const proximas = document.getElementById('proximas-atividades');
    if (proximas) {
        const agora = new Date();
        const proximasAtividades = atividades.filter(a => new Date(`${a.data}T${a.hora}`) > agora).slice(0, 5);
        proximas.innerHTML = proximasAtividades.map(a => {
            const dataHora = new Date(a.data + 'T' + a.hora);
            const dataFormatada = dataHora.toLocaleDateString('pt-BR');
            const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="atividade-item">
                    <div class="header">
                        <span class="titulo">${a.titulo}</span>
                        <span class="data-hora">${dataFormatada} ${horaFormatada}</span>
                    </div>
                    ${a.descricao ? `<div style="font-size:10px; color:#aaa;">${a.descricao.substring(0, 30)}${a.descricao.length > 30 ? '...' : ''}</div>` : ''}
                    <div class="status"><span class="status-indicator ${a.status}">${a.status.replace('_', ' ')}</span></div>
                </div>
            `;
        }).join('') || '<p style="color: #888; font-size: 12px;">Nenhuma atividade futura.</p>';
    }
    
    atualizarEstatisticas(atividades);
}

function atualizarEstatisticas(atividades) {
    const total = atividades.length;
    const pendentes = atividades.filter(a => a.status === 'pendente').length;
    const andamento = atividades.filter(a => a.status === 'em_andamento').length;
    const concluidas = atividades.filter(a => a.status === 'concluido').length;
    document.getElementById('stat-total-atividades').textContent = total;
    document.getElementById('stat-pendentes').textContent = pendentes;
    document.getElementById('stat-andamento').textContent = andamento;
    document.getElementById('stat-concluidas').textContent = concluidas;
}

async function marcarAtividade() {
    if (!verificarPermissaoAdmin()) {
        mostrarToast('Acesso negado', 'Apenas administradores podem criar atividades', 'error');
        return;
    }
    
    const dia = document.getElementById('atividade-dia')?.value;
    const hora = document.getElementById('atividade-hora')?.value;
    const titulo = document.getElementById('atividade-titulo')?.value.trim();
    const descricao = document.getElementById('atividade-descricao')?.value.trim();

    if (!titulo || !hora || !dia) {
        mostrarToast('Campos obrigatórios', 'Preencha título, dia e hora da atividade', 'warning');
        return;
    }

    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();

    const dataObj = new Date(ano, mes, dia);
    const anoStr = dataObj.getFullYear();
    const mesStr = String(dataObj.getMonth() + 1).padStart(2, '0');
    const diaStr = String(dataObj.getDate()).padStart(2, '0');
    const dataFormatada = `${anoStr}-${mesStr}-${diaStr}`;

    if (!DADOS.atividades) DADOS.atividades = [];
    
    const novaAtividade = {
        id: Date.now() + Math.random(),
        titulo: titulo,
        descricao: descricao || '',
        data: dataFormatada,
        hora: hora,
        status: 'pendente',
        criado_por: usuarioEncontrado.nickname
    };
    
    DADOS.atividades.push(novaAtividade);

    await registrarLog('atividade', 'criacao_atividade', usuarioEncontrado.nickname, novaAtividade);

    if (DADOS.usuarios && Array.isArray(DADOS.usuarios)) {
        if (!DADOS.notificacoes) DADOS.notificacoes = [];
        
        for (const u of DADOS.usuarios) {
            DADOS.notificacoes.push({
                id: Date.now() + Math.random(),
                usuario_nick: u.nickname,
                titulo: 'Nova Atividade',
                mensagem: `${usuarioEncontrado.nickname} marcou uma atividade: ${titulo} para ${dataFormatada} às ${hora}`,
                tipo: 'info',
                lida: false,
                data_criacao: new Date().toISOString()
            });
        }
    }

    document.getElementById('atividade-titulo').value = '';
    document.getElementById('atividade-descricao').value = '';

    mostrarToast('Atividade criada', 'Atividade marcada com sucesso no calendário', 'success');
}

async function togglePagina(pagina) {
    if (!verificarPermissaoAdmin()) {
        mostrarToast('Acesso negado', 'Apenas administradores podem bloquear páginas', 'error');
        return;
    }
    
    const toggle = document.getElementById(`toggle-${pagina}`);
    const status = toggle.checked ? 'liberado' : 'bloqueado';
    const bloqueado = !toggle.checked;
    
    if (!DADOS.bloqueios) DADOS.bloqueios = [];
    
    const index = DADOS.bloqueios.findIndex(b => b.pagina === pagina);
    
    if (index !== -1) {
        DADOS.bloqueios[index].bloqueado = bloqueado;
        DADOS.bloqueios[index].atualizado_em = new Date().toISOString();
    } else {
        DADOS.bloqueios.push({
            pagina: pagina,
            bloqueado: bloqueado,
            atualizado_em: new Date().toISOString()
        });
    }
    
    if (pagina === 'coleta') {
        paginaBloqueada.coleta = bloqueado;
    } else if (pagina === 'av-mensal') {
        paginaBloqueada.avMensal = bloqueado;
    }
    
    await registrarLog('pagina', `${pagina}_${status}`, usuarioEncontrado.nickname, {});
    
    if (DADOS.usuarios && Array.isArray(DADOS.usuarios)) {
        if (!DADOS.notificacoes) DADOS.notificacoes = [];
        
        const nomePagina = pagina === 'coleta' ? 'Coleta de horários' : 'Avaliação mensal';
        for (const u of DADOS.usuarios) {
            DADOS.notificacoes.push({
                id: Date.now() + Math.random(),
                usuario_nick: u.nickname,
                titulo: 'Atualização',
                mensagem: `A página ${nomePagina} foi ${status}.`,
                tipo: 'info',
                lida: false,
                data_criacao: new Date().toISOString()
            });
        }
    }
    
    const pageAtual = document.querySelector('.page.active')?.id;
    if (pageAtual) verificarBloqueioPagina(pageAtual.replace('page-', ''));
    
    mostrarToast('Atualização', `Página ${nomePagina} ${status}`, 'success');
}

function toggleNotificacoes() {
    document.getElementById('notif-dropdown').classList.toggle('show');
}

function renderNotificacoes(notificacoes) {
    const list = document.getElementById('notif-list');
    if (!list) return;
    
    if (notificacoes.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Nenhuma notificação</div>';
        return;
    }
    
    list.innerHTML = notificacoes.sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao)).map(n => `
        <div class="notif-item ${!n.lida ? 'unread' : ''}" onclick="marcarNotificacaoLida(${n.id})">
            <div class="notif-titulo">${n.titulo}</div>
            <div class="notif-texto">${n.mensagem}</div>
            <div class="notif-data">${new Date(n.data_criacao).toLocaleString('pt-BR')}</div>
            <div class="notif-delete" onclick="event.stopPropagation(); deletarNotificacao(${n.id})"><i class="ph ph-trash"></i></div>
        </div>
    `).join('');
}

function atualizarBadgeNotificacoes() {
    const badge = document.getElementById('notif-badge');
    if (notificacoesNaoLidas > 0) {
        badge.textContent = notificacoesNaoLidas;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

async function enviarSolicitacao() {
    const nick = document.getElementById('solicitacao-nick')?.textContent;
    const motivo = document.getElementById('motivo-solicitacao')?.value;
    if (!nick) return;
    
    try {
        const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY
            }
        });
        
        const dadosArray = await checkResponse.json();
        if (dadosArray && dadosArray.length > 0) {
            DADOS = dadosArray[0].conteudo;
        }
        
        const existente = DADOS.solicitacoes?.filter(s => s.nickname === nick && s.status === 'pendente');
        
        if (existente && existente.length > 0) {
            mostrarMensagem('error', 'Você já possui uma solicitação pendente. Aguarde a análise.');
            mostrarToast('Solicitação pendente', 'Aguarde a aprovação do administrador', 'warning');
            return;
        }

        const rejeitado = DADOS.solicitacoes?.filter(s => s.nickname === nick && s.status === 'rejeitada');
        
        if (rejeitado && rejeitado.length > 0) {
            const ultimo = rejeitado.sort((a, b) => new Date(b.data_processamento) - new Date(a.data_processamento))[0];
            mostrarMensagem('error', `Seu acesso foi negado. Motivos: ${ultimo.justificativa || 'não informado'}`);
            return;
        }
        
        if (!DADOS.solicitacoes) DADOS.solicitacoes = [];
        
        DADOS.solicitacoes.push({
            nickname: nick,
            motivo: motivo || '',
            status: 'pendente',
            data_solicitacao: new Date().toISOString()
        });
        
        if (!DADOS.usuarios) DADOS.usuarios = [];
        
        DADOS.usuarios.push({
            nickname: nick,
            cargo: 'Membro',
            status: 'pendente',
            data_registro: new Date().toISOString()
        });

        const admins = DADOS.usuarios?.filter(u => u.cargo === 'Admin' || u.cargo === 'DEV');
        
        if (admins && admins.length > 0) {
            if (!DADOS.notificacoes) DADOS.notificacoes = [];
            
            for (const admin of admins) {
                DADOS.notificacoes.push({
                    id: Date.now() + Math.random(),
                    usuario_nick: admin.nickname,
                    titulo: 'Nova Solicitação de Acesso',
                    mensagem: `${nick} solicitou acesso ao sistema.`,
                    tipo: 'info',
                    lida: false,
                    data_criacao: new Date().toISOString()
                });
            }
        }
        
        await salvarDados();
        
        mostrarMensagem('success', 'Solicitação enviada! Aguarde aprovação.');
        mostrarToast('Solicitação enviada', 'Aguarde a aprovação do administrador', 'success');
        
        const btn = document.getElementById('btn-solicitar');
        const input = document.getElementById('motivo-solicitacao');
        btn.disabled = true;
        btn.textContent = 'Aguardando aprovação';
        input.disabled = true;
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem('error', 'Erro ao enviar solicitação.');
        mostrarToast('Erro', 'Não foi possível enviar a solicitação', 'error');
    }
}

function init() {
    const usuarioSalvo = sessionStorage.getItem('usuario');
    if (usuarioSalvo) {
        try {
            const userData = JSON.parse(usuarioSalvo);
            
            const headerAvatar = document.getElementById('header-profile-avatar');
            const headerName = document.getElementById('header-profile-name');
            const headerRole = document.getElementById('header-profile-role');
            if (headerAvatar) headerAvatar.src = userData.avatar || '';
            if (headerName) headerName.textContent = userData.nickname || '';
            if (headerRole) headerRole.textContent = userData.cargo || '';
            
            const sidebarName = document.getElementById('profile-sidebar-name');
            const sidebarImg = document.getElementById('profile-sidebar-img');
            if (sidebarName) sidebarName.textContent = userData.nickname || '';
            if (sidebarImg) sidebarImg.src = userData.avatar || '';
            
            const profileNick = document.getElementById('profile-nickname');
            const profileCargoExecutivo = document.getElementById('profile-cargo-executivo');
            const profileCargoTag = document.getElementById('profile-cargo-tag');
            const profileAvatar = document.getElementById('profile-avatar-img');
            if (profileNick) profileNick.textContent = userData.nickname || '';
            if (profileCargoExecutivo) profileCargoExecutivo.textContent = userData.cargo_executivo || '';
            if (profileCargoTag) {
                if (userData.cargo === 'Admin') profileCargoTag.textContent = 'ADMIN';
                else if (userData.cargo === 'DEV') profileCargoTag.textContent = 'DEV';
                else if (userData.cargo === 'Membro') profileCargoTag.textContent = 'MEMBRO';
                else profileCargoTag.style.display = 'none';
            }
            if (profileAvatar) profileAvatar.src = userData.avatar || '';
            
            const drawerAvatar = document.getElementById('drawer-avatar-img');
            const drawerName = document.getElementById('drawer-name');
            const drawerRole = document.getElementById('drawer-role');
            if (drawerAvatar) drawerAvatar.src = userData.avatar || '';
            if (drawerName) drawerName.textContent = userData.nickname || '';
            if (drawerRole) drawerRole.textContent = userData.cargo || '';
            
            const avAvaliador = document.getElementById('av-avaliador');
            if (avAvaliador) avAvaliador.value = userData.nickname || '';
            const sindicanteNick = document.getElementById('sindicante-nick');
            if (sindicanteNick) sindicanteNick.value = userData.nickname || '';
            const ouvAutor = document.getElementById('ouv-autor');
            if (ouvAutor) ouvAutor.value = userData.nickname || '';
            
            document.getElementById('login-overlay').style.display = 'none';
            
            usuarioEncontrado = {
                nickname: userData.nickname,
                cargo: userData.cargo,
                cargo_executivo: userData.cargo_executivo,
                status: 'aprovado'
            };
            
            usuariosOnline.add(userData.nickname);
            atualizarVisibilidadeAdmin();
            carregarDados().then(() => {
                carregarNotificacoes();
                carregarBloqueios();
                carregarHorarios();
                carregarAtividades();
                iniciarAtualizacaoEmTempoReal();
            });
        } catch (e) {
            console.error('Erro ao carregar usuário salvo:', e);
            sessionStorage.removeItem('usuario');
        }
    }
    setupEventListeners();
}

function setupEventListeners() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', openDrawer);
    
    const drawerOverlay = document.getElementById('drawer-overlay');
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
    
    const formAvMensal = document.getElementById('form-av-mensal');
    if (formAvMensal) formAvMensal.addEventListener('submit', handleAvMensalSubmit);
    
    const formOuvidoria = document.getElementById('form-ouvidoria');
    if (formOuvidoria) formOuvidoria.addEventListener('submit', handleOuvidoriaSubmit);
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            setFilter(this.dataset.filter);
        });
    });
    
    document.addEventListener('click', function(event) {
        const notifCard = document.getElementById('notif-card');
        const notifDropdown = document.getElementById('notif-dropdown');
        if (!notifCard?.contains(event.target) && !notifDropdown?.contains(event.target)) {
            notifDropdown?.classList.remove('show');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    initLogin();
});
